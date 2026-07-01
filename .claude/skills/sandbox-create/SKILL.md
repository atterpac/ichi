---
name: sandbox-create
description: Wipe and rebuild the desktop frontend sandbox playground from a design prompt. Use when the user runs /sandbox-create or asks to build/iterate a design in the sandbox. Has full knowledge of the sandbox's floating-bar controls, theme CSS variables, and store contract.
---

# sandbox-create

Rebuild the desktop sandbox's **playground** from a design prompt. The playground
is a throwaway surface for iterating on UI design; this skill wipes it and writes
fresh markup wired to the sandbox's stable scaffolding.

## Scope — what you may touch

- **Rewrite freely:** everything under
  `desktop/frontend/src/sandbox/playground/`. Replace `Playground.vue` wholesale.
  Add sibling components there if the design needs them.
- **Do NOT modify** (stable scaffolding): `Sandbox.vue`, `sandbox.css`,
  `themes.ts`, `store.ts`, `components/`, `main.ts`, `sandbox.html`,
  `vite.config.ts`. Only touch these if the user explicitly asks to change the
  framework itself.

Always read `desktop/frontend/src/sandbox/README.md` first — it is the source of
truth for the contract and may have drifted from this skill.

## Procedure

1. **Read** the README and the current `playground/Playground.vue` so you match
   conventions and know what's there.
2. **Wipe**: remove old files under `playground/` that won't be reused, then
   write the new `Playground.vue` (and any helper components in `playground/`).
3. **Wire controls**: for each toggle/option the design needs, `registerControl`
   in `onMounted` and `clearControls` in `onUnmounted`. Read values reactively
   via `controlValue<T>('id')` inside `computed()`.
4. **Theme**: style only with the theme CSS variables (below). Never hardcode
   colors — switching the Theme pill must keep the design coherent.
5. **Verify**: run `pnpm vue-tsc --noEmit -p tsconfig.app.json` from
   `desktop/frontend`. Fix any type errors. Mention `pnpm sandbox` to preview.

## Store contract

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

- Control kinds: `toggle` (boolean pill) and `select` (cycle a fixed list).
- `registerControl` is keyed by `id`, idempotent — safe to call on every mount.
- Built-in controls **Theme** and **Grid** already exist; never register them.

## Theme CSS variables (use exclusively for color)

| var | meaning |
| --- | --- |
| `--bg` | canvas background |
| `--bg-soft` | raised surface (cards, bar) |
| `--fg` | primary text |
| `--fg-muted` | dim/secondary text |
| `--accent` | primary accent (active/focus) |
| `--accent-2` | secondary accent |
| `--border` | hairline borders |

Use `color-mix(in srgb, var(--accent) 20%, transparent)` for tints/glows so they
track the active theme. Themes available: tokyonight-night, catppuccin-mocha,
gruvbox-dark, rosepine, nord, dracula, void (default, pure black).

## Notes

- Vue 3 `<script setup lang="ts">`, scoped styles, the `@/` alias maps to `src/`.
- Keep the playground self-contained; don't import from the real app.
- If the prompt is vague, make tasteful defaults and expose the interesting
  knobs as floating-bar controls so the user can dial them in live.
