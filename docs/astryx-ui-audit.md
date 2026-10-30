# Astryx UI migration audit

## Design direction

The Knowledge Bank is a dense, operational workspace. The Astryx `Incident Console`
and `Grouped Table` patterns are the appropriate structural references: a persistent
application shell, concise navigation, an analytical canvas, and a resizable detail
surface. The selected global system is the maintained `neutral` theme in dark mode.

## Existing UI to Astryx allocation

| Current surface | Current implementation | Astryx allocation | Migration intent |
| --- | --- | --- | --- |
| Application frame | fixed `.rail` and `.topbar` | `AppShell`, `TopNav`, `SideNav` | Make navigation responsive, collapsible, and semantically navigable. |
| Primary view selection | icon-only rail buttons | `SideNavItem`, `SideNavSection` | Preserve Dashboard, Knowledge Bank, Sources, and extension docs destinations. |
| Graph renderer selector | `.graph-view-switch` buttons | `SegmentedControl` | Keep the 2D/3D state as a mutually exclusive, accessible selection. |
| Global graph search | custom dialog and keyboard handler | `CommandPalette` + `createStaticSource` | Retain graph search and add bootstrapped navigation commands. |
| Dashboard metrics | `Panel` metric cards | `ClickableCard`, `Card`, `CardTitle` | Preserve quick navigation while using clear card semantics. |
| Status and counts | custom badges and dots | `Badge`, `StatusDot`, `Token` | Standardize state meaning and avoid decorative badges. |
| Source records | custom table buttons | `Table`, `TableRow`, `TableCell`, `EmptyState` | Preserve dense, edge-to-edge data rows and empty guidance. |
| Node inspector | custom sidebar sections | `Layout`, `MetadataList`, `Markdown`, `Outline` | Keep graph metadata while adding readable node documentation and in-panel navigation. |
| Document upload | custom dialog and buttons | `Dialog`, `FileInput`, `Button`, `Banner` | Keep drag/drop behavior while standardizing the flow. |
| Overflow actions | absent / bespoke inline controls | `DropdownMenu`, `ButtonGroup` | Provide room for view and node actions without crowding the toolbar. |

## Initial implementation priorities

1. Apply `neutralTheme` and base Astryx CSS globally.
2. Replace the graph search overlay with Astryx `CommandPalette`.
3. Replace the 2D/3D controls with `SegmentedControl`.
4. Introduce Astryx `Markdown` and `Outline` to the node inspector.
5. Use `EmptyState` for zero-result and zero-source states.
6. Migrate the frame and dashboard cards after these behavior-critical elements are verified.

## Implemented in the first overhaul pass

- `Theme` + `neutralTheme` and Astryx reset/base/theme styles are applied at the root in dark mode.
- The shared `Button`, `IconButton`, `Badge`, `Panel`, and `Skeleton` adapters now render Astryx `Button`, `IconButton`, `Badge`, `Card`, and `Skeleton` respectively, preserving existing behavior at all existing call sites.
- The application rail is an Astryx `SideNav` with `SideNavHeading`, `SideNavSection`, and `SideNavItem` entries.
- The global search overlay is an Astryx `CommandPalette` backed by the existing weighted graph search and navigation commands.
- The renderer switch is an Astryx `SegmentedControl`; its map/3D state remains owned by the existing graph view.
- Dashboard metrics use `ClickableCard` plus a semantic Astryx `Heading` (the catalog does not expose a standalone `CardTitle` component).
- The top bar uses Astryx `Button`, `ButtonGroup`, and `DropdownMenu` for graph and view actions.
- Node inspector descriptions use Astryx `Markdown`; in-panel section navigation uses Astryx `Outline`.
- Empty source and document states use Astryx `EmptyState` with next-step guidance.

## Guardrails

- Keep `react-force-graph` and Netron rendering unchanged; these are application behavior, not UI primitives.
- Preserve existing graph-store actions and API polling.
- Use Astryx tokens and component props for new styling. Avoid new raw color or pixel values.
- Keep source lists as dense rows, not nested cards.
