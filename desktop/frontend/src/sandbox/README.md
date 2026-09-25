# Sandbox

## Deterministic avatar lab

Open `/avatar-lab.html` on the Vite server. The Pixel creatures tab now keeps
Relay (robots), Spore (mushrooms, default), Lumen (moths), and the refined Alley
(cat). The same generators power production author placeholders, selectable
under Settings → Appearance → Avatar placeholders. Existing author photos take
precedence; the chosen creature replaces the old initials fallback, including
optional graph author nodes. The Original collection tab
still contains the six original SVG styles:
Loom, Star chart, Terrain, Prism, Herbarium, and Bitkin. Change the input to
regenerate all six, select a style for the commit-list preview, check small
sizes and grayscale, or export the selected SVG. Identical NFC-normalized
inputs produce identical output; case and whitespace remain significant.
Everything is local, with no avatar service or new dependencies. These are
visual identifiers, not guaranteed-unique IDs or security fingerprints.

## Code review interaction lab

Run `pnpm dev` and open `/review-lab.html` to compare Cursor review (continuous
line navigation), Hunk focus (one hunk with a review trail), and Result lens
(before/after code). The experiments share sample edits and review marks.

Focus or click the code to use `j/k` or arrow keys for lines, `[/]` for hunks,
`gg/G` for first/last visible line, `/` to search, `n` for the next match,
`r` to toggle reviewed, and Enter to review and advance to the next unreviewed
hunk across files. In Result lens, `b` toggles before/after.

`e` edits a single resulting line directly in the diff, keeping surrounding code
and scroll position visible (Enter saves, Escape cancels). Edits stay in memory.
Editing reopens the hunk for review. `o` previews the path and line for an
editor handoff; it does not launch a process. Removed lines target the nearest
surviving line in the hunk; removed files and the before lens have no editable
target. An actual desktop handoff needs editor-specific line arguments and
a terminal host for terminal editors. No Git services or disk writes occur.
Review progress is independent of staging; reload or Reset clears sample state.
This is a small-fixture UX prototype, not a large-file diff renderer.

A throwaway design surface for the desktop client, isolated from the real app.
Run it:

```bash
pnpm sandbox      # opens /sandbox.html
```

It's a separate Vite entry (`sandbox.html` → `src/sandbox/main.ts`), so nothing
here touches `App.vue` or production code.

## Layout

```
src/sandbox/
  main.ts               entry — mounts Sandbox.vue
  Sandbox.vue           STABLE — black canvas + faint grid + watermark + bar
  sandbox.css           STABLE — global resets + default CSS vars
  themes.ts             STABLE — theme palettes (CSS var maps)
  store.ts              STABLE — reactive contract: theme, grid, controls
  components/           STABLE — FloatingBar, TogglePill, SelectPill
  playground/
    Playground.vue      THROWAWAY — the only thing /sandbox-create rewrites
```

**Stable** = scaffolding; leave it alone unless changing the framework itself.
**Throwaway** = `playground/`; rewritten constantly to test design iterations.

## The floating bar

Bottom-center, blurred pill bar. Always shows two built-in controls:

- **Theme** — cycles the palettes in `themes.ts`
- **Grid** — toggles the backdrop grid

Anything a playground registers shows up after a divider.

## Store contract (use this from a playground)

```ts
import { registerControl, clearControls, controlValue } from '@/sandbox/store'

onMounted(() => {
  registerControl({ id: 'glow', kind: 'toggle', label: 'Glow', value: true })
  registerControl({
    id: 'density', kind: 'select', label: 'Density',
    options: ['compact', 'cozy', 'roomy'], value: 'cozy',
  })
})
onUnmounted(clearControls)

const glow = computed(() => controlValue<boolean>('glow') ?? false)
const density = computed(() => controlValue<string>('density') ?? 'cozy')
```

Two control kinds: `toggle` (boolean) and `select` (cycle a list). `registerControl`
is keyed by `id` and idempotent.

## Theme CSS variables

Style everything with these — switching theme then "just works":

| var | meaning |
| --- | --- |
| `--bg` | canvas background |
| `--bg-soft` | raised surface (cards, bar) |
| `--fg` | primary text |
| `--fg-muted` | dim/secondary text |
| `--accent` | primary accent (active/focus) |
| `--accent-2` | secondary accent |
| `--border` | hairline borders |
| `--grid` | grid line color (used by the backdrop) |

## Production component gallery

Open `/components.html` on the Vite dev server for the production gallery
(`components-main.ts` → `ComponentGallery.vue`). It uses real app tokens,
styles, primitives, and dialogs, independently of the experimental playground.
Controls use sample data and do not run Git operations. Compare sizing, themes,
focus states, and narrow layouts against `src/theme/COMPONENT_RUBRIC.md`.

## Changes page options

Visit `/changes-designs.html` for three interactive sample layouts: Review desk,
Diff first, and Staging board. File selection, stage/unstage, and form feedback
use local sample state only. No Git services are called by this page.
