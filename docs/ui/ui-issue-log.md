# UI Issue Log

Record user-visible UI defects found during implementation or review. Keep each entry actionable and update its status after the fix is checked.

## UI-001 — Provider badges remain in “Checking”

- **Area:** AI Settings → Keys & Connections
- **Observed:** The view requested `/api/ctx-app-agent/status`, but the API exposes provider status at `/api/ctx-app-agent`. The request returned 404 and left the provider badges in their initial “Checking” state.
- **Fix:** Changed the settings fetch to the implemented status route. The same status response now includes OpenAI ChatGPT OAuth configuration state without exposing token values.
- **Verification:** `npm run typecheck`, `npm run qa:docs`, and focused ESLint pass.
- **Status:** Fixed.

## UI-002 — OpenAI OAuth connection flow

- **Area:** AI Settings → OpenAI ChatGPT account
- **Observed:** No account link or reconnect controls existed in AI Settings.
- **Fix:** Added compact Astryx buttons, connection status, plan-scope status, a live model selector, and a disconnect action backed by local token revocation.
- **Verification:** Typecheck, docs QA, and focused ESLint pass. Browser consent and callback still require the user to run the local app and complete OpenAI authorization; no account has been linked in this implementation session.
- **Status:** Implemented; pending user authorization flow.


## UI-003 — OAuth callback failure message was not actionable

- **Area:** AI Settings → OpenAI ChatGPT account
- **Observed:** All callback failures displayed the same generic retry message, so a user could not distinguish a declined consent from a state, callback, token exchange, or identity verification failure.
- **Fix:** Callback redirects now carry a bounded reason code; the callback handler's diagnostic log records only the failure stage. Its code does not log callback URLs, authorization codes, state, verifiers, or tokens. AI Settings maps the reason code to a concise recovery message and removes it from browser history.
- **Verification:** `npm run typecheck` and focused ESLint pass.
- **Status:** Implemented; retry sign-in to identify the original failure cause.


## UI-004 — Same-machine callback hostname normalization rejected

- **Area:** AI Settings → OpenAI ChatGPT account
- **Observed:** Callback validation required the callback request host to equal the literal `127.0.0.1` host in the pending URI. A local server may expose the same loopback callback as `localhost` or `::1`; the previous comparison rejected that alias even when the callback remained local and used the same port and path.
- **Fix:** Validation now accepts loopback hostname aliases while still requiring HTTP loopback, the exact transaction port, and the exact callback path. A future port or path mismatch reports a separate recovery message.
- **Verification:** `npm run typecheck`, `npm run qa:docs`, and focused ESLint pass.
- **Status:** Fixed in code; user should retry sign-in.


## 2026-11-01 — Chat submit and account setup

- AI Chat Landing composer had a no-op submit handler, so submitting a prompt never created a conversation. The attached file chips were static fixture names and were not uploaded. Replaced them with actual `/api/documents` uploads and persisted conversation creation before navigation.
- Mission Control rendered an account-model configuration error when the OpenAI OAuth profile had no explicit model ID. The server now resolves the first available model from the connected account catalog; if the catalog request fails, its error is surfaced.
- The generated `/ai-chat` Astryx template contained fictional turns and artifact content. The route now redirects into CTX instead of exposing those fixtures; the app-owned chat view handles real transcript and output.
- Local OAuth credentials are stored in `~/.config/ctx-bank-pro`; `CTX_CONFIG_DIR` can pin the config path for dev environments with changing home directories. Production still needs an encrypted shared credential store and account-bound session model.

- Architecture briefly exposed an `App` area that let users browse general CTX components, routes, and content. Removed the area from the architecture tree and frontend filter; the repository resolver now only registers Agents and RAG sources.

- Verified the ChatGPT OAuth catalog and Responses stream against OpenAI’s Sign in with ChatGPT model and inference guidance. Model picker uses `/v1/models` account `models` and filters `visibility: list`; inference uses Responses API SSE and now requires `response.completed` before marking a turn complete.
- Screenshot 2026-11-01: ordinary chat responses stretched across the viewport while an empty Artifact panel occupied the right side. Workspace now starts closed, chat content is centered to a readable max width, and the panel opens only for validated structured widgets.
- Screenshot 2026-11-01: the assistant streamed visible text but CTX marked the turn interrupted because the OpenAI terminal event was not recognized reliably. The SSE parser now preserves split CRLF boundaries and checks both the SSE `event` field and the JSON event `type` for `response.completed`.
- Confirmed the terminal-event bug against the live local OAuth stream: the `response.completed` event carried `response.error: null`. The event Zod shape rejected `null` before setting completion. The parser now accepts nullable error content and recognizes the SSE event name as well as the JSON type. A short OAuth inference now completes successfully.


## 2026-11-02 — Interrupted run recovery and workspace sizing

- Screenshot 2026-11-01 showed assistant text followed by “Response interrupted” while the artifact pane duplicated the answer. The view now uses the persisted run event stream, stores each delta and terminal result, and reconnects by stable run ID after refresh. Browser disconnect leaves the server run active; a Stop action is available for explicit cancellation.
- The artifact pane now opens only when structured output exists, resizes with the Astryx `useResizable`/`ResizeHandle` controls, and switches to a full-width view below 768px. Ordinary answers remain centered at the existing 920px transcript width.
- Research answers display clickable source links, stored with the conversation’s run provenance. App Editor drafts are saved under the separate draft API; they do not reintroduce general application files into Architecture (Agents/RAG only).
- **Status:** Implemented; typecheck and persistence QA pass. Manual browser confirmation of resize, mobile, reconnect, and native OpenAI tool/research behavior remains pending.

- Sandbox check: React preview artifacts compile in a resource-limited worker; external imports fail. Preview runs only in a sandboxed opaque-origin iframe with scripts enabled, a restrictive CSP, and no network/form/frame permissions. Runtime error and startup timeout are reported in the workspace.
- Build check on 2026-11-02 found `/kanban-board` calling `stylex.create` without a compiler plugin. Replaced that small style block with equivalent CSS module and token styles; `npm run build` now passes.

## 2026-11-02 — Empty replies after workspace tool calls

- **Cause:** ChatGPT account SSE delivers completed items through `response.output_item.done`, while `response.completed.response.output` may be empty. The harness discarded streamed items, missed function calls, and failed with “OpenAI completed without returning response text.”
- **Fix:** Retain completed items in output-index order and use them when the terminal output array is empty. Recover message text from completed items when necessary. Tool calls now execute and return their results to the model for its follow-up answer.
- **Verification:** Live connected-account inference returned a greeting from `gpt-6.1-sol`. A second live harness run created a Markdown artifact in an isolated temporary workspace and returned a model-authored confirmation. No credentials were printed. Typecheck and workspace QA were run after the fix.

## 2026-11-02 — Existing chat visibility and document confirmation

- The running development server became unresponsive; restarted it on port 3000 and verified the user's exact chat URL in Chrome.
- Existing browser tabs did not refresh persisted chat history. Added refresh on the shared backend update event, preserving active streaming messages and rejecting stale polling results after local edits.
- A live browser retry created the requested “About the CTX Assistant” document. The model returned an artifact reference in its final envelope, which caused envelope validation to display raw JSON. Preserve validated answer text when optional metadata is invalid; artifact IDs remain assigned by the server tools.
- Normalized the verified saved confirmation to its original model-generated text. Historical failed attempts remain unchanged.
- Verification: Chrome landing submission returned a visible LLM greeting; the exact existing conversation completed a document tool call and displayed its document in the workspace. Typecheck passes.

## 2026-11-02 — Campaign launcher

- Added Astryx Dialog/DialogHeader, Selector, SegmentedControl, Button and token-based stack spacing. Uses actual corpus classifications; no unsupported HNW segment inferred.
- Desktop and 390px mobile browser checks rendered all 949 leads and clear permission holds; no horizontal overflow observed. No live batches were created during browser QA (enrollment tests use an in-memory database).
- Browser initially reported an empty development manifest; local server restarted. No app source workaround was introduced for that development-server error.
- Campaign preparation is implemented; production dispatch remains unavailable and is explicitly described in the UI.
