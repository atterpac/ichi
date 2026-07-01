<script setup lang="ts">
import { computed, nextTick, ref, type Component } from 'vue'
import { useShellSettings } from '../../composables/useShellSettings'
import { notify } from '../../composables/useToasts'
import ContextMenu, { type ContextMenuItem } from './ContextMenu.vue'
import {
  PhBellRinging,
  PhCheck,
  PhCopy,
  PhGitBranch,
  PhGitFork,
  PhKeyboard,
  PhPalette,
  PhSlidersHorizontal,
  PhTag,
  PhTrash,
  PhX,
} from '@phosphor-icons/vue'

const emit = defineEmits<{
  close: []
}>()

type Category = {
  id: 'general' | 'appearance' | 'graph' | 'keybindings'
  label: string
  icon: Component
}

const settings = useShellSettings()
const active = ref<Category['id']>('appearance')
const categories: Category[] = [
  { id: 'general', label: 'General', icon: PhSlidersHorizontal },
  { id: 'appearance', label: 'Appearance', icon: PhPalette },
  { id: 'graph', label: 'Graph', icon: PhGitFork },
  { id: 'keybindings', label: 'Keybindings', icon: PhKeyboard },
]
const graphStyles = [
  { id: 'classic', label: 'Classic', note: 'Balanced colored rails' },
  { id: 'fine', label: 'Fine', note: 'Thin, quiet strokes' },
  { id: 'bold', label: 'Bold', note: 'Heavier lines and nodes' },
  { id: 'neon', label: 'Neon', note: 'Glow-forward branch colors' },
  { id: 'mono', label: 'Mono', note: 'Single-color schematic' },
  { id: 'angular', label: 'Angular', note: 'Sharp terminals and square nodes' },
] as const
const bendOptions = [
  { id: 'elbow', label: 'Elbow' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'curve', label: 'Curve' },
  { id: 'diagonal', label: 'Diagonal' },
] as const
const collisionOptions = [
  { id: 'cross', label: 'Cross' },
  { id: 'bridge', label: 'Bridge' },
  { id: 'gap', label: 'Gap' },
  { id: 'fade', label: 'Fade' },
] as const
const nodeGlyphOptions = [
  { id: 'semantic', label: 'Semantic' },
  { id: 'circle', label: 'Circle' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'square', label: 'Square' },
  { id: 'ring', label: 'Ring' },
  { id: 'terminal', label: 'Terminal' },
] as const
const rowDensityOptions = [
  { id: 'compact', label: 'Compact' },
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'spacious', label: 'Spacious' },
] as const
const detailPositionOptions = [
  { id: 'right', label: 'Right panel' },
  { id: 'bottom', label: 'Bottom panel' },
  { id: 'hidden', label: 'Hidden' },
] as const
const detailHashOptions = [
  { id: 'short', label: 'Short hash' },
  { id: 'full', label: 'Full hash' },
] as const
const fileChipOptions = [
  { id: 'plain', label: 'Plain row' },
  { id: 'soft', label: 'Soft chip' },
  { id: 'outline', label: 'Outline chip' },
  { id: 'pill', label: 'Pill row' },
  { id: 'compact', label: 'Compact chip' },
  { id: 'split', label: 'Split chip' },
] as const

const contextMenuStyles = [
  { id: 'default', label: 'Default', note: 'Rounded, balanced spacing' },
  { id: 'compact', label: 'Compact', note: 'Dense rows, minimal padding' },
  { id: 'spacious', label: 'Spacious', note: 'Roomy rows with icon chips' },
  { id: 'glass', label: 'Glass', note: 'Translucent, blurred surface' },
  { id: 'terminal', label: 'Terminal', note: 'Monospace with accent bar' },
  { id: 'pill', label: 'Pill', note: 'Floating rounded rows' },
] as const

const keybindStyles = [
  { id: 'minimal', label: 'Minimal', note: 'Quiet mono text' },
  { id: 'outline', label: 'Outline', note: 'Hairline pill' },
  { id: 'solid', label: 'Solid', note: 'Filled chip, base edge' },
  { id: 'keycap', label: 'Keycap', note: 'Raised physical key' },
  { id: 'accent', label: 'Accent', note: 'Tinted, high presence' },
  { id: 'bracket', label: 'Bracket', note: 'Terminal [key] style' },
] as const
const toastStyles = [
  { id: 'stack', label: 'Stack', note: 'Default card with clear action area' },
  { id: 'compact', label: 'Compact', note: 'Dense one-line workflow notice' },
  { id: 'glass', label: 'Glass', note: 'Floating translucent notification' },
  { id: 'rail', label: 'Rail', note: 'Status color stripe and strong icon' },
  { id: 'banner', label: 'Banner', note: 'Wide system-style alert' },
  { id: 'terminal', label: 'Terminal', note: 'Monospace command feedback' },
] as const

const activeLabel = computed(() => categories.find((category) => category.id === active.value)?.label ?? 'Settings')

const previewMenu = ref<InstanceType<typeof ContextMenu> | null>(null)
const previewItems: ContextMenuItem[] = [
  { label: 'Copy SHA', icon: PhCopy, shortcut: 'y' },
  { label: 'Checkout', icon: PhCheck },
  { label: 'Create branch here…', icon: PhGitBranch },
  { label: 'Create tag…', icon: PhTag },
  { separator: true },
  { label: 'Delete branch', icon: PhTrash, danger: true },
]

function previewContextMenu(event: MouseEvent, id: (typeof contextMenuStyles)[number]['id']) {
  settings.contextMenuStyle = id
  void nextTick(() => previewMenu.value?.open(event, previewItems))
}

function previewToast(id: (typeof toastStyles)[number]['id']) {
  settings.toastStyle = id
  notify({
    tone: id === 'terminal' ? 'info' : id === 'rail' ? 'warning' : 'success',
    title: id === 'terminal' ? 'git fetch complete' : 'Changes stashed',
    message: id === 'compact' ? '3 files saved for later.' : 'Saved working changes before switching branches.',
    actionLabel: id === 'banner' || id === 'stack' ? 'Undo' : 'View',
  })
}

function close() {
  emit('close')
}
</script>

<template>
  <div class="modal-backdrop" @click.self="close">
    <section class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <nav class="set-nav" aria-label="Settings sections">
        <p class="set-title">Settings</p>
        <button
          v-for="category in categories"
          :key="category.id"
          class="set-catitem"
          :class="{ active: active === category.id }"
          type="button"
          @click="active = category.id"
        >
          <component :is="category.icon" class="set-icon" :size="16" weight="bold" />
          <span class="set-catlabel">{{ category.label }}</span>
        </button>
        <span class="set-navfoot">ichi · local</span>
      </nav>

      <div class="set-body">
        <header class="set-head">
          <h2 id="settings-title">{{ activeLabel }}</h2>
          <button class="modal-close" type="button" aria-label="Close settings" @click="close">
            esc <PhX :size="12" weight="bold" />
          </button>
        </header>

        <div class="set-content">
          <template v-if="active === 'general'">
            <p class="set-section">Safety</p>
            <label class="set-row">
              <span>
                <b>Confirm destructive actions</b>
                <small>Keep a confirmation step before drop, reset, discard, or force-style operations.</small>
              </span>
              <button
                class="toggle"
                :class="{ on: settings.confirmDestructiveActions }"
                type="button"
                role="switch"
                :aria-checked="settings.confirmDestructiveActions"
                @click="settings.confirmDestructiveActions = !settings.confirmDestructiveActions"
              >
                <i />
              </button>
            </label>
          </template>

          <template v-else-if="active === 'appearance'">
            <p class="set-section">Theme</p>
            <label class="set-row theme-select-row">
              <span>
                <b>Color theme</b>
                <small>Applies immediately and persists locally.</small>
              </span>
              <select v-model="settings.theme" class="select">
                <option value="night">night</option>
                <option value="storm">storm</option>
                <option value="moon">moon</option>
                <option value="day">day</option>
              </select>
            </label>

            <p class="set-section">Layout</p>
            <label class="set-row">
              <span>
                <b>Collapse sidebar</b>
                <small>Use the compact navigation rail.</small>
              </span>
              <button
                class="toggle"
                :class="{ on: settings.navCollapsed }"
                type="button"
                role="switch"
                :aria-checked="settings.navCollapsed"
                @click="settings.navCollapsed = !settings.navCollapsed"
              >
                <i />
              </button>
            </label>
            <label class="set-row">
              <span>
                <b>Roundness</b>
                <small>Adjust corner radius across panels, rows, buttons, and controls.</small>
              </span>
              <span class="range-control">
                <input v-model.number="settings.roundness" type="range" min="0" max="18" step="1" />
                <b>{{ settings.roundness }}</b>
              </span>
            </label>

            <p class="set-section">Context menu</p>
            <p class="set-note">Click a style to select it and preview the live right-click menu.</p>
            <div class="graph-style-grid">
              <button
                v-for="style in contextMenuStyles"
                :key="style.id"
                class="graph-style-card"
                :class="{ active: settings.contextMenuStyle === style.id }"
                type="button"
                @click="previewContextMenu($event, style.id)"
              >
                <span class="ctx-style-preview" :class="`ctx-${style.id}`">
                  <i class="ctx-style-row active"><em /><s /></i>
                  <i class="ctx-style-row"><em /><s /></i>
                  <i class="ctx-style-row"><em /><s /></i>
                </span>
                <b>{{ style.label }}</b>
                <small>{{ style.note }}</small>
              </button>
            </div>

            <p class="set-section">Keybinds</p>
            <p class="set-note">How keyboard shortcuts render everywhere — menus, hints, and the command bar.</p>
            <div class="graph-style-grid">
              <button
                v-for="style in keybindStyles"
                :key="style.id"
                class="graph-style-card"
                :class="{ active: settings.keybindStyle === style.id }"
                type="button"
                @click="settings.keybindStyle = style.id"
              >
                <span class="kbd-sample" :class="`kbd-${style.id}`">
                  <kbd>⌘</kbd>
                  <kbd>K</kbd>
                </span>
                <b>{{ style.label }}</b>
                <small>{{ style.note }}</small>
              </button>
            </div>

            <p class="set-section">Toasts</p>
            <p class="set-note">Click a style to select it and show a live notification.</p>
            <div class="graph-style-grid">
              <button
                v-for="style in toastStyles"
                :key="style.id"
                class="graph-style-card"
                :class="{ active: settings.toastStyle === style.id }"
                type="button"
                @click="previewToast(style.id)"
              >
                <span class="toast-style-preview" :class="`toast-preview-${style.id}`">
                  <PhBellRinging class="toast-preview-icon" :size="14" weight="bold" />
                  <i><em /><s /></i>
                  <u />
                </span>
                <b>{{ style.label }}</b>
                <small>{{ style.note }}</small>
              </button>
            </div>
          </template>

          <template v-else-if="active === 'graph'">
            <p class="set-section">View</p>
            <label class="set-row">
              <span>
                <b>Row density</b>
                <small>Adjust the commit table height without losing graph alignment.</small>
              </span>
              <select v-model="settings.graphRowDensity" class="select">
                <option v-for="option in rowDensityOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
            </label>
            <label class="set-row">
              <span>
                <b>Details panel</b>
                <small>Choose where selected commit details appear.</small>
              </span>
              <select v-model="settings.graphDetailPosition" class="select">
                <option v-for="option in detailPositionOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
            </label>
            <label class="set-row">
              <span>
                <b>Detail hash</b>
                <small>Show either quick scan hashes or the full commit identity.</small>
              </span>
              <select v-model="settings.graphDetailHash" class="select">
                <option v-for="option in detailHashOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
            </label>
            <label class="set-row">
              <span>
                <b>Author and date</b>
                <small>Include commit attribution fields in the detail panel.</small>
              </span>
              <button
                class="toggle"
                :class="{ on: settings.graphDetailShowAuthorDate }"
                type="button"
                role="switch"
                :aria-checked="settings.graphDetailShowAuthorDate"
                @click="settings.graphDetailShowAuthorDate = !settings.graphDetailShowAuthorDate"
              >
                <i />
              </button>
            </label>
            <label class="set-row">
              <span>
                <b>File row chip</b>
                <small>Change how each changed file row is framed in the detail panel.</small>
              </span>
              <select v-model="settings.graphFileChipStyle" class="select">
                <option v-for="option in fileChipOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
            </label>
            <p class="set-section">Canvas</p>
            <div class="graph-style-grid">
              <button
                v-for="style in graphStyles"
                :key="style.id"
                class="graph-style-card"
                :class="{ active: settings.graphCanvasStyle === style.id }"
                type="button"
                @click="settings.graphCanvasStyle = style.id"
              >
                <span class="graph-style-preview" :class="`style-${style.id}`">
                  <i />
                  <i />
                  <i />
                </span>
                <b>{{ style.label }}</b>
                <small>{{ style.note }}</small>
              </button>
            </div>

            <p class="set-section">Flow</p>
            <label class="set-row">
              <span>
                <b>Bends</b>
                <small>How branch turns and joins move through each cell.</small>
              </span>
              <select v-model="settings.graphBendStyle" class="select">
                <option v-for="option in bendOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
            </label>
            <label class="set-row">
              <span>
                <b>Collisions</b>
                <small>How horizontal joins interact with vertical lanes.</small>
              </span>
              <select v-model="settings.graphCollisionStyle" class="select">
                <option v-for="option in collisionOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
            </label>
            <label class="set-row">
              <span>
                <b>Node glyphs</b>
                <small>Commit marker shape used on the canvas rail.</small>
              </span>
              <select v-model="settings.graphNodeGlyph" class="select">
                <option v-for="option in nodeGlyphOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
            </label>

            <p class="set-section">History</p>
            <label class="set-row">
              <span>
                <b>Commit load limit</b>
                <small>Initial number of commits requested from the graph service.</small>
              </span>
              <select v-model.number="settings.graphLimit" class="select">
                <option :value="60">60</option>
                <option :value="120">120</option>
                <option :value="250">250</option>
                <option :value="500">500</option>
              </select>
            </label>
            <label class="set-row">
              <span>
                <b>Show author</b>
                <small>Display author names in graph row metadata.</small>
              </span>
              <button
                class="toggle"
                :class="{ on: settings.graphShowAuthor }"
                type="button"
                role="switch"
                :aria-checked="settings.graphShowAuthor"
                @click="settings.graphShowAuthor = !settings.graphShowAuthor"
              >
                <i />
              </button>
            </label>
          </template>

          <template v-else>
            <p class="set-section">Keyboard</p>
            <div class="set-kbd-grid">
              <span><kbd>g</kbd><b>Graph</b></span>
              <span><kbd>s</kbd><b>Status</b></span>
              <span><kbd>c</kbd><b>Commit</b></span>
              <span><kbd>Ctrl+P</kbd><b>Finder</b></span>
            </div>
            <p class="set-note">Keybinding editing is not wired yet; this panel is a placeholder for command-map preferences.</p>
          </template>
        </div>
      </div>
    </section>

    <ContextMenu ref="previewMenu" :variant="settings.contextMenuStyle" />
  </div>
</template>
