# Ichi component design rubric

Status: implemented baseline for the production UI. The comparison table records pre-migration measurements; the contract below is the ongoing review standard.
Reference: published `@galaxy-io/dls` **1.5.18**, inspected 2026-09-24.
Goal: match Galaxy's compact controls, restrained surfaces, and consistent spacing while retaining Ichi's Vue architecture, Git graph, themes, and keyboard interaction.

## Evidence and scope

The supplied Libraries.io page and linked Storybook were not accessible through the research browser. The public npm metadata and versioned package archive were downloaded and inspected as text, without installing or executing the package. This is a comparison of published implementations, not a screenshot-verified visual match.

Primary references, pinned to the inspected release:

- [Published package archive](https://registry.npmjs.org/@galaxy-io/dls/-/dls-1.5.18.tgz)
- [Button implementation](https://unpkg.com/@galaxy-io/dls@1.5.18/dist/buttons/Button.js)
- [Input sizing helpers](https://unpkg.com/@galaxy-io/dls@1.5.18/dist/inputs/Input.js)
- [Typography tokens](https://unpkg.com/@galaxy-io/dls@1.5.18/dist/theme/typography.js)
- [Dark palette](https://unpkg.com/@galaxy-io/dls@1.5.18/dist/theme/variants/dark.js)
- [Table density helpers](https://unpkg.com/@galaxy-io/dls@1.5.18/dist/table/utils.js)
- [Dropdown implementation](https://unpkg.com/@galaxy-io/dls@1.5.18/dist/dropdown/Dropdown.js)
- [Accordion implementation](https://unpkg.com/@galaxy-io/dls@1.5.18/dist/accordion/Accordion.js)
- [Spacing implementation](https://unpkg.com/@galaxy-io/dls@1.5.18/dist/containers/Spacing.js)

Galaxy is a React library. Adopt its measurable design conventions in our Vue primitives; importing it would add a separate component runtime without addressing consistency in existing views.

## Comparison

| Area | Galaxy, verified in 1.5.18 | Ichi before migration | Adopted decision |
|---|---|---|---|
| Button/input heights | Both use 24 / 28 / 32px | Shared buttons use 26 / 30px; titlebar search is 24px; icon buttons vary | Adopt coordinated small/medium/large controls |
| Labeled-control horizontal padding | 6 / 8 / 12px by size | Shared buttons use 9 / 12px | Adopt 6 / 8 / 12px |
| Button icon-label gap | 4 / 6 / 6px | Shared buttons use 6px for all sizes | Use 4px for small, 6px for medium/large |
| Control type | Sans 12 / 13 / 14px by size, medium-weight button labels | 11.5 / 12px shared buttons, 11px search | Use the coordinated 12 / 13 / 14px scale |
| Input icons | 12 / 14 / 16px | Sizes are passed at call sites | Use 16px action icons in every control size for legibility |
| Shape | Buttons default to 5px radius; dropdowns have 4px internal padding | 5px buttons, 8px menus with 4px padding | Retain those close matches; normalize callers |
| Table density | 32 / 48 / 56px rows; 8px vertical and 12 / 16 / 20px horizontal cell padding | Graph uses 34 / 42 / 48px with canvas-aligned heights | Keep graph heights as an explicit data-view exception |
| Layout spacing | Accordion header insets 8 / 12 / 16px; body defaults to 12px; Spacing recommends gap/padding for new layouts | Many local 5 / 7 / 9 / 10 / 14 / 22px decisions | Introduce a small shared spacing vocabulary |
| Theme roles | Separate background, text, icon, border, and state roles | Four surface roles and shared state tokens exist | Preserve roles; consistently consume them |

Current Ichi evidence: `primitives.css`, `shell.css`, `views/graph.css`, `views/refs.css`, `views/changes.css`, `overlays/menus.css`, and `components/graph/rowDensity.ts`.

## Component contract

The following are **Ichi recommendations**, not claims that Galaxy uses a universal spacing grid.

### Spacing ownership

Use this token vocabulary:

| Token | Value | Role |
|---|---:|---|
| `--space-1` | 2px | Optical adjustment, tiny status clusters |
| `--space-2` | 4px | Small icon-label gap, menu inset |
| `--space-3` | 6px | Standard icon-label gap, small-control inset |
| `--space-4` | 8px | Related controls, field label to field |
| `--space-6` | 12px | Compact section inset, form-field separation |
| `--space-8` | 16px | Default panel inset and section spacing |
| `--space-10` | 20px | Spacious inspector/dialog inset |
| `--space-12` | 24px | Separation between distinct groups |
| `--space-16` | 32px | Major layout separation, used sparingly |

A parent owns spacing between children using `gap`; each child owns its internal padding. Do not combine child margins and parent gaps for the same separation. Align section titles, tabs, and content to the same panel inset. New values outside the scale require a named reason, such as graph geometry or native window controls.

### Controls

| Property | Small | Medium, default | Large |
|---|---:|---:|---:|
| Height | 24px | 28px | 32px |
| Labeled horizontal padding | 6px | 8px | 12px |
| Text size | 12px | 13px | 14px |
| Control line-height | 14px | 15px | 16px |
| Icon size | 12px | 14px | 16px |
| Icon-label gap | 4px | 6px | 6px |
| Icon-only target | 24 × 24px | 28 × 28px | 32 × 32px |

All three use 5px radius, consistent box sizing, and a 1px border allocation even when the border is transparent. Input, select, button, and icon button sizes must align within a toolbar. Square icon-only targets are an Ichi policy; Galaxy's icon-only button padding differs from its labeled padding.

Use small controls in the 36px titlebar and dense table tools, medium in regular toolbars and inspectors, and large in forms/dialog actions where useful. Never shrink a label below the size contract to fit a long action; wrap its container or move secondary actions into a menu.

### Text

Use regular 400 for content and medium 500 for controls/headings; use 600 only for a deliberate emphasis role. Retain the existing UI and monospace font families. Galaxy names ABC Diatype and Berkeley Mono with fallbacks, but matching font families is not necessary to adopt its sizing rhythm.

- Primary UI copy: 13px; small labels: 12px; supporting metadata: 11px.
- Section headings: 16px; inspector headings: 20px.
- 10px is reserved for short supplementary captions, never the only label for an action.
- Use compact line heights for single-line controls; use 1.5–1.6 for descriptions and commit bodies. Galaxy's compact body token line heights should not be applied indiscriminately to long text.
- Monospace is for paths, hashes, refs, and aligned numeric data. Author names and prose stay sans serif.

### Surfaces and borders

Continue using `--surface-base`, `--surface-panel`, `--surface-raised`, and `--surface-overlay`. Ordinary buttons and rows should read mostly flat; use subtle borders and state fills. Keep elevation 2 restrained for inspectors and reserve elevation 3 for floating UI.

Galaxy's dark neutral surfaces are close in tone: base `#141415`, primary `#161617`, secondary `#1c1c1d`. Borrow that restraint without replacing every Ichi theme with those exact colors. Galaxy's primary/secondary/tertiary labels are not a strictly ascending brightness ladder, so do not map them mechanically onto our four elevation roles.

Galaxy uses 0.5px borders in several controls. Start with Ichi's 1px faint border for predictable rendering; evaluate hairlines at 1× and 2× before changing them. Do not add a border, accent fill, and shadow simultaneously just to make an ordinary row stand out.

### Component recipes

| Component | Target contract |
|---|---|
| Header | Keep 36px titlebar, 42px navigation row; aligned 24px search/cog controls; 8px between controls |
| Navigation | 28px targets, 8px horizontal padding, 4px between items; neutral selected fill; visible focus |
| Inspector | 16px standard inset, 20px spacious; 16px between related sections, 24px between distinct groups; title 20px |
| Files/Metadata tabs | 28px minimum target height, 16px gap; one active indicator; arrow-key behavior preserved |
| Menu | 4px outer padding; items minimum 28px high with 8px horizontal inset; 8px icon-label gap; 8px menu radius |
| Form field | 8px label-to-control gap; 12px between fields; helper/error text at 12px; medium or large controls |
| Graph row | Retain 34 / 42 / 48px densities, flat resting surface, a background selection highlight; canvas and DOM share dimensions |
| File row | 8px vertical padding, 8px gaps; path wraps in inspector, deltas align at trailing edge |
| Dialog | 20px content inset, 16px internal section gaps, 8px action gap; preserve confirmation and failure states |

The graph's density is intentionally independent from control height. Fixed-height graph rows must not wrap; long subjects truncate with a full-detail destination. Inspector prose and paths should wrap.

## Review rubric

Rate each dimension **0 = fails, 1 = partial, 2 = meets**. Multiply its weight by rating / 2. Review target: **90/100**, with no zero in semantics/interaction or data resilience. An exception passes only when named and documented, not when silently introduced.

| Dimension | Weight | Full-credit evidence |
|---|---:|---|
| Spacing consistency | 20 | Insets/gaps use agreed tokens; one owner per gap; headings and content share alignment |
| Control sizing | 15 | Size contract drives height, padding, type, and icons; neighboring controls align |
| Typography | 15 | Clear title/body/meta roles; no arbitrary shrink-to-fit; prose remains readable |
| Visual hierarchy | 15 | Correct surface role; restrained separators/shadows; color has a consistent meaning |
| Semantics and interaction | 15 | Named controls; visible focus; native activation; correct tab/menu behavior; loading/error/disabled states |
| Data resilience | 10 | Long paths, empty values, many refs, and narrow widths remain usable; graph alignment survives density changes |
| Reuse | 10 | Shared primitive or token owns repeated styling; feature CSS handles layout rather than restyling the primitive |

Additional release gates: essential text meets 4.5:1 contrast on its actual surface; focus remains perceivable; status is not conveyed by color alone; reduced-motion preference is honored; existing Git confirmations, file navigation, and keyboard behavior are preserved. These are proposed project gates, not a claim that the reference package has passed an accessibility audit.

Review in a narrow desktop window and at normal/wide widths, both light and dark themes, compact and comfortable graph densities, and 1×/2× display scale when available. Include default, hover, focus, selected, disabled, loading, error, and empty examples where applicable. Record which were checked rather than giving an unsupported visual score.

## Adoption order

1. Add spacing and coordinated control-size tokens to `tokens.css`; keep this proposal versioned.
2. Extend `UiButton` with the agreed three sizes and consistent icon sizing; add shared `UiInput` and `UiIconButton` treatment. Migrate header, Push, search, and inspector actions first.
3. Share navigation/tab and panel-section recipes; replace inspector 22px padding and local 9px/14px gaps with documented tokens.
4. Apply the same control contracts to menus, Changes, Branches, and Settings.
5. Add component examples to the existing sandbox, showing sizes and states side by side. Use the rubric for subsequent reviews.

Do not resize the graph just to make every dimension a multiple of four, add the React library to the Vue app, or claim a package-wide visual match from source inspection alone.

## Implementation and verification (2026-09-24)

Shared `UiButton`, `UiIconButton`, and `UiInput` implement the size contract.
Native selects and textareas use `ui-field`. Text inputs retain native attributes
and expose focus/select for existing keyboard workflows. Shell, graph,
Changes/commit form, diff tools, Branches/Stash, file inspector, Settings, Finder,
menus, notifications, and confirmations use the spacing/type system. Tabs use
`ui-tabs`.

Generated `--accent-text`, `--positive-text`, `--negative-text`, and
`--warning-text` separate readable text from graph lane colors. Primary buttons
choose dark/light ink by contrast. Graph lanes and row refs share a five-slot generated palette; red is no longer an explicit lane slot.
Dialogs manage keyboard focus, Tab wrapping, Escape, and restoration.

Intentional geometry exceptions: graph rows 34/42/48px; virtual diff rows
17/20/24px; edit-mode hunk header 26px; blame rows 19px; settings graph sample
rows 26px; native window-control clearance 82px; resize handles 5px. Small
status glyphs and keycaps are metadata rather than full controls. Theme sample
cards retain their own raw palette variables.

The production component gallery lives at `/components.html`. It renders real
primitives, settings/confirmation dialogs, graph preview, and representative
content without running Git operations. The historical `ui-refresh/index.html`
is a design study, not the live component specification.

Browser review used Chrome at 1280px, 760px, and 560px, dark/light component
examples, long paths, and production views with in-memory service fixtures.
Computed control dimensions matched the size contract. Graph canvas and rows
aligned; narrow settings and stacked branch details remained accessible. This
is not an end-to-end verification of the native Wails backend or every display
scale.

### Refresh follow-through

Inter Variable and JetBrains Mono (400/500/600) ship locally through `fonts.css`.
Font licenses are included under `public/fonts/`. Ref chips use the commit node's
lane rather than a crossing rail; tags remain neutral; remote refs use a cloud marker.
HEAD has a restrained outer ring; the selected row uses a background highlight without a leading border.

`CommitDetail.vue` owns author-first hierarchy, one copyable SHA, parent links,
directory-grouped files, semantic status letters, and an expandable file list.
Exact additions/deletions remain visible. The footer exposes Create branch and
Cherry-pick via existing confirmations; less frequent actions remain in the menu.
Revert asks for confirmation and is disabled for merge commits, where a mainline
selection would be required. Inspector width persists (320–640px preferred width,
constrained by the viewport), supports pointer and keyboard resizing, and resets
to 370px on double-click. Narrow layouts stack the inspector below the graph.

Regression coverage includes parent navigation outside the loaded graph, expanding
files, lane selection, keyboard resizing/persistence, and action confirmations.
Chrome verified locally loaded font faces, pointer resizing from 370 to 470px,
14-file expansion, and light/dark/narrow layouts with sample service responses.

Ref labels use the shared `RefLabel.vue`: 22px metadata height, neutral fill,
no outline or inset stripe, and a single lane-colored marker. Current branches
use a check, remotes a cloud, and tags a neutral tag icon. `RefCluster.vue`
prioritizes the current/local branch and shows `+N` for co-located refs, with the
complete list in its tooltip and existing ref actions retained. Names truncate
inside their own flex child so markers and counts remain visible.

The graph pane does not draw a surrounding focus ring; row selection indicates
the navigation position. Commit file rows and the summary use `DiffBar.vue`:
five cells show the proportion of additions/deletions, including split cells
for mixed changes. Exact counts remain visible, zero-change bars stay neutral,
and binary files retain their text label without a line-change bar.


### Icons

Use Phosphor SVG icons with bold weight: 16px for actions and navigation,
14px for compact reference/status markers, and 12px for simple disclosure carets.
Keep action icons at 16px in all 24/28/32px controls; control size changes padding,
not icon scale. Use 18/24px for larger feedback illustrations. Set explicit SVG
sizes, prevent flex shrinking, and avoid CSS scale transforms or font glyphs as
icons. Preserve accessible button labels. Check at native display scale; do not
apply crisp-edges rendering globally to curved SVG paths.
