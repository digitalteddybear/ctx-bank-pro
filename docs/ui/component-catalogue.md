# CTX component catalogue

## Backend integration update — 1 November 2026

Chat, inbox, repository/IDE and inspector integrations are recorded in
[`backend-mapping-handoff.md`](backend-mapping-handoff.md), including source
paths, API contracts, draft storage, shared polling, verification and known
project-wide build/lint blockers. Status: integrated; general chat execution
remains instruction intake because no execution handler exists in the backend.

## shadcn MCP tooling

- Installed with `npx shadcn@latest mcp init --client codex` (shadcn 4.23.0).
- Registered in Codex as `shadcn`, using the installed local executable and
  explicit CTX app working directory. Restart Codex to load the tools.
- Tags: tooling, registry, discovery, templates, audit.
- Verified MCP handshake and seven discovery/example/install-command/audit tools.
- Use to inspect incoming templates; review proposed file overwrites and map
  styles to Astryx tokens before integration. MCP does not automatically enforce
  padding, theme consistency or compatibility. Existing Astryx UI rules apply.

## Thinking Orbs

- Source command: `npm install thinking-orbs`
- Installed version: 0.3.2; licence: MIT
- Tags: agents, state, animation, canvas, accessible-label
- Adapter: `src/components/agents/agent-state-orb.tsx`
- Intended location: agent activity rows and run details in incoming templates.
- Status: adapter available; dashboard placement pending supplied templates.
- Inputs: persisted workflow `status`, `stage`, optional `staticOnly`.
- Active stages: prospect → searching; outreach → composing; conversation and
  compliance → solving; deliverability and dispatch → connecting.
- Waiting/stopped states use an Astryx StatusDot and accurate readable label.
- Theme follows the app's existing `data-theme`. Package handles reduced motion,
  offscreen suspension and animation cleanup. Cursor gravity is disabled.
- Static fallback: `staticOnly`; readable status remains when canvas is unavailable.
- Astryx discovery: build agent state indicator; inspected HStack, Text, StatusDot.
- Narrow exception: thinking-orbs renders the requested canvas visual; Astryx
  continues to provide surrounding layout and status text.

## Incoming component record

For each supplied component record title, exact source/install command, pinned
version, licence, purpose, destination, tags, dependencies, changed files,
verification results and status (received / installed / adapted / integrated).
Review overwrites and dependency advisories before installation. Group templates
by dashboard area under `src/components/templates/`; use `src/components/ui/`
for reusable controls and `src/components/agents/` for agent visuals.

## Integration checks

For each integrated area verify both themes, desktop and mobile, keyboard access,
readable state labels, reduced motion, and existing workflows. Run typecheck,
lint and webpack build in a directory not used by a running preview. Use offline
workflow QA; the interactive live demo can send email and is not an automatic test.

## Dependency audit

Audit during setup found no thinking-orbs advisory. Full npm audit reports 10
moderate development dependency findings propagated from minimatch
(GHSA-g3hv-75wg-m249). Installed minimatch 10.2.6 is the latest version 10;
the latest ESLint still requires ^10.2.6. The advisory fixes start at 11.0.1.
No compatible patch is currently available in that range. A major override needs
separate compatibility testing; no forced downgrade or override was applied.

For isolated builds use `CTX_BUILD_DIR=.next-ui-check npm run build` so the active
preview's output is preserved. Pending: browser checks when templates are supplied
and the adapter is placed in the dashboard.

## Reply template preview dialog

- Adapter: `src/components/network/reply-template-preview-dialog.tsx`.
- Uses installed Astryx Dialog, DialogHeader, Grid, VStack, TextArea and Text; CLI build/component documentation inspected.
- Shared by Campaign and Live Demo. Desktop split editor/preview; narrow screens stack the panes in a scrollable body.
- Render beside the parent dialog to keep Escape dismissal local to the preview.
- Server preview uses the same sanitizer as outgoing replies. Missing message placeholders show guidance while preserving layout preview; save remains validated.
- Browser verified editing, Escape, save feedback, and 390px layout; isolated production build passed.

### AI settings save
- Existing Models, Reasoning and Planning sections retain their layout and Astryx controls.
- Added small primary Save and inline status, with Toast confirmation/error. CLI build and Button reference consulted.
- Server-backed settings use revision conflict checks; chat consumes saved values.
- Desktop browser verification: save, reload restoration and visible stale-tab conflict; no page errors. No provider calls made by configuration-save tests.

### Notification settings and source review
- Existing Settings email/desktop groups use Astryx Card, Stack, Switch, Selector and Icon; Save feedback uses Toast.
- Quiet-hour custom inputs use validated HH:MM text and an IANA time zone.
- Source Review uses Astryx Dialog, DialogHeader and TextArea with existing named preview dimensions.
- Mobile Settings replaces the fixed sidebar with a section selector; desktop structure is preserved.
- CLI build, Dialog, TextInput, TextArea and useMediaQuery references consulted. Desktop/mobile browser source-review and notification-save tests pass.
- Post-patch preview soak: 12 consecutive real preview edits passed on the active app; settings-save mocking is independently isolated from store persistence tests.

Campaign → Cohort uses two small Astryx NumberInput controls inside the existing campaign card. Daily openings sets the sender’s opening-message limit. Daily total includes openings, replies and follow-ups. Save persists both values for the worker.
