# CTXBANKPRO build checkpoint — 28 July 2026

## Purpose

This is the baseline handover for the World Creators CTXBANKPRO workspace. Treat the current build as a stable UI and interaction checkpoint. New work must extend these patterns rather than replace or bypass them.

## Product position

- **Product:** CTXBANKPRO, an agentic contextual engineering and agent-service platform.
- **Client workspace:** World Creators.
- **Primary surfaces:** Home Dashboard, Knowledge Bank, Documents & Sources, and CTXBANKPRO documentation.
- **Brand assets:** `public/assets/light-ctx.svg` for dark surfaces, `public/assets/dark-ctx.svg` for light surfaces, and `public/assets/CTXBANK.svg` for the boot sequence.

## Major work completed

### Application shell and navigation

- Rebuilt the shell around an AWS-console-like structure: a fixed global header, a collapsible Services panel below it, and a workspace that shifts smoothly with the panel.
- Sidebar defaults to closed and completely leaves the interaction surface when closed.
- Standardised the shared application and documentation header height to `--topbar-height` (68px).
- Aligned the left brand, Services action, global search, utilities, organisation profile tag, and appearance preference control.
- Removed redundant search and identity controls, duplicate card titles, and unnecessary page headings.
- Sidebar destinations are consistently named **Home Dashboard**, **Knowledge Bank**, and **Documents & Sources**.

### Design system and interface standards

- Installed and adopted `@astryxdesign/core`, `@astryxdesign/theme-neutral`, and the Astryx CLI.
- Added Tailwind/shadcn infrastructure only to support Dither Kit, with the existing CTXBANKPRO semantic tokens restored after setup.
- Installed Dither Kit’s composable Area Chart and placed one low-bloom document-processing distribution chart in the existing dashboard panel. The kit is reserved for data visualisation rather than general interface primitives.
- Added the binding UI rulebook at `docs/ui-rulebook.md` and project guidance in `AGENTS.md`.
- Normalised component radius, typography, spacing, control heights, icon/text alignment, and button composition.
- Replaced ad-hoc modal patterns with Astryx `Dialog`/`DialogHeader`; use Astryx controls for actions, navigation, status, and segmented selection whenever available.

### Theme system

- Added a persisted **System / Dark / Light** appearance preference in both application and documentation headers.
- Stores the user choice under `ctxbankpro:theme-preference` and resolves System from `prefers-color-scheme`.
- Applies the saved choice before React hydration through the root layout script.
- Kept theme ownership at the document level to prevent route changes or a nested provider from resetting the preference.
- Light mode uses the softer application background `#F7F8FA`; cards remain a separate white surface.

### Knowledge graph

- Rebuilt the Knowledge Bank graph as an Obsidian-inspired interactive canvas using `d3-force` and Canvas 2D.
- Supports 2D map and 3D graph states, smooth pan/zoom, node dragging, hover/selection neighbourhood focus, labels, and persistent per-session views.
- Ensured controls are visible in both states, cursor changes only over interactive nodes/canvas states, and a permanent return-to-graph action is available.
- Preserved visual context across graph-state and orientation changes; no snap-to-fit reset during normal interaction.
- The full graph canvas has its own theme-aware surface. The compact dashboard graph preview deliberately inherits its enclosing card surface, so it never appears as a darker inset panel.

### Documentation and loading experience

- Updated documentation to CTXBANKPRO for World Creators and moved the Astryx Outline pattern into the documentation-side navigation.
- Restored the original CTXBANKPRO loading logo and made it legible in light mode without using an external/nested SVG dependency.

## UI/UX non-negotiables

1. **Astryx first.** Run `npx astryx build "<task>"` before new UI work and inspect the selected component APIs. Do not rebuild an Astryx primitive by hand.
2. **One sizing system.** Similar controls in the same row or region use the same height, radius, typography, and spacing tokens. Do not tweak a peer control in isolation.
3. **Buttons are always one row.** Every text button is `{ICON} + label`, non-wrapping, with the icon and label horizontally aligned.
4. **One title per component.** Do not stack duplicate headings, labels, or eyebrow text that restates the same title.
5. **No all-caps or font drift.** Use `var(--font-sans)` and normal case unless data/code semantics require otherwise.
6. **No abrupt UX.** Zoom, pan, canvas recovery, sidebar movement, selection, loading, and empty states must use short continuous easing and preserve the current user context.
7. **Canvas isolation.** Graph transforms affect the graph only—never page layout, header utilities, graph controls, or adjacent widgets.
8. **Theme is universal.** System/Dark/Light must persist across reloads and all routes. Components must derive colours from the shared theme state or semantic tokens.
9. **Surface context matters.** Full canvases may own their surface; embedded previews must match their parent card/panel unless intentionally framed.
10. **Accessibility is part of completion.** Icon-only controls need labels, overlays use Astryx dialogs, and interactive assets must have a real action.
11. **Dither Kit is chart-only.** Use it for composable visualisation where it adds signal; retain Astryx and established project primitives around it.

## Guardrails for future changes

### Before implementation

1. Read `AGENTS.md` and `docs/ui-rulebook.md`.
2. Identify the affected shell region, peer controls, colour mode, responsive behaviour, and state transitions.
3. Run Astryx discovery and use the existing `src/components/ui/` adapters before introducing a new wrapper.
4. Check whether the component already exists in the dashboard, graph, documents, or documentation surface. Reuse it when its behaviour is the same.

### During implementation

- Use project tokens such as `--topbar-height`, `--control-height`, `--control-height-compact`, `--layout-gap`, and `--radius` rather than one-off visual values.
- Keep state ownership explicit. Theme belongs to `src/components/ui/astryx-theme-provider.tsx`; graph interaction state belongs to the graph components/store; layout shell state belongs to `knowledge-app.tsx`.
- Do not read client-only values during SSR render when they can alter rendered attributes or markup. Resolve theme before hydration, then reconcile through the shared client store.
- Scope CSS intentionally: use a compact-preview selector for preview-only effects rather than changing the full graph canvas.
- Preserve current graph view state when switching modes, directions, routes, or side-panel states.

### Before handoff

1. Inspect all nearby controls at desktop and narrow widths: alignment, wrapping, clipping, overflow, focus, and light/dark appearance.
2. Exercise state transitions: open/close Services, navigate routes, switch theme, reload, toggle graph mode, zoom/pan/select, and open/close overlays.
3. Run:

   ```bash
   npm run typecheck
   npm run lint
   npm run build
   ```

4. Use the user-provided development server for visual checks; do not launch a duplicate server.
5. Record any deliberate exception to this checkpoint in the task handoff, including why it is necessary and which existing rule it affects.

## High-value files

| Area | Source of truth |
| --- | --- |
| UI rules | `docs/ui-rulebook.md` |
| Agent project guidance | `AGENTS.md` |
| App shell | `src/components/network/knowledge-app.tsx` and `src/app/globals.css` |
| Theme persistence | `src/app/layout.tsx` and `src/components/ui/astryx-theme-provider.tsx` |
| Theme selector and brand | `src/components/ui/theme-switch.tsx` and `src/components/ui/theme-aware-brand.tsx` |
| 2D graph | `src/components/network/knowledge-graph-2d.tsx` |
| 3D graph | `src/components/network/neural-graph.tsx` |
| Documentation | `src/app/extension/` and `src/content/extension-docs.ts` |

## Recommended feature workflow

For a new full-stack feature, define its user outcome and states first, then add the backend/data contract, followed by a single Astryx-aligned UI surface. Integrate it into the existing shell and theme provider, add loading/error/empty states, and validate it against this checkpoint before expanding to secondary surfaces.
