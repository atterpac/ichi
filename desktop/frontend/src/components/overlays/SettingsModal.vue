<script setup lang="ts">
import { computed, provide, ref, watch, type Component } from 'vue'
import { usePreferenceBindings } from '../../customization/usePreferences'
import { useDialogFocus } from '../../composables/useDialogFocus'
import AppearanceSettings from './AppearanceSettings.vue'
import RefLabelEditor from './RefLabelEditor.vue'
import SettingsDiffPreview from './SettingsDiffPreview.vue'
import SettingsPreview from './SettingsPreview.vue'
import { settingsPreviewTarget, settingsRevealControls } from './settingsPreview'
import GraphPreview from './GraphPreview.vue'
import ToastSettings from './ToastSettings.vue'
import PreferencesPanel from './PreferencesPanel.vue'
import WorkspaceSettings from './WorkspaceSettings.vue'
import UiButton from '../common/UiButton.vue'
import {
  PhGitDiff,
  PhGitFork,
  PhArrowLeft,
  PhMagnifyingGlass,
  PhPalette,
  PhTextAa,
  PhUserCircle,
  PhSlidersHorizontal,
  PhTag,
  PhX,
} from '@phosphor-icons/vue'

const emit = defineEmits<{
  close: []
  appearanceLab: []
  conflictDemo: []
  profiles: []
}>()

type Category = {
  id:
    | 'preferences'
    | 'workspaces'
    | 'general'
    | 'appearance'
    | 'typography'
    | 'avatars'
    | 'graph'
    | 'refs'
    | 'diff'
    | 'developer'
  label: string
  icon: Component
  group: string
}

const dialog = ref<HTMLElement | null>(null)
useDialogFocus(dialog, () => emit('close'))

const settings = usePreferenceBindings()
const props = defineProps<{ initialCategory?: Category['id']; initialProfile?: string }>()
const active = ref<Category['id']>(props.initialCategory || 'appearance')
const content = ref<HTMLElement | null>(null)
const query = ref('')
const previewTarget = ref<HTMLElement | null>(null)
provide(settingsPreviewTarget, previewTarget)
const showPreview = ref(false)
provide(settingsRevealControls, () => {
  showPreview.value = false
})
const hasPreview = computed(
  () =>
    ['appearance', 'typography', 'avatars', 'graph', 'refs', 'diff'].includes(page.value) ||
    (page.value === 'developer' && settings['developer.enabled']),
)
const descriptions: Record<Category['id'], string> = {
  appearance: 'Choose a color palette. Changes apply immediately.',
  typography: 'Adjust interface fonts, code fonts, and text size.',
  avatars: 'Choose how contributors appear when a photo is unavailable.',
  graph: 'Tune how history is drawn and what each commit shows.',
  refs: 'Design branch and tag labels. Apply when you’re ready.',
  general: 'Choose how Ichi handles everyday operations.',
  diff: 'Choose how code changes are displayed.',
  workspaces: 'Manage repositories and workspace behavior.',
  developer: 'Interface experiments and sample notifications.',
  preferences: 'Find, reset, import, or export individual settings.',
}
const page = computed(() => (query.value.trim() ? 'preferences' : active.value))
watch(
  () => page.value,
  () => {
    showPreview.value = false
    if (content.value) content.value.scrollTop = 0
  },
  { flush: 'post' },
)
const groups = ['Appearance', 'History', 'Workflow', 'Advanced']
function navigate(id: Category['id']) {
  query.value = ''
  active.value = id
}
const categories: Category[] = [
  {
    id: 'appearance',
    label: 'Themes',
    icon: PhPalette,
    group: 'Appearance',
  },
  {
    id: 'typography',
    label: 'Typography',
    icon: PhTextAa,
    group: 'Appearance',
  },
  {
    id: 'avatars',
    label: 'Avatars',
    icon: PhUserCircle,
    group: 'Appearance',
  },
  {
    id: 'graph',
    label: 'Graph',
    icon: PhGitFork,
    group: 'History',
  },
  {
    id: 'refs',
    label: 'Ref labels',
    icon: PhTag,
    group: 'History',
  },
  {
    id: 'general',
    label: 'General',
    icon: PhSlidersHorizontal,
    group: 'Workflow',
  },
  {
    id: 'diff',
    label: 'Diff',
    icon: PhGitDiff,
    group: 'Workflow',
  },
  {
    id: 'workspaces',
    label: 'Workspaces',
    icon: PhGitFork,
    group: 'Workflow',
  },
  {
    id: 'developer',
    label: 'Developer',
    icon: PhSlidersHorizontal,
    group: 'Advanced',
  },
  {
    id: 'preferences',
    label: 'Settings data',
    icon: PhSlidersHorizontal,
    group: 'Advanced',
  },
]
const diffLayoutOptions = [
  { id: 'unified', label: 'Unified', note: 'Old and new lines together' },
  { id: 'split', label: 'Side by side', note: 'Compare old and new columns' },
  { id: 'inline', label: 'Inline edits', note: 'Changes within each line' },
  { id: 'changes', label: 'Changes only', note: 'Hide unchanged context' },
  { id: 'result', label: 'Result file', note: 'Read the resulting code' },
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
  { id: 'classic', label: 'Classic' },
  { id: 'fine', label: 'Fine' },
  { id: 'bold', label: 'Bold' },
  { id: 'neon', label: 'Neon' },
  { id: 'mono', label: 'Mono' },
  { id: 'angular', label: 'Angular' },
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

const activeLabel = computed(() =>
  query.value.trim()
    ? 'Search results'
    : (categories.find((category) => category.id === page.value)?.label ?? 'Settings'),
)

function close() {
  emit('close')
}
</script>

<template>
  <div class="settings-workspace">
    <section
      ref="dialog"
      tabindex="-1"
      class="settings-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <nav class="set-nav" aria-label="Settings sections">
        <button class="set-back" type="button" @click="close">
          <PhArrowLeft :size="16" /> Back to workspace
        </button>
        <p class="set-title">Settings</p>
        <label class="set-search"
          ><PhMagnifyingGlass :size="16" aria-hidden="true" /><input
            v-model="query"
            type="search"
            placeholder="Search settings"
            aria-label="Search settings"
        /></label>
        <div class="set-nav-groups">
          <div
            v-for="group in groups"
            :key="group"
            class="set-nav-group"
            role="group"
            :aria-label="`${group} sections`"
          >
            <p class="set-nav-heading">{{ group }}</p>
            <button
              v-for="category in categories.filter((item) => item.group === group)"
              :key="category.id"
              class="set-catitem"
              :class="{ active: !query.trim() && active === category.id }"
              :aria-current="!query.trim() && active === category.id ? 'page' : undefined"
              type="button"
              @click="navigate(category.id)"
            >
              <component :is="category.icon" class="set-icon" :size="16" /><span
                class="set-catlabel"
                >{{ category.label }}</span
              >
            </button>
            <button
              v-if="group === 'Workflow'"
              class="set-catitem"
              type="button"
              @click="emit('profiles')"
            >
              <PhGitFork class="set-icon" :size="16" />Git profiles
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
      </nav>

      <div class="set-body">
        <header class="set-head">
          <div>
            <h2 id="settings-title">{{ activeLabel }}</h2>
            <p class="set-head-description">
              {{ query.trim() ? 'Settings matching your search' : descriptions[page] }}
            </p>
          </div>
          <UiButton
            v-if="hasPreview"
            class="set-preview-toggle"
            size="sm"
            :aria-pressed="showPreview"
            aria-controls="settings-preview-rail"
            @click="showPreview = !showPreview"
            >{{ showPreview ? 'Show controls' : 'Show preview' }}</UiButton
          >
          <UiButton size="sm" aria-label="Close settings" @click="close">
            esc <PhX :size="16" weight="bold" />
          </UiButton>
        </header>

        <div
          class="set-workarea"
          :class="{ 'has-preview': hasPreview, 'show-preview': showPreview }"
        >
          <div
            ref="content"
            class="set-content"
            :class="{ 'set-content-wide': ['appearance', 'graph', 'refs'].includes(page) }"
          >
            <PreferencesPanel v-if="page === 'preferences'" v-model:query="query" hide-search />
            <WorkspaceSettings
              v-else-if="page === 'workspaces'"
              :initial-profile="initialProfile"
              @profiles="emit('profiles')"
            />
            <template v-else-if="page === 'developer'"
              ><ToastSettings />
              <p class="set-section">Development previews</p>
              <UiButton @click="emit('conflictDemo')">Open conflict demo ↗</UiButton></template
            >
            <template v-else-if="page === 'general'">
              <p class="set-section">Safety</p>
              <label class="set-row">
                <span>
                  <b>Confirm destructive actions</b>
                  <small
                    >Keep a confirmation step before drop, reset, discard, or force-style
                    operations.</small
                  >
                </span>
                <button
                  class="toggle"
                  :class="{ on: settings['operations.confirmDestructive'] }"
                  type="button"
                  role="switch"
                  :aria-checked="settings['operations.confirmDestructive']"
                  @click="
                    settings['operations.confirmDestructive'] =
                      !settings['operations.confirmDestructive']
                  "
                >
                  <i />
                </button>
              </label>
            </template>

            <AppearanceSettings
              v-else-if="['appearance', 'typography', 'avatars'].includes(page)"
              :section="
                page === 'typography' ? 'Typography' : page === 'avatars' ? 'Avatars' : 'Themes'
              "
              @appearance-lab="emit('appearanceLab')"
            />

            <template v-else-if="page === 'graph'">
              <div class="settings-split graph-settings">
                <div class="settings-controls">
                  <p class="set-section">Canvas</p>
                  <div class="graph-style-grid">
                    <button
                      v-for="style in graphStyles"
                      :key="style.id"
                      class="graph-style-card"
                      :class="{ active: settings['graph.renderStyle'] === style.id }"
                      type="button"
                      :aria-pressed="settings['graph.renderStyle'] === style.id"
                      @click="settings['graph.renderStyle'] = style.id"
                    >
                      <span class="graph-style-preview" :class="`style-${style.id}`">
                        <i />
                        <i />
                        <i />
                      </span>
                      <b>{{ style.label }}</b>
                    </button>
                  </div>

                  <p class="set-section">Bends</p>
                  <div class="graph-option-grid" role="radiogroup" aria-label="Bend style">
                    <button
                      v-for="option in bendOptions"
                      :key="option.id"
                      class="graph-style-card compact"
                      :class="{ active: settings['graph.bendStyle'] === option.id }"
                      type="button"
                      role="radio"
                      :aria-checked="settings['graph.bendStyle'] === option.id"
                      @click="settings['graph.bendStyle'] = option.id"
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
                  <div class="graph-option-grid" role="radiogroup" aria-label="Collision style">
                    <button
                      v-for="option in collisionOptions"
                      :key="option.id"
                      class="graph-style-card compact"
                      :class="{ active: settings['graph.collisionStyle'] === option.id }"
                      type="button"
                      role="radio"
                      :aria-checked="settings['graph.collisionStyle'] === option.id"
                      @click="settings['graph.collisionStyle'] = option.id"
                    >
                      <span class="graph-mini-preview">
                        <svg viewBox="0 0 40 28" aria-hidden="true">
                          <line class="mini-lane" x1="20" y1="2" x2="20" y2="26" />
                          <path
                            v-for="d in option.paths"
                            :key="d"
                            class="mini-flow"
                            :class="{ fade: option.fade }"
                            :d="d"
                          />
                        </svg>
                      </span>
                      <b>{{ option.label }}</b>
                    </button>
                  </div>

                  <p class="set-section">Commit nodes</p>
                  <label class="set-row">
                    <span
                      ><b>Author avatars</b
                      ><small
                        >Use Gravatar portraits as commit nodes, with local placeholders when
                        unavailable.</small
                      ></span
                    >
                    <button
                      class="toggle"
                      :class="{ on: settings['graph.authorAvatars'] }"
                      type="button"
                      role="switch"
                      aria-label="Author avatars as commit nodes"
                      :aria-checked="settings['graph.authorAvatars']"
                      @click="settings['graph.authorAvatars'] = !settings['graph.authorAvatars']"
                    >
                      <i />
                    </button>
                  </label>
                  <p class="set-section">Node glyphs</p>
                  <p class="set-note">
                    Marker shapes used when author avatars are off. Semantic keeps circles for
                    commits and diamonds for merges.
                  </p>
                  <div class="graph-option-grid" role="radiogroup" aria-label="Node glyph">
                    <button
                      v-for="option in nodeGlyphOptions"
                      :key="option.id"
                      class="graph-style-card compact"
                      :class="{ active: settings['graph.nodeGlyph'] === option.id }"
                      type="button"
                      role="radio"
                      :aria-checked="settings['graph.nodeGlyph'] === option.id"
                      @click="settings['graph.nodeGlyph'] = option.id"
                    >
                      <span class="graph-mini-preview">
                        <svg viewBox="0 0 40 28" aria-hidden="true">
                          <line class="mini-lane" x1="20" y1="2" x2="20" y2="26" />
                          <template v-if="option.id === 'semantic'">
                            <circle class="mini-node" cx="20" cy="9" r="4" />
                            <path class="mini-node" d="M20 15 L24.5 19.5 L20 24 L15.5 19.5 Z" />
                          </template>
                          <circle
                            v-else-if="option.id === 'circle'"
                            class="mini-node"
                            cx="20"
                            cy="14"
                            r="5"
                          />
                          <path
                            v-else-if="option.id === 'diamond'"
                            class="mini-node"
                            d="M20 8 L26 14 L20 20 L14 14 Z"
                          />
                          <rect
                            v-else-if="option.id === 'square'"
                            class="mini-node"
                            x="15"
                            y="9"
                            width="10"
                            height="10"
                          />
                          <circle
                            v-else-if="option.id === 'ring'"
                            class="mini-ring"
                            cx="20"
                            cy="14"
                            r="4.5"
                          />
                          <rect
                            v-else
                            class="mini-node"
                            x="16"
                            y="7.5"
                            width="8"
                            height="13"
                            rx="3"
                          />
                        </svg>
                      </span>
                      <b>{{ option.label }}</b>
                    </button>
                  </div>

                  <p class="set-section">Row density</p>
                  <div class="setting-choice-grid" role="group" aria-label="Row density">
                    <button
                      v-for="option in rowDensityOptions"
                      :key="option.id"
                      type="button"
                      class="setting-choice"
                      :aria-pressed="settings['graph.rowDensity'] === option.id"
                      @click="settings['graph.rowDensity'] = option.id"
                    >
                      <span class="setting-density" :class="option.id" aria-hidden="true"
                        ><i v-for="n in 3" :key="n"><em />Commit message</i></span
                      >
                      <b>{{ option.label }}</b>
                    </button>
                  </div>
                  <p class="set-section">Details panel</p>
                  <div class="setting-choice-grid" role="group" aria-label="Details panel">
                    <button
                      v-for="option in detailPositionOptions"
                      :key="option.id"
                      type="button"
                      class="setting-choice"
                      :aria-pressed="settings['graph.detailPosition'] === option.id"
                      @click="settings['graph.detailPosition'] = option.id"
                    >
                      <span class="setting-panel" :class="option.id" aria-hidden="true"
                        ><i /><i /><i /><em v-if="option.id !== 'hidden'"
                      /></span>
                      <b>{{ option.label }}</b>
                    </button>
                  </div>
                  <label class="set-row">
                    <span>
                      <b>Detail hash</b>
                    </span>
                    <select v-model="settings['graph.detailHash']" class="select ui-field">
                      <option
                        v-for="option in detailHashOptions"
                        :key="option.id"
                        :value="option.id"
                      >
                        {{ option.label }}
                      </option>
                    </select>
                  </label>
                  <label class="set-row">
                    <span>
                      <b>Author and date</b>
                    </span>
                    <button
                      class="toggle"
                      :class="{ on: settings['graph.detailShowAuthorDate'] }"
                      type="button"
                      role="switch"
                      :aria-checked="settings['graph.detailShowAuthorDate']"
                      @click="
                        settings['graph.detailShowAuthorDate'] =
                          !settings['graph.detailShowAuthorDate']
                      "
                    >
                      <i />
                    </button>
                  </label>

                  <p class="set-section">History</p>
                  <label class="set-row">
                    <span>
                      <b>Commit load limit</b>
                      <small>Commits loaded when opening history.</small>
                    </span>
                    <select v-model.number="settings['graph.limit']" class="select ui-field">
                      <option :value="60">60</option>
                      <option :value="120">120</option>
                      <option :value="250">250</option>
                      <option :value="500">500</option>
                    </select>
                  </label>
                  <label class="set-row">
                    <span>
                      <b>Show author</b>
                    </span>
                    <button
                      class="toggle"
                      :class="{ on: settings['graph.showAuthor'] }"
                      type="button"
                      role="switch"
                      :aria-checked="settings['graph.showAuthor']"
                      @click="settings['graph.showAuthor'] = !settings['graph.showAuthor']"
                    >
                      <i />
                    </button>
                  </label>
                </div>
                <SettingsPreview
                  ><aside
                    class="settings-preview graph-settings-preview"
                    aria-label="Graph preview"
                  >
                    <GraphPreview />
                    <UiButton size="sm" @click="navigate('refs')">Customize ref labels →</UiButton>
                  </aside></SettingsPreview
                >
              </div>
            </template>

            <template v-else-if="page === 'diff'">
              <SettingsPreview><SettingsDiffPreview /></SettingsPreview>
              <p class="set-section">Diff layout</p>
              <p class="set-note">Line-level staging requires Unified.</p>
              <div class="setting-choice-grid" role="group" aria-label="Diff layout">
                <button
                  v-for="option in diffLayoutOptions"
                  :key="option.id"
                  type="button"
                  class="setting-choice"
                  :title="option.note"
                  :aria-pressed="settings['diff.layout'] === option.id"
                  @click="settings['diff.layout'] = option.id"
                >
                  <b>{{ option.label }}</b>
                </button>
              </div>
              <p class="set-section">Row density</p>
              <div class="setting-choice-grid" role="group" aria-label="Row density">
                <button
                  v-for="option in diffDensityOptions"
                  :key="option.id"
                  type="button"
                  class="setting-choice"
                  :aria-pressed="settings['diff.density'] === option.id"
                  @click="settings['diff.density'] = option.id"
                >
                  <span class="setting-density" :class="option.id" aria-hidden="true"
                    ><i v-for="n in 3" :key="n"><em />Line of code</i></span
                  >
                  <b>{{ option.label }}</b>
                </button>
              </div>
              <label class="set-row">
                <span>
                  <b>Word highlights</b>
                  <small>Mark the changed span inside modified line pairs.</small>
                </span>
                <button
                  class="toggle"
                  :class="{ on: settings['diff.wordHighlights'] }"
                  type="button"
                  role="switch"
                  :aria-checked="settings['diff.wordHighlights']"
                  @click="settings['diff.wordHighlights'] = !settings['diff.wordHighlights']"
                >
                  <i />
                </button>
              </label>

              <p class="set-section">Changes list</p>
              <label class="set-row">
                <span>
                  <b>Group by directory</b>
                </span>
                <select v-model="settings['changes.groupByDir']" class="select ui-field">
                  <option v-for="option in groupByDirOptions" :key="option.id" :value="option.id">
                    {{ option.label }}
                  </option>
                </select>
              </label>
            </template>

            <KeepAlive><RefLabelEditor v-if="page === 'refs'" /></KeepAlive>
          </div>
          <aside
            v-show="hasPreview"
            id="settings-preview-rail"
            class="set-preview-rail"
            aria-label="Live settings preview"
          >
            <header class="set-preview-heading">
              <strong>Live preview</strong
              ><span>{{
                page === 'refs' ? 'Draft · apply to save' : 'Updates as you change settings'
              }}</span>
            </header>
            <div ref="previewTarget" class="set-preview-stage" />
          </aside>
        </div>
      </div>
    </section>
  </div>
</template>
