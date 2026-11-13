import { randomBytes, randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const CALLBACK_PATH = '/api/auth/openai/callback';
const REQUIRED_SCOPE = 'chatgpt.tokens.use.direct';
const folder = process.env.CTX_CONFIG_DIR ? path.resolve(process.env.CTX_CONFIG_DIR) : path.join(homedir(), '.config', 'ctx-bank-pro');
const registrationPath = path.join(folder, 'openai-registration.json');
const credentialsPath = path.join(folder, 'openai-chatgpt.json');
const pendingPath = path.join(folder, 'openai-oauth-pending.json');

export type OpenAIOAuthFailureStage = 'discovery' | 'callback' | 'callback-port' | 'callback-path' | 'state' | 'provider' | 'registration' | 'token' | 'identity' | 'account' | 'storage';
export class OpenAIOAuthError extends Error {
  constructor(public readonly stage: OpenAIOAuthFailureStage, message: string) { super(message); }
}

const discoverySchema = z.object({
  issuer: z.string(), authorization_endpoint: z.string().url(), token_endpoint: z.string().url(), revocation_endpoint: z.string().url(), jwks_uri: z.string().url(),
});
const registrationSchema = z.object({ clientId: z.string().min(1), hostId: z.string().min(1) });
const pendingSchema = z.object({
  state: z.string(), nonce: z.string(), verifier: z.string(), redirectUri: z.string().url(),
  clientId: z.string(), createdAt: z.number(), newRegistration: z.boolean(), hostId: z.string(),
});
const tokenResponseSchema = z.object({
  access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), id_token: z.string().min(1).optional(),
  token_type: z.string().default('Bearer'), expires_in: z.number().positive(), scope: z.string().optional(),
});
const credentialsSchema = z.object({
  clientId: z.string().min(1), hostId: z.string().min(1), issuer: z.literal(ISSUER), subject: z.string().min(1), email: z.string().email().optional(),
  idToken: z.string().min(1), accessToken: z.string().min(1), refreshToken: z.string().min(1), tokenType: z.string(),
  scopes: z.array(z.string()), expiresAt: z.number(),
});
const discoveryCache = { value: null as z.infer<typeof discoverySchema> | null };
let refreshInFlight: Promise<z.infer<typeof credentialsSchema>> | null = null;

async function readFileSchema<T>(file: string, schema: z.ZodType<T>): Promise<T | null> {
  try { return schema.parse(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('The local OpenAI sign-in record is invalid. Remove or repair it before reconnecting.');
  }
}
async function writePrivate(file: string, value: unknown): Promise<void> {
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await chmod(folder, 0o700);
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temporary, file);
  await chmod(file, 0o600);
}
async function discovery(): Promise<z.infer<typeof discoverySchema>> {
  if (discoveryCache.value) return discoveryCache.value;
  const response = await fetch(`${ISSUER}/.well-known/openid-configuration`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new OpenAIOAuthError('discovery', 'Could not load OpenAI OIDC discovery metadata.');
  const metadata = discoverySchema.parse(await response.json());
  if (metadata.issuer !== ISSUER || !metadata.authorization_endpoint.startsWith(`${ISSUER}/`) || !metadata.token_endpoint.startsWith(`${ISSUER}/`) || !metadata.revocation_endpoint.startsWith(`${ISSUER}/`) || !metadata.jwks_uri.startsWith(`${ISSUER}/`)) {
    throw new OpenAIOAuthError('discovery', 'OpenAI OIDC metadata did not match the expected issuer.');
  }
  discoveryCache.value = metadata;
  return metadata;
}
function isLoopback(url: URL): boolean {
  return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname);
}
function scopes(value: string | undefined): string[] { return value?.split(/\s+/).filter(Boolean) ?? []; }
function validState(expected: string, actual: string): boolean {
  const left = Buffer.from(expected); const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function getHostRegistration(): Promise<z.infer<typeof registrationSchema>> {
  const saved = await readFileSchema(registrationPath, registrationSchema);
  if (saved) return saved;
  const registration = { clientId: 'dynamic_agent_client', hostId: `urn:uuid:${randomUUID()}` };
  await writePrivate(registrationPath, registration);
  return registration;
}

export async function beginOpenAIChatGPTOAuth(redirectUri: string): Promise<string> {
  const callback = new URL(redirectUri);
  if (!isLoopback(callback) || callback.pathname !== CALLBACK_PATH) throw new Error('OpenAI sign-in requires an HTTP loopback callback at the CTX callback path.');
  const registration = await getHostRegistration();
  const newRegistration = registration.clientId === 'dynamic_agent_client';
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  await writePrivate(pendingPath, { state, nonce, verifier, redirectUri: callback.toString(), clientId: registration.clientId, createdAt: Date.now(), newRegistration, hostId: registration.hostId });
  const metadata = await discovery();
  const authorization = new URL(metadata.authorization_endpoint);
  const params: Record<string, string> = {
    client_id: registration.clientId,
    ext_agent_host_id: registration.hostId,
    response_type: 'code',
    redirect_uri: callback.toString(),
    scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
    resource: RESOURCE,
    state,
    nonce,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  };
  if (newRegistration) params.agent_name_hint = 'CTX Knowledge Network';
  for (const [key, value] of Object.entries(params)) authorization.searchParams.set(key, value);
  return authorization.toString();
}

async function exchangeToken(body: Record<string, string>): Promise<z.infer<typeof tokenResponseSchema>> {
  const metadata = await discovery();
  const response = await fetch(metadata.token_endpoint, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body),
    cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`OpenAI token exchange failed (HTTP ${response.status}). Start a new sign-in attempt.`);
  return tokenResponseSchema.parse(await response.json());
}

export async function finishOpenAIChatGPTOAuth(callbackUrl: URL): Promise<void> {
  if (!isLoopback(callbackUrl) || callbackUrl.pathname !== CALLBACK_PATH) throw new OpenAIOAuthError('callback', 'The OpenAI callback must use the configured loopback URL.');
  const pending = await readFileSchema(pendingPath, pendingSchema);
  if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) throw new OpenAIOAuthError('state', 'The sign-in attempt expired. Start again from AI Settings.');
  const returnedState = callbackUrl.searchParams.get('state') ?? '';
  if (!validState(pending.state, returnedState)) throw new OpenAIOAuthError('state', 'The OpenAI callback state did not match. Start sign-in again.');
  const expected = new URL(pending.redirectUri);
  if (!isLoopback(expected)) throw new OpenAIOAuthError('callback', 'The saved callback is not a local loopback address.');
  if (expected.port !== callbackUrl.port) throw new OpenAIOAuthError('callback-port', 'The OpenAI callback arrived on a different local port than the sign-in request.');
  if (expected.pathname !== callbackUrl.pathname) throw new OpenAIOAuthError('callback-path', 'The OpenAI callback path did not match the sign-in request.');
  const oauthError = callbackUrl.searchParams.get('error');
  if (oauthError) { await unlink(pendingPath).catch(() => undefined); throw new OpenAIOAuthError('provider', oauthError === 'access_denied' ? 'OpenAI sign-in was cancelled or permission was declined.' : `OpenAI sign-in returned ${oauthError}.`); }
  const code = callbackUrl.searchParams.get('code');
  if (!code) throw new OpenAIOAuthError('provider', 'OpenAI did not return an authorization code.');
  const returnedClientId = callbackUrl.searchParams.get('client_id');
  let clientId = pending.clientId;
  if (pending.newRegistration) {
    if (!returnedClientId || returnedClientId === 'dynamic_agent_client') throw new OpenAIOAuthError('registration', 'OpenAI did not return the issued client ID. Registration is incomplete.');
    clientId = returnedClientId;
  } else if (returnedClientId && returnedClientId !== pending.clientId) {
    throw new OpenAIOAuthError('registration', 'OpenAI returned a different client ID than the saved registration.');
  }
  let tokens: z.infer<typeof tokenResponseSchema>;
  try { tokens = await exchangeToken({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: pending.verifier, redirect_uri: pending.redirectUri, resource: RESOURCE }); }
  catch { throw new OpenAIOAuthError('token', 'OpenAI rejected the token exchange or the token endpoint was unavailable.'); }
  if (!tokens.id_token) throw new OpenAIOAuthError('identity', 'OpenAI did not return an ID token.');
  let verified: Awaited<ReturnType<typeof jwtVerify>>;
  try {
    const metadata = await discovery();
    const keySet = createRemoteJWKSet(new URL(metadata.jwks_uri));
    verified = await jwtVerify(tokens.id_token, keySet, { issuer: ISSUER, audience: clientId, requiredClaims: ['sub', 'exp', 'iat'] });
  } catch { throw new OpenAIOAuthError('identity', 'OpenAI ID-token signature, issuer, or audience verification failed.'); }
  if (verified.payload.nonce !== pending.nonce) throw new OpenAIOAuthError('identity', 'The OpenAI ID-token nonce did not match.');
  const prior = await readFileSchema(credentialsPath, credentialsSchema);
  if (prior && prior.subject !== verified.payload.sub) throw new OpenAIOAuthError('account', 'This OpenAI registration belongs to a different account. Disconnect it before linking another account.');
  const account = credentialsSchema.parse({
    clientId, hostId: pending.hostId, issuer: ISSUER, subject: verified.payload.sub,
    ...(typeof verified.payload.email === 'string' ? { email: verified.payload.email } : {}),
    idToken: tokens.id_token, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? prior?.refreshToken,
    tokenType: tokens.token_type, scopes: scopes(tokens.scope ?? callbackUrl.searchParams.get('scope') ?? undefined), expiresAt: Date.now() + tokens.expires_in * 1000,
  });
  try {
    await writePrivate(credentialsPath, account);
    await writePrivate(registrationPath, { clientId, hostId: pending.hostId });
  } catch { throw new OpenAIOAuthError('storage', 'CTX could not write the private local OpenAI credential file.'); }
  await unlink(pendingPath).catch(() => undefined);
}

export async function openAIChatGPTOAuthStatus() {
  const account = await readFileSchema(credentialsPath, credentialsSchema);
  return account ? { connected: true, email: account.email ?? null, canUsePlan: account.scopes.includes(REQUIRED_SCOPE), scopes: account.scopes, expiresAt: account.expiresAt } : { connected: false, email: null, canUsePlan: false, scopes: [], expiresAt: null };
}

async function refresh(account: z.infer<typeof credentialsSchema>) {
  const tokens = await exchangeToken({ grant_type: 'refresh_token', client_id: account.clientId, refresh_token: account.refreshToken, resource: RESOURCE });
  const updated = credentialsSchema.parse({ ...account, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? account.refreshToken, idToken: tokens.id_token ?? account.idToken, tokenType: tokens.token_type, scopes: scopes(tokens.scope ?? account.scopes.join(' ')), expiresAt: Date.now() + tokens.expires_in * 1000 });
  await writePrivate(credentialsPath, updated);
  return updated;
}

async function refreshSerialized(account: z.infer<typeof credentialsSchema>) {
  if (!refreshInFlight) refreshInFlight = refresh(account).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export async function openAIChatGPTAccessToken(): Promise<string> {
  let account = await readFileSchema(credentialsPath, credentialsSchema);
  if (!account) throw new Error('Connect a ChatGPT account in AI Settings before using this OpenAI model.');
  if (!account.scopes.includes(REQUIRED_SCOPE)) throw new Error('The connected account did not grant ChatGPT plan inference. Reconnect and approve the plan usage scope.');
  if (account.expiresAt < Date.now() + 60_000) account = await refreshSerialized(account);
  return account.accessToken;
}

export async function openAIChatGPTModels(): Promise<{ id: string; name: string }[]> {
  const token = await openAIChatGPTAccessToken();
  const response = await fetch(`${RESOURCE}/models`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Could not load ChatGPT models (HTTP ${response.status}).`);
  const payload: unknown = await response.json();
  const parsed = z.object({ models: z.array(z.object({ slug: z.string(), display_name: z.string(), visibility: z.string() })).optional() }).safeParse(payload);
  if (!parsed.success || !parsed.data.models) throw new Error('OpenAI returned an unsupported model catalog.');
  return parsed.data.models.filter(model => model.visibility === 'list').map(model => ({ id: model.slug, name: model.display_name }));
}

export async function removeOpenAIChatGPTCredentials(): Promise<void> {
  const account = await readFileSchema(credentialsPath, credentialsSchema);
  if (account) {
    const metadata = await discovery();
    const response = await fetch(metadata.revocation_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: account.refreshToken, token_type_hint: 'refresh_token', client_id: account.clientId }), cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`OpenAI session revocation failed (HTTP ${response.status}); local credentials were retained.`);
  }
  await unlink(credentialsPath).catch((error: unknown) => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
}
