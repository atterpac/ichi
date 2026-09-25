# Frontend styles

Styles are global but organized by ownership. Import order is explicit in
`src/main.ts`; keep feature-specific responsive rules in the same file as the
feature rather than adding them to `shell.css`.

- `tokens.css` and `themes.css`: palette and derived design tokens.
- `base.css`: element defaults shared by the entire application.
- `primitives.css`: reusable controls such as `UiButton`.
- `shell.css`: title bar, page frame, placeholders, and modeline only.
- `states.css`: shared loading, empty, success, and error states.
- `views/`: styles owned by a primary application surface.
- `overlays/`: settings, menus, toasts, and Finder.

Prefer a shared primitive when interaction chrome repeats. Keep coordinated
layouts such as graph rows/canvas or diff columns global within their feature
file; isolated components may still use scoped Vue styles.

## Surface and elevation roles

Use `--surface-base` for window chrome, `--surface-panel` for primary lists/tables,
`--surface-raised` for docked inspectors, and `--surface-overlay` for floating
menus, Finder, and dialogs. `--read-bg` aliases the raised surface for existing
reading panes. Avoid using `--surface-2` as a general elevation: some light
palettes define it as a darker control background.

The generator emits raised/overlay colors and `--elev-1/2/3` per theme. Light
palettes approach white with elevation; dark palettes become lighter. Small
muted text is tuned to at least 4.5:1 on all four generated surfaces. Elevation 1
is for controls, 2 is a restrained docked-panel shadow, and 3 is for overlays.
Use `--line-faint` for internal separators and `--border` between surfaces.

Typography roles use `--font-ui`, `--font-mono`, and the `--fs-*` scale;
`--font-title` is the larger commit inspector heading. Graph row heights are
owned by `components/graph/rowDensity.ts` and shared by the canvas and table
through `--graph-row-height`. Change those together, not with independent CSS
height overrides.

Component sizing, spacing, and review criteria are documented in
[COMPONENT_RUBRIC.md](./COMPONENT_RUBRIC.md), with a versioned Galaxy DLS comparison.

Use `UiButton`, `UiIconButton`, and `UiInput` for actions and text fields.
Native select/textarea controls use `ui-field` plus `size-sm`/`size-lg` when
needed; medium is the default. Feature CSS owns layout, not control height or
padding. Keep geometry exceptions listed in the rubric. Open `/components.html`
on the dev server to inspect production components in different themes.

Fonts are bundled by `fonts.css` (Inter Variable and JetBrains Mono); licensing
files ship under `/fonts/`. Keep app and gallery entry points importing it.
Graph colors come from generated `--lane-0` through `--lane-4`, shared between
canvas and refs. `CommitDetail.vue` is the production inspector used by both the
graph view and component gallery; its actions emit events to the service owner.

The graph working-tree inspector uses `WorkingTreePane.vue`: directory groups,
a file-weighted selection map, and navigation into Changes. `worktreeHeat.ts`
combines staged/unstaged diff counts without duplicating partially staged files.
Counts come from the existing batch diff APIs; unavailable/binary/untracked
counts use neutral minimum-width targets. Selection is local; reviewing a file
passes its Changes row key so the correct staged/unstaged side opens.

Changes now uses the Review desk layout: file rail, existing DiffView, and a
persistent commit composer. At narrower widths the composer moves below the
review area; below 650px the sections stack and scroll. Never hide the diff
solely because the viewport is narrow. Commit, amend, staging, and hunk/line
operations remain owned by ChangesView's existing service handlers.

Commit inspector loading: show the graph row's author, subject, SHA, and parents
immediately; pending files/metadata use an inline status rather than replacing the
whole inspector. Commit details use a view-local 80-entry LRU with a 60-second TTL
for mutable branch/signature metadata. After 250ms without selection changes,
prefetch up to 12 following and two preceding rows, one request at a time. Pending
loads are shared with foreground selections. Graph reloads and unmounts clear the
cache and stop queued prefetching. Working-tree data is always fetched live.
