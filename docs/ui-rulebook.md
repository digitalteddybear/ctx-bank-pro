# Context Bank UI Rulebook

This is the binding implementation standard for every new or changed interface in Context Bank. It supplements `AGENTS.md`; where they differ, the stricter rule applies.

## 1. Astryx first

Before writing or changing UI, run `npx astryx build "<task>"` and inspect every component that may be used with `npx astryx component <Name>`.

Use Astryx components for all interactive and structural UI:

- Actions: `Button`, `IconButton`, `ButtonGroup`, `DropdownMenu`.
- Navigation: `SideNav`, `Outline`, `SegmentedControl`.
- Overlays: `Dialog` and `DialogHeader`; never hand-roll a backdrop, portal, modal, or focus management.
- Entity/category labels: `Token`; statuses/counts: `Badge` or `StatusDot`.
- Content containers: `Card`, `ClickableCard`, `EmptyState`, `Skeleton`.

Do not create replacement primitives when an Astryx component exists. If no suitable component exists, record the reason in the PR/task handoff before creating a scoped adapter in `src/components/ui/`.

### Dither Kit exception

`src/components/dither-kit/` is an approved, narrowly scoped exception for composable data visualisation. Use it only for charts, dithered chart-adjacent controls, avatars, or gradients explicitly suited to the feature. Keep the surrounding layout, cards, actions, overlays, typography, and status UI on Astryx/project primitives. Do not use newly available shadcn primitives to replace established application primitives.

## 2. Tokens and dimensions

Use an existing semantic token or a named project token. Never introduce one-off spacing, radius, font-size, color, or height values in a component.

The console header is the exception with a fixed structural contract:

| Element | Required size |
| --- | --- |
| Global header | 68px high (`--topbar-height`) |
| Header horizontal padding | 16px |
| Header control height | 38px (`--control-height`) |
| Left-group gap | 12px |
| Right-group gap | 4px |
| Divider | 1px × 16px |
| Search lane | 38px high, 672px maximum |
| Primary text | 12px |
| Supporting text | 10px |

All controls sharing a row must use the same height token. A new control may not visually introduce a new radius, height, or padding system.
Peer widgets in the same toolbar, header, or aligned action row must use the exact same height token. This includes segmented controls, search controls, and buttons; adjust the entire peer group to a shared token, never one component in isolation.

The System / Dark / Light preference control is a shared header asset. It must be present and function identically in both the application and documentation headers.

Motion must be short, eased, and continuous. Never directly assign a visual state that changes zoom, pan, focus, layout, loading, or empty-state visibility when an animated transition can communicate it; preserve the user’s visual context and animate the complete change together.

Theme preference is application state, not page state. Persist it using `ctxbankpro:theme-preference`; apply it before hydration; do not introduce a second theme synchroniser that can mutate `html[data-theme]`.

Text buttons are a single, non-wrapping horizontal asset: `{ICON} + label`. Use the shared `Button` wrapper, which supplies the required `.button__content` row. Do not add a text button that stacks, wraps, or separates its icon and label into different rows.

## 3. Shape, spacing, and type

- Use the global `--radius` and Astryx component shape defaults. Do not set per-component border radii unless the component API explicitly supports it.
- Use the established `--layout-gap` and named control-height tokens for application layout. Do not tune individual controls by eye.
- Use `var(--font-sans)` and normal case. Do not use new monospace, uppercase, or capitalization treatments for application UI.
- Content spacing belongs to the component/container. Avoid spacer elements and manual nested layout wrappers.

## 4. Layout and responsiveness

- Start with the page shell and region budget before content.
- Define a desktop and narrow-screen behavior for every new region.
- Hidden panels must animate both their own transform and the affected layout offset with the same duration/easing.
- Fixed regions must reserve their occupied space through the corresponding layout token; no overlap is acceptable unless it is an Astryx overlay.
- Keep titles singular: one primary title per card/widget. Do not add an eyebrow that repeats the title’s meaning.

## 5. Accessibility and behavior

- Every icon-only control requires a meaningful label.
- Buttons must trigger an action; use `Token` only for entity/category interaction and `Badge` only for passive status/counts.
- Use Astryx Dialog for modal interaction. It must have a concise title and its built-in dismissal behavior must match the task.
- Do not render keyboard shortcuts as decorative text; use a `kbd` element or the supplied Astryx pattern.

## 6. Mandatory change checklist

Before handing off a UI change:

1. Run the Astryx discovery command and document the selected component(s) in the change notes when introducing new UI.
2. Verify all peer controls in the same row have equal heights, consistent radius, and aligned icon/text baselines.
3. Check desktop and mobile layout; verify no clipping, overlap, horizontal overflow, or wrapped control labels.
4. Run `npm run typecheck`, `npm run lint`, and `npm run build`.
5. Do not start a local server if the user has already provided one; use their active instance for visual validation when needed.
6. Never run `next build` into the output directory of a running production preview. Stop that preview before building, restart it after the build completes, and run browser verification against the restarted server. Confirm that CSS, JavaScript, and font requests succeed; a successful build alone does not verify the running preview.
