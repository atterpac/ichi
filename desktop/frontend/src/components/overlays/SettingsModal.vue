<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import { useShellSettings } from '../../composables/useShellSettings'
import { THEMES } from '../../theme/themes'
import {
  PhGitFork,
  PhKeyboard,
  PhPalette,
  PhSlidersHorizontal,
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

const activeLabel = computed(() => categories.find((category) => category.id === active.value)?.label ?? 'Settings')

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
                <option v-for="theme in THEMES" :key="theme.id" :value="theme.id">{{ theme.label }}</option>
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
  </div>
</template>
