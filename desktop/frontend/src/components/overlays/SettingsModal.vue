<script setup lang="ts">
import { placeholderStyles, placeholderSvg } from '../common/avatarPlaceholder'
import { computed, ref, type Component } from 'vue'
import { useShellSettings } from '../../composables/useShellSettings'
import { useDialogFocus } from '../../composables/useDialogFocus'
import { THEMES } from '../../theme/themes'
import GraphPreview from './GraphPreview.vue'
import UiButton from '../common/UiButton.vue'
import {
  PhGitDiff,
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
  id: 'general' | 'appearance' | 'graph' | 'diff' | 'keybindings'
  label: string
  icon: Component
}

const dialog = ref<HTMLElement | null>(null)
useDialogFocus(dialog, () => emit('close'))

const settings = useShellSettings()
const active = ref<Category['id']>('appearance')
const showAllThemes = ref(false)
const essentialThemeIds = new Set(['atterpac', 'tokyonight-night', 'onelight'])
const visibleThemes = computed(() => {
  if (showAllThemes.value) return THEMES
  return THEMES.filter((theme) => essentialThemeIds.has(theme.id) || theme.id === settings.theme)
})
const hiddenThemeCount = computed(() => THEMES.length - visibleThemes.value.length)
const categories: Category[] = [
  { id: 'general', label: 'General', icon: PhSlidersHorizontal },
  { id: 'appearance', label: 'Appearance', icon: PhPalette },
  { id: 'graph', label: 'Graph', icon: PhGitFork },
  { id: 'diff', label: 'Diff', icon: PhGitDiff },
  { id: 'keybindings', label: 'Keybindings', icon: PhKeyboard },
]
const diffLayoutOptions = [
  { id: 'unified', label: 'Unified' },
  { id: 'split', label: 'Side by side' },
  { id: 'inline', label: 'Inline edits' },
  { id: 'changes', label: 'Changes only' },
  { id: 'result', label: 'Result file' },
] as const
const diffDensityOptions = [
  { id: 'compact', label: 'Compact' },
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'relaxed', label: 'Relaxed' },
] as const
const groupByDirOptions = [
  { id: 'auto', label: 'Auto (15+ files)' },
  { id: 'always', label: 'Always' },
  { id: 'never', label: 'Never' },
] as const
const graphStyles = [
  { id: 'classic', label: 'Classic', note: 'Balanced colored rails' },
  { id: 'fine', label: 'Fine', note: 'Thin, quiet strokes' },
  { id: 'bold', label: 'Bold', note: 'Heavier lines and nodes' },
  { id: 'neon', label: 'Neon', note: 'Glow-forward branch colors' },
  { id: 'mono', label: 'Mono', note: 'Single-color schematic' },
  { id: 'angular', label: 'Angular', note: 'Sharp terminals and square nodes' },
] as const
const bendOptions = [
  { id: 'elbow', label: 'Elbow', d: 'M10 3 L10 14 L34 14' },
  { id: 'rounded', label: 'Rounded', d: 'M10 3 L10 9 Q10 14 15 14 L34 14' },
  { id: 'curve', label: 'Curve', d: 'M10 3 Q10 14 34 14' },
  { id: 'diagonal', label: 'Diagonal', d: 'M10 3 L10 7 L34 14' },
] as const
const collisionOptions = [
  { id: 'cross', label: 'Cross', paths: ['M4 14 L36 14'], fade: false },
  { id: 'bridge', label: 'Bridge', paths: ['M4 14 L14 14 Q20 6 26 14 L36 14'], fade: false },
  { id: 'gap', label: 'Gap', paths: ['M4 14 L13 14', 'M27 14 L36 14'], fade: false },
  { id: 'fade', label: 'Fade', paths: ['M4 14 L36 14'], fade: true },
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
    <section ref="dialog" tabindex="-1" class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
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
          <UiButton size="sm" aria-label="Close settings" @click="close">
            esc <PhX :size="16" weight="bold" />
          </UiButton>
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

            <p class="set-section">Finder</p>
            <label class="set-row">
              <span>
                <b>Unified search</b>
                <small>Search everything the moment you type — no mode key first. Results group by type; b: c: f: v: still narrows to one kind.</small>
              </span>
              <button
                class="toggle"
                :class="{ on: settings.finderUnified }"
                type="button"
                role="switch"
                :aria-checked="settings.finderUnified"
                @click="settings.finderUnified = !settings.finderUnified"
              >
                <i />
              </button>
            </label>
          </template>

          <template v-else-if="active === 'appearance'">
            <p class="set-section">Avatar placeholders</p>
            <p class="set-note">Used when an author photo is unavailable. Each author gets a consistent creature.</p>
            <div class="avatar-placeholder-options" role="group" aria-label="Avatar placeholder style">
              <button v-for="style in placeholderStyles" :key="style.id" type="button"
                :aria-pressed="settings.avatarPlaceholder === style.id"
                @click="settings.avatarPlaceholder = style.id">
                <span class="avatar-placeholder-preview" aria-hidden="true" v-html="placeholderSvg('Alex Chen', style.id)" />
                <b>{{ style.name }}</b><small>{{ style.id === 'spore' ? 'Default' : style.id === 'relay' ? 'Robot' : style.id === 'lumen' ? 'Moth' : 'Cat' }}</small>
              </button>
            </div>
            <p class="set-section">Theme</p>
            <p class="set-note">A focused set of product defaults. Changes apply immediately and persist locally.</p>
            <div class="theme-chip-grid" role="radiogroup" aria-label="Color theme">
              <button
                v-for="theme in visibleThemes"
                :key="theme.id"
                class="theme-chip"
                :class="[`theme-${theme.id}`, { active: settings.theme === theme.id }]"
                type="button"
                role="radio"
                :aria-checked="settings.theme === theme.id"
                @click="settings.theme = theme.id"
              >
                <span class="theme-chip-rail" aria-hidden="true">
                  <svg viewBox="0 0 116 56">
                    <line x1="20" y1="4" x2="20" y2="52" class="rail-main" />
                    <path d="M20 18 C 20 30, 44 22, 44 34 L 44 52" class="rail-branch" />
                    <circle cx="20" cy="10" r="4" class="n-accent" />
                    <circle cx="20" cy="30" r="4" class="n-purple" />
                    <circle cx="44" cy="42" r="4" class="n-green" />
                    <circle cx="20" cy="48" r="4" class="n-orange" />
                    <rect x="58" y="7" width="46" height="4" rx="2" class="t-strong" />
                    <rect x="58" y="27" width="34" height="4" rx="2" class="t-mut" />
                    <rect x="58" y="45" width="40" height="4" rx="2" class="t-dim" />
                  </svg>
                </span>
                <span class="theme-chip-name">
                  <b>{{ theme.label }}</b>
                  <small>{{ theme.light ? 'light' : 'dark' }}</small>
                </span>
              </button>
            </div>
            <button class="set-disclosure" type="button" :aria-expanded="showAllThemes" @click="showAllThemes = !showAllThemes">
              <span>{{ showAllThemes ? 'Show essential themes' : `Show ${hiddenThemeCount} additional themes` }}</span>
              <span aria-hidden="true">{{ showAllThemes ? '−' : '+' }}</span>
            </button>
          </template>

          <template v-else-if="active === 'graph'">
            <div class="graph-preview-sticky">
              <GraphPreview />
            </div>

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

            <p class="set-section">Bends</p>
            <p class="set-note">How branch turns and joins move through each cell.</p>
            <div class="graph-option-grid" role="radiogroup" aria-label="Bend style">
              <button
                v-for="option in bendOptions"
                :key="option.id"
                class="graph-style-card compact"
                :class="{ active: settings.graphBendStyle === option.id }"
                type="button"
                role="radio"
                :aria-checked="settings.graphBendStyle === option.id"
                @click="settings.graphBendStyle = option.id"
              >
                <span class="graph-mini-preview">
                  <svg viewBox="0 0 40 28" aria-hidden="true">
                    <path class="mini-flow" :d="option.d" />
                    <circle class="mini-node flow" cx="34" cy="14" r="2.5" />
                  </svg>
                </span>
                <b>{{ option.label }}</b>
              </button>
            </div>

            <p class="set-section">Collisions</p>
            <p class="set-note">How horizontal joins interact with vertical lanes.</p>
            <div class="graph-option-grid" role="radiogroup" aria-label="Collision style">
              <button
                v-for="option in collisionOptions"
                :key="option.id"
                class="graph-style-card compact"
                :class="{ active: settings.graphCollisionStyle === option.id }"
                type="button"
                role="radio"
                :aria-checked="settings.graphCollisionStyle === option.id"
                @click="settings.graphCollisionStyle = option.id"
              >
                <span class="graph-mini-preview">
                  <svg viewBox="0 0 40 28" aria-hidden="true">
                    <line class="mini-lane" x1="20" y1="2" x2="20" y2="26" />
                    <path v-for="d in option.paths" :key="d" class="mini-flow" :class="{ fade: option.fade }" :d="d" />
                  </svg>
                </span>
                <b>{{ option.label }}</b>
              </button>
            </div>

            <label class="set-row">
              <span>
                <b>Author avatars on nodes</b>
                <small>Replace commit markers with author pictures. Author details elsewhere use Gravatar, with your chosen creature as a fallback.</small>
              </span>
              <button class="toggle" :class="{ on: settings.graphAuthorAvatars }" type="button" role="switch" :aria-checked="settings.graphAuthorAvatars" aria-label="Author avatars" @click="settings.graphAuthorAvatars = !settings.graphAuthorAvatars"><i /></button>
            </label>

            <p class="set-section">Node glyphs</p>
            <p class="set-note">Commit marker shape used on the canvas rail. Semantic keeps circles for commits and diamonds for merges.</p>
            <div class="graph-option-grid" role="radiogroup" aria-label="Node glyph">
              <button
                v-for="option in nodeGlyphOptions"
                :key="option.id"
                class="graph-style-card compact"
                :class="{ active: settings.graphNodeGlyph === option.id }"
                type="button"
                role="radio"
                :aria-checked="settings.graphNodeGlyph === option.id"
                @click="settings.graphNodeGlyph = option.id"
              >
                <span class="graph-mini-preview">
                  <svg viewBox="0 0 40 28" aria-hidden="true">
                    <line class="mini-lane" x1="20" y1="2" x2="20" y2="26" />
                    <template v-if="option.id === 'semantic'">
                      <circle class="mini-node" cx="20" cy="9" r="4" />
                      <path class="mini-node" d="M20 15 L24.5 19.5 L20 24 L15.5 19.5 Z" />
                    </template>
                    <circle v-else-if="option.id === 'circle'" class="mini-node" cx="20" cy="14" r="5" />
                    <path v-else-if="option.id === 'diamond'" class="mini-node" d="M20 8 L26 14 L20 20 L14 14 Z" />
                    <rect v-else-if="option.id === 'square'" class="mini-node" x="15" y="9" width="10" height="10" />
                    <circle v-else-if="option.id === 'ring'" class="mini-ring" cx="20" cy="14" r="4.5" />
                    <rect v-else class="mini-node" x="16" y="7.5" width="8" height="13" rx="3" />
                  </svg>
                </span>
                <b>{{ option.label }}</b>
              </button>
            </div>

            <p class="set-section">View</p>
            <label class="set-row">
              <span>
                <b>Row density</b>
                <small>Adjust the commit table height without losing graph alignment.</small>
              </span>
              <select v-model="settings.graphRowDensity" class="select ui-field">
                <option v-for="option in rowDensityOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
            </label>
            <label class="set-row">
              <span>
                <b>Details panel</b>
                <small>Choose where selected commit details appear.</small>
              </span>
              <select v-model="settings.graphDetailPosition" class="select ui-field">
                <option v-for="option in detailPositionOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
            </label>
            <label class="set-row">
              <span>
                <b>Detail hash</b>
                <small>Show either quick scan hashes or the full commit identity.</small>
              </span>
              <select v-model="settings.graphDetailHash" class="select ui-field">
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

            <p class="set-section">History</p>
            <label class="set-row">
              <span>
                <b>Commit load limit</b>
                <small>Initial number of commits requested from the graph service.</small>
              </span>
              <select v-model.number="settings.graphLimit" class="select ui-field">
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

          <template v-else-if="active === 'diff'">
            <p class="set-section">Layout</p>
            <label class="set-row">
              <span>
                <b>Diff layout</b>
                <small>How diffs read: unified, side by side, merged inline edits, changes only, or the resulting file. Line-level staging works in unified.</small>
              </span>
              <select v-model="settings.diffLayout" class="select ui-field">
                <option v-for="option in diffLayoutOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
            </label>
            <label class="set-row">
              <span>
                <b>Row density</b>
                <small>Line height of diff rows.</small>
              </span>
              <select v-model="settings.diffDensity" class="select ui-field">
                <option v-for="option in diffDensityOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
            </label>
            <label class="set-row">
              <span>
                <b>Word highlights</b>
                <small>Mark the changed span inside modified line pairs.</small>
              </span>
              <button
                class="toggle"
                :class="{ on: settings.diffWordHighlights }"
                type="button"
                role="switch"
                :aria-checked="settings.diffWordHighlights"
                @click="settings.diffWordHighlights = !settings.diffWordHighlights"
              >
                <i />
              </button>
            </label>

            <p class="set-section">Changes list</p>
            <label class="set-row">
              <span>
                <b>Group by directory</b>
                <small>Fold the changed-files list into collapsible directory groups.</small>
              </span>
              <select v-model="settings.changesGroupByDir" class="select ui-field">
                <option v-for="option in groupByDirOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
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
