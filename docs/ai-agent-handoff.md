# CTX App Agent and AI Settings

## Decisions

- `ctx-app-agent` is a separate application assistant. It does not call the ASP outreach orchestrator.
- Chat requests use a server-side provider adapter. Provider keys and base URLs are read from environment variables and never returned to the browser.
- OpenRouter, OpenAI, Anthropic API keys, Ollama, and OpenAI-compatible endpoints are supported by the router. Model IDs are configured in AI Settings or by environment fallback.
- AI preferences are stored in browser local storage; no credentials are stored there.
- Generative widget payloads are validated before rendering. App Editor accepts component, non-API route, and content files from the architecture allowlist.
- App Editor saves version-checked drafts under `data/architecture-drafts`. It does not write generated content into the source file.
- OpenAI ChatGPT account linking uses the official open-source SIWC Authorization Code + PKCE flow with dynamic client registration and a loopback callback. It validates state, nonce, JWKS signatures, account identity, and the granted inference scope before enabling ChatGPT plan calls. Tokens are stored mode 0600 under `~/.config/ctx-bank-pro/`; no OAuth client secret is used. The callback is local-only.
- ChatGPT plan inference uses the OpenAI Responses API with `store: false` and `stream: true`, and requires the `chatgpt.tokens.use.direct` scope. It does not read ChatGPT conversations or expose API keys.
- Anthropic API Workload Identity Federation is not a Claude consumer sign-in flow. OpenRouter and Anthropic account linking remain provider-specific work.
- ASP Private Capital is described as a capital introducer and private-market liaison, never an adviser.

## Setup

Store server credentials in `.env.local`:

```dotenv
OPENROUTER_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_COMPATIBLE_BASE_URL=
OPENAI_COMPATIBLE_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434/v1
CTX_APP_AGENT_PROVIDER=
CTX_APP_AGENT_MODEL=
OPENAI_OAUTH_MODEL=
```

Model IDs are provider-specific and must be selected in `/?view=ai-settings` or supplied through the provider-specific model environment variable. ChatGPT OAuth models are loaded from the connected account. API keys, when used, belong in `.env.local`; the OAuth token file stays under the current user's config directory.

## Verification

Typecheck, documentation QA, focused ESLint, and `git diff --check` pass. OpenAI OAuth requires the local CTX server to remain running on the port used to start sign-in until the loopback callback completes. Account eligibility and the plan inference scope are determined by OpenAI during consent.
