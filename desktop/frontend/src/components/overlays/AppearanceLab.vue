<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { THEMES } from '../../theme/themes'
import { usePreferenceBindings, usePreferences } from '../../customization/usePreferences'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const settings = usePreferenceBindings()
const preferences = usePreferences()
type ColorKey = 'accent' | 'background' | 'surface' | 'text'
const tweaks = reactive({
  uiFont: preferences.bind('appearance.uiFont'),
  monoFont: preferences.bind('appearance.codeFont'),
  scale: preferences.bind('appearance.textScale'),
  radius: preferences.bind('appearance.radius'),
  accent: preferences.bind('appearance.accent'),
  background: preferences.bind('appearance.background'),
  surface: preferences.bind('appearance.surface'),
  text: preferences.bind('appearance.text'),
})
const panel = ref<HTMLElement>()
const minimized = ref(false)
const position = reactive({ x: Math.max(8, window.innerWidth - 340), y: 94 })
const colors = [{ key: 'accent', label: 'Accent', token: '--accent' }, { key: 'background', label: 'Canvas', token: '--bg' }, { key: 'surface', label: 'Panels', token: '--surface' }, { key: 'text', label: 'Text', token: '--text' }] as const
const resolvedColors = reactive<Record<ColorKey, string>>({ accent: '#888888', background: '#17191b', surface: '#202326', text: '#e6e2da' })
const uiFonts = ['Inter Variable', 'system-ui', 'Segoe UI', 'Arial', 'Georgia', 'JetBrains Mono']
const monoFonts = ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'Courier New']
async function readColors() {
  await nextTick()
  const styles = getComputedStyle(document.documentElement)
  for (const color of colors) {
    const value = styles.getPropertyValue(color.token).trim()
    if (/^#[\da-f]{6}$/i.test(value)) resolvedColors[color.key] = value
  }
}
watch(tweaks, () => { void readColors() }, { deep: true })
watch(() => settings['appearance.theme'], readColors)
function reset() {
  for (const id of ['appearance.uiFont', 'appearance.codeFont', 'appearance.textScale', 'appearance.radius', 'appearance.accent', 'appearance.background', 'appearance.surface', 'appearance.text'] as const) preferences.reset(id)
}
function exportPreset() {
  const url = URL.createObjectURL(new Blob([preferences.exportUser('appearance')], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'ichi-appearance.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function clampPosition() {
  position.x = Math.max(8, Math.min(position.x, window.innerWidth - (panel.value?.offsetWidth || 320) - 8))
  position.y = Math.max(8, Math.min(position.y, window.innerHeight - (panel.value?.offsetHeight || 40) - 8))
}
let drag: { x: number; y: number; originX: number; originY: number } | null = null
function beginDrag(event: PointerEvent) {
  if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
  drag = { x: event.clientX, y: event.clientY, originX: position.x, originY: position.y }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function moveDrag(event: PointerEvent) {
  if (!drag) return
  position.x = drag.originX + event.clientX - drag.x
  position.y = drag.originY + event.clientY - drag.y
  clampPosition()
}
function endDrag() { drag = null }
function moveKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.target !== event.currentTarget) return
  event.preventDefault()
  position.x += event.key === 'ArrowRight' ? 16 : event.key === 'ArrowLeft' ? -16 : 0
  position.y += event.key === 'ArrowDown' ? 16 : event.key === 'ArrowUp' ? -16 : 0
  clampPosition()
}
watch([() => props.open, minimized], async () => { await nextTick(); clampPosition() })
let observer: ResizeObserver | undefined
onMounted(() => {
  window.addEventListener('resize', clampPosition)
  if (typeof ResizeObserver !== 'undefined' && panel.value) {
    observer = new ResizeObserver(() => { if (props.open) clampPosition() })
    observer.observe(panel.value)
  }
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', clampPosition)

})
</script>
<template>
  <aside v-show="open" ref="panel" class="appearance-lab" :style="{ left: `${position.x}px`, top: `${position.y}px` }" aria-label="Live appearance inspector" @keydown.esc.stop="emit('close')">
    <header tabindex="0" aria-label="Move appearance inspector with arrow keys" @keydown="moveKey" @pointerdown="beginDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @lostpointercapture="endDrag">
      <span class="lab-grip">⠿</span><b>Appearance lab</b><span class="lab-live">LIVE</span>
      <button :aria-label="minimized ? 'Expand appearance inspector' : 'Minimize appearance inspector'" @click="minimized = !minimized">{{ minimized ? '+' : '−' }}</button>
      <button aria-label="Close appearance inspector" @click="emit('close')">×</button>
    </header>
    <div v-if="!minimized" class="lab-controls">
      <label>Palette<select v-model="settings['appearance.theme']"><option v-for="theme in THEMES" :key="theme.id" :value="theme.id">{{ theme.label }} · {{ theme.light ? 'light' : 'dark' }}</option></select></label>
      <div class="lab-colors"><label v-for="color in colors" :key="color.key">{{ color.label }}<span><input type="color" :aria-label="`${color.label} override`" :value="tweaks[color.key] || resolvedColors[color.key]" @input="tweaks[color.key] = ($event.target as HTMLInputElement).value" /><button v-if="tweaks[color.key]" :aria-label="`Reset ${color.label.toLowerCase()} override`" @click="tweaks[color.key] = ''">↺</button></span></label></div>
      <p v-if="colors.some(color => tweaks[color.key])" class="lab-note">Color overrides stay active when switching palettes.</p>
      <label>UI font<input v-model="tweaks.uiFont" list="lab-ui-fonts" placeholder="Default · Inter" /><datalist id="lab-ui-fonts"><option v-for="font in uiFonts" :key="font" :value="font" /></datalist></label>
      <label>Code font<input v-model="tweaks.monoFont" list="lab-mono-fonts" placeholder="Default · JetBrains Mono" /><datalist id="lab-mono-fonts"><option v-for="font in monoFonts" :key="font" :value="font" /></datalist></label>
      <p class="lab-note">Inter and JetBrains Mono are bundled. Other names use locally installed fonts, with system fallbacks.</p>
      <label>Text size <output>{{ tweaks.scale }}%</output><input v-model.number="tweaks.scale" type="range" min="85" max="125" step="5" /></label>
      <label>Corner radius <output>{{ tweaks.radius }}px</output><input v-model.number="tweaks.radius" type="range" min="0" max="14" step="1" /></label>
      <div class="lab-columns"><label>Graph rows<select v-model="settings['graph.rowDensity']"><option>compact</option><option>comfortable</option><option>spacious</option></select></label><label>Diff rows<select v-model="settings['diff.density']"><option>compact</option><option>comfortable</option><option>relaxed</option></select></label></div>
      <footer><button @click="reset">Reset tweaks</button><button @click="exportPreset">Export preset</button></footer>
      <p class="lab-note">{{ preferences.status.persistent ? 'Saved to preferences file' : 'Session preview only' }} · closing keeps your changes.<br />Ctrl/Cmd + Alt + D to toggle.</p>
    </div>
  </aside>
</template>
<style scoped>
.appearance-lab { position: fixed; z-index: 95; width: min(320px, calc(100vw - 16px)); max-height: calc(100vh - 16px); display: flex; flex-direction: column; border: 1px solid #505563; border-radius: 10px; background: #20232b; color: #e9eaf0; box-shadow: 0 12px 40px #0006; font: 12px/1.5 'Inter Variable', system-ui, sans-serif; color-scheme: dark; --wails-draggable: no-drag; }
header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: grab; touch-action: none; flex-shrink: 0; border-bottom: 1px solid #393e49; user-select: none; }
header b { flex: 1; font-weight: 500; }
.lab-grip { color: #9da6b5; }
.lab-live { font-size: 9px; color: #a9c995; }
button { border: 0; border-radius: 4px; padding: 3px 7px; background: #343946; color: #e9eaf0; cursor: pointer; font: inherit; }
header button { background: transparent; font-size: 16px; line-height: 1; }
.lab-controls { padding: 14px; overflow: auto; min-height: 0; }
label { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 5px; margin-bottom: 12px; color: #c5ccd7; font-size: 11px; }
select, input:not([type=color]) { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid #454b58; border-radius: 4px; padding: 6px 8px; background: #171a21; color: #e9eaf0; font: 12px 'Inter Variable', system-ui, sans-serif; }
input[type=range] { padding: 0; accent-color: #a9c995; }
.lab-colors, .lab-columns { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.lab-colors label { flex-direction: column; }
.lab-colors label > span { display: flex; gap: 3px; }
input[type=color] { width: 32px; height: 26px; border: 0; padding: 0; background: transparent; cursor: pointer; }
.lab-colors button { padding: 0 3px; }
.lab-columns { grid-template-columns: 1fr 1fr; }
.lab-note { color: #a1aaba; font-size: 10px; margin: 0 0 12px; }
footer { display: flex; justify-content: space-between; margin: 4px 0 12px; }
</style>
