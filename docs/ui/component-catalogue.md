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
