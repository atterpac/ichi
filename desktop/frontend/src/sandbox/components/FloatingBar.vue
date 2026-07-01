<script setup lang="ts">
import { applyTheme, sandbox, setControl, toggleGrid } from '../store'
import { themes, type ThemeName } from '../themes'
import TogglePill from './TogglePill.vue'
import SelectPill from './SelectPill.vue'

const themeNames = Object.keys(themes) as ThemeName[]

function cycleTheme(dir: 1 | -1): void {
  const i = themeNames.indexOf(sandbox.theme)
  const next = themeNames[(i + dir + themeNames.length) % themeNames.length]!
  applyTheme(next)
}

/** Step a registered select control by ±1, wrapping around its options. */
function cycleControl(id: string, dir: 1 | -1): void {
  const c = sandbox.controls.find((x) => x.id === id)
  if (c?.kind !== 'select') return
  const i = c.options.indexOf(c.value)
  setControl(id, c.options[(i + dir + c.options.length) % c.options.length]!)
}
</script>

<template>
  <div class="bar">
    <!-- Built-in controls: theme + grid. Always present. -->
    <SelectPill
      label="Theme"
      :value="sandbox.theme"
      :options="themeNames"
      @prev="cycleTheme(-1)"
      @next="cycleTheme(1)"
      @select="applyTheme($event as ThemeName)"
    />
    <TogglePill label="Grid" :value="sandbox.showGrid" @toggle="toggleGrid" />

    <span v-if="sandbox.controls.length" class="divider" />

    <!-- Playground-registered controls. -->
    <template v-for="c in sandbox.controls" :key="c.id">
      <TogglePill
        v-if="c.kind === 'toggle'"
        :label="c.label"
        :value="c.value"
        @toggle="setControl(c.id, !c.value)"
      />
      <SelectPill
        v-else-if="c.kind === 'select'"
        :label="c.label"
        :value="c.value"
        :options="c.options"
        @select="setControl(c.id, $event)"
        @prev="cycleControl(c.id, -1)"
        @next="cycleControl(c.id, 1)"
      />
    </template>
  </div>
</template>

<style scoped>
.bar {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  max-width: calc(100% - 40px);
  overflow-x: auto;
  background: color-mix(in srgb, var(--bg-soft) 86%, transparent);
  border: 1px solid var(--border);
  border-radius: 14px;
  backdrop-filter: blur(12px) saturate(1.2);
  box-shadow:
    0 8px 30px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  z-index: 50;
  scrollbar-width: none;
}

.bar::-webkit-scrollbar {
  display: none;
}

.divider {
  width: 1px;
  align-self: stretch;
  margin: 2px 4px;
  background: var(--border);
}
</style>
