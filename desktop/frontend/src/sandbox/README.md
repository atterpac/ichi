# Sandbox

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
