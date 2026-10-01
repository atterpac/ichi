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

Ichi is the default app palette, owned here in `defs/ichi.yaml`. Warm charcoal
surfaces and ivory text keep long history and diff sessions quiet; copper marks
navigation and focus, sage marks additions, coral marks removals, and gold marks
warnings. Blue and lilac complete the five graph lanes. The generator tunes
metadata and semantic text to 4.5:1 contrast across all four surfaces.

`defs/ichi-light.yaml` is the companion light palette: warm sand and paper
surfaces, forest green navigation, and dark olive ink. Teal additions, brick
removals, and ochre warnings separate Git states from navigation. Both Ichi
palettes lead the theme picker; the charcoal variant remains the default.

Run `pnpm gen:themes` after editing the palette and commit both generated files.
Imported definitions come from the versioned dado module selected by the
desktop Go module, with its checksum in `go.sum`. Download it with
`go mod download github.com/atterpac/dado` from the desktop directory if needed.
`pnpm check:themes` verifies byte-identical generation without writing output.
`DADO_DIR=/path/to/dado` explicitly overrides these inputs; sibling checkouts
and Go workspaces do not affect normal generation. Local snapshots retain
Ayu Dark/Light, Flexoki Dark, Nightfox, Oxocarbon and Palenight, which are absent
from the pinned dado release, so existing saved theme IDs remain valid.
Local definitions take precedence over imported dado definitions; Ichi appears
first in the theme picker. Fresh or invalid settings use Ichi, while saved theme
choices (including legacy aliases) remain intact.

The generator also emits `--surface-chrome-gen`, a darker step behind the
working card, and pushes dark raised panels slightly lighter so flat palettes
still separate. Don't build surface tokens with `light-dark()`: WebKitGTK drops
any `color-mix()` that nests one.

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

Typography roles: Inter (`--font-ui`) carries every label, heading, and
control; mono is only for copyable data (hashes, paths, code, aligned diff
counts). Use the shorthand roles `--font-title` (panel titles), `--font-hero`
(one reading heading per pane), `--font-label` (section labels), and
`--font-data` (small mono data) instead of ad-hoc sizes. Buttons have three
tiers: primary (one per region), default (quiet fill), ghost (tools). Graph row heights are
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

The shell title bar uses symmetric columns to center a 32px search field (up to
560px wide), with repository context on the left and Settings on the right.
At narrow widths, context collapses before search moves to its own row. Keep
native macOS traffic-light spacing inside the left column so it does not offset
search. The footer Ichi button opens `IchiMenu.vue`, a focus-contained About
panel with release notes, source, and feedback links. Desktop links open through
the Wails browser API; browser previews use ordinary external links.
