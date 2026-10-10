<script setup lang="ts">
import { settingsRevealControls } from './settingsPreview'
import SettingsPreview from './SettingsPreview.vue'
import { computed, inject, nextTick, ref, watch } from 'vue'
import { usePreferences } from '../../customization/usePreferences'
import {
  defaultRefLabels,
  refIcons,
  refPresentation,
  validateRefLabels,
  type RefKind,
  type RefLabelConfig,
  type RefStyle,
} from '../../customization/refLabels'
import { formatRef } from '../../customization/refFormatter'
import RefLabel from '../common/RefLabel.vue'
import UiButton from '../common/UiButton.vue'

const preferences = usePreferences()
const revealControls = inject(settingsRevealControls, () => {})
const editor = ref<HTMLElement | null>(null)
const clone = (value: RefLabelConfig): RefLabelConfig => JSON.parse(JSON.stringify(value))
const draft = ref(clone(preferences.values.value['graph.refLabels']))
const target = ref<RefKind>('remote')
const selectedRemote = ref('')
const remoteScope = ref('')
const newRemote = ref('')
const message = ref('')
const previewWidth = ref(160)
const sampleBranch = ref('feature/search')
const overridesOpen = ref(false)
const previewRemote = ref('origin')
const sampleRemotes = ref(['origin', 'upstream'])
type Example = { name: string; kind: RefKind; current: boolean; remote?: string }
const errors = ref<string[]>([])
const validating = ref(false)
const dirty = computed(
  () => JSON.stringify(draft.value) !== JSON.stringify(preferences.values.value['graph.refLabels']),
)
watch(
  () => preferences.values.value['graph.refLabels'],
  (value, previous) => {
    if (JSON.stringify(draft.value) === JSON.stringify(previous)) {
      draft.value = clone(value)
      selectedRemote.value = ''
      remoteScope.value = ''
      previewRemote.value = 'origin'
    }
  },
)
const style = computed(() =>
  target.value === 'remote' && selectedRemote.value
    ? draft.value.remotes[selectedRemote.value]!
    : draft.value.kinds[target.value],
)
const remoteNames = computed(() => [
  ...new Set([...sampleRemotes.value, ...Object.keys(draft.value.remotes)]),
])
const examples = computed<Example[]>(() => [
  { name: sampleBranch.value, kind: 'branch', current: false },
  ...remoteNames.value.map((remote) => ({
    name: `${remote}/${sampleBranch.value}`,
    kind: 'remote' as const,
    current: false,
    remote,
  })),
  { name: 'v1.2.0', kind: 'tag', current: false },
  { name: 'HEAD', kind: 'head', current: false },
])
watch(
  [draft, examples],
  async (_, __, cleanup) => {
    let active = true
    cleanup(() => {
      active = false
    })
    validating.value = true
    const problem = validateRefLabels(draft.value)
    if (problem) {
      errors.value = [problem]
      validating.value = false
      return
    }
    const samples = examples.value.flatMap((example) =>
      [false, true].flatMap((expanded) =>
        [false, true].map((current) => {
          const presentation = refPresentation(
            draft.value,
            example.name,
            example.kind,
            current,
            expanded,
          )
          return {
            request: presentation.request,
            label: `${example.kind === 'remote' ? presentation.request.Remote : example.kind} (${expanded ? 'expanded' : 'compact'})`,
          }
        }),
      ),
    )
    const results = await Promise.all(samples.map((sample) => formatRef(sample.request)))
    if (!active) return
    errors.value = [
      ...new Set(
        results.flatMap((result, i) =>
          result.Error ? [`${samples[i]!.label}: ${result.Error}`] : [],
        ),
      ),
    ]
    validating.value = false
  },
  { immediate: true, deep: true },
)
function selectType(kind: RefKind) {
  target.value = kind
  message.value = ''
}
function selectRemote(name: string) {
  remoteScope.value = name
  previewRemote.value = name || 'origin'
  selectedRemote.value = name && draft.value.remotes[name] ? name : ''
  message.value = ''
}
function setStyle<K extends keyof RefStyle>(key: K, value: RefStyle[K]) {
  if (target.value === 'remote' && remoteScope.value && !selectedRemote.value) {
    const next = clone(draft.value)
    Object.defineProperty(next.remotes, remoteScope.value, {
      value: { ...draft.value.kinds.remote },
      enumerable: true,
      writable: true,
      configurable: true,
    })
    draft.value = next
    selectedRemote.value = remoteScope.value
  }
  style.value[key] = value
}
function addRemote() {
  const name = newRemote.value.trim()
  if (!name || Object.prototype.hasOwnProperty.call(draft.value.remotes, name)) {
    message.value = 'Enter a new remote name.'
    return
  }
  const next = clone(draft.value)
  Object.defineProperty(next.remotes, name, {
    value: { ...next.kinds.remote },
    enumerable: true,
    writable: true,
    configurable: true,
  })
  const problem = validateRefLabels(next)
  if (problem) {
    message.value = problem
    return
  }
  draft.value = next
  target.value = 'remote'
  previewRemote.value = name
  if (!sampleRemotes.value.includes(name)) sampleRemotes.value.push(name)
  selectedRemote.value = name
  remoteScope.value = name
  newRemote.value = ''
  message.value = ''
}
function removeRemote() {
  delete draft.value.remotes[selectedRemote.value]
  selectedRemote.value = ''
  message.value = ''
}
function resetDraft() {
  remoteScope.value = ''
  previewRemote.value = 'origin'
  draft.value = clone(defaultRefLabels)
  selectedRemote.value = ''
  message.value = ''
}
function discard() {
  remoteScope.value = ''
  previewRemote.value = 'origin'
  draft.value = clone(preferences.values.value['graph.refLabels'])
  selectedRemote.value = ''
  message.value = ''
}
function apply() {
  if (validating.value || errors.value.length) return
  preferences.set('graph.refLabels', clone(draft.value))
  message.value = 'Ref labels applied.'
}
const refTypes = [
  { id: 'branch', label: 'Branch', name: 'feature/search' },
  { id: 'remote', label: 'Remote branch', name: 'origin/feature/search' },
  { id: 'tag', label: 'Tag', name: 'v1.2.0' },
  { id: 'head', label: 'HEAD', name: 'HEAD' },
] as const
const presets = computed(() => [
  {
    label: 'Name only',
    format: target.value === 'remote' ? '{{.Branch}}' : '{{.Name}}',
    icon: 'none' as const,
  },
  {
    label: 'Icon + name',
    format: target.value === 'remote' ? '{{.Branch}}' : '{{.Name}}',
    icon: defaultRefLabels.kinds[target.value].icon,
  },
  ...(target.value === 'remote'
    ? [{ label: 'Remote + branch', format: '{{.Name}}', icon: 'cloud' as const }]
    : []),
])
function choosePreset(preset: (typeof presets.value)[number]) {
  setStyle('icon', preset.icon)
  setStyle('compact', preset.format)
  setStyle('expanded', preset.format)
}
const simple = computed(
  () =>
    ['{{.Name}}', '{{.Branch}}'].includes(style.value.compact) &&
    ['{{.Name}}', '{{.Branch}}'].includes(style.value.expanded),
)
function showRemote(enabled: boolean) {
  setStyle('compact', enabled ? '{{.Name}}' : '{{.Branch}}')
  setStyle('expanded', enabled ? '{{.Name}}' : '{{.Branch}}')
}
function editExample(example: Example) {
  revealControls()
  void nextTick(() =>
    editor.value
      ?.querySelector<HTMLButtonElement>('[aria-label="Label type"] [aria-pressed="true"]')
      ?.focus(),
  )
  selectType(example.kind)
  if (example.kind === 'remote') {
    selectRemote(example.remote || '')
    overridesOpen.value = true
  }
}
const selectedExamples = computed<Example[]>(() => {
  const make = (name: string, current = false): Example => ({
    name: target.value === 'remote' ? `${previewRemote.value}/${name}` : name,
    kind: target.value,
    current,
    remote: target.value === 'remote' ? previewRemote.value : undefined,
  })
  if (target.value === 'tag') return [make('v1.2.0'), make('release/2026-10-stable')]
  if (target.value === 'head') return [make('HEAD'), make('HEAD', true)]
  return [
    make('main'),
    make(sampleBranch.value),
    make('feature/improve-contributor-history-navigation'),
    ...(target.value === 'branch' ? [make('main', true)] : []),
  ]
})
const previewConfig = computed(() => {
  const value = clone(draft.value)
  if (target.value === 'remote' && !remoteScope.value) delete value.remotes[previewRemote.value]
  return value
})
const colors = ['lane', 'accent', 'blue', 'green', 'orange', 'purple', 'red'] as const
const backgrounds = ['filled', 'outline', 'plain'] as const
</script>
<template>
  <section ref="editor" class="ref-editor" aria-label="Ref label editor">
    <div class="ref-edit-controls">
      <h3>Label type</h3>
      <div class="ref-options" role="group" aria-label="Label type">
        <button
          v-for="type in refTypes"
          :key="type.id"
          :aria-pressed="target === type.id"
          @click="selectType(type.id)"
        >
          {{ type.label }}
        </button>
      </div>
      <div v-if="target === 'remote'" class="remote-scope">
        <p>
          <strong>{{ remoteScope || 'All remotes' }}</strong
          ><span>{{
            remoteScope
              ? selectedRemote
                ? 'Custom style'
                : 'Using shared style until edited'
              : 'Shared style · specific overrides keep their own style'
          }}</span>
        </p>
        <button v-if="remoteScope" @click="selectRemote('')">← All remotes</button>
        <details
          :open="overridesOpen"
          @toggle="overridesOpen = ($event.target as HTMLDetailsElement).open"
        >
          <summary>Customize a specific remote…</summary>
          <div class="ref-options" role="group" aria-label="Remote style">
            <button
              v-for="remote in remoteNames"
              :key="remote"
              :aria-label="`Edit ${remote}`"
              :aria-pressed="remoteScope === remote"
              @click="selectRemote(remote)"
            >
              {{ remote }}{{ draft.remotes[remote] ? ' · custom' : '' }}
            </button>
          </div>
          <form class="remote-add" @submit.prevent="addRemote">
            <input
              v-model="newRemote"
              class="ui-field"
              aria-label="New remote name"
              placeholder="Another remote name"
              maxlength="128"
            /><UiButton @click="addRemote">Add override</UiButton>
          </form>
          <UiButton v-if="selectedRemote" size="sm" @click="removeRemote"
            >Use shared style</UiButton
          >
        </details>
      </div>
      <h3>Start with a preset</h3>
      <div class="ref-presets" role="group" aria-label="Label preset">
        <button
          v-for="preset in presets"
          :key="preset.label"
          :aria-pressed="
            style.compact === preset.format &&
            style.expanded === preset.format &&
            style.icon === preset.icon
          "
          @click="choosePreset(preset)"
        >
          <strong>{{ preset.label }}</strong
          ><small>{{
            preset.label === 'Remote + branch'
              ? 'origin / feature/search'
              : target === 'tag'
                ? 'v1.2.0'
                : target === 'head'
                  ? 'HEAD'
                  : 'feature/search'
          }}</small>
        </button>
      </div>
      <h3>Content</h3>
      <label class="ref-setting"
        ><span>Show icon</span
        ><input
          type="checkbox"
          :checked="style.icon !== 'none'"
          @change="
            setStyle(
              'icon',
              ($event.target as HTMLInputElement).checked
                ? defaultRefLabels.kinds[target].icon
                : 'none',
            )
          "
      /></label>
      <label v-if="target === 'remote'" class="ref-setting"
        ><span
          >Show remote name<small v-if="!simple"
            >Choose a preset to return from custom formatting.</small
          ></span
        ><input
          type="checkbox"
          :disabled="!simple"
          :checked="style.compact === '{{.Name}}'"
          @change="showRemote(($event.target as HTMLInputElement).checked)"
      /></label>
      <h3>Appearance</h3>
      <fieldset v-if="style.icon !== 'none'">
        <legend>Icon</legend>
        <div class="icon-choices" role="group" aria-label="Ref icon">
          <button
            v-for="(icon, id) in refIcons"
            :key="id"
            :aria-label="icon.label"
            :title="icon.label"
            :aria-pressed="style.icon === id"
            @click="setStyle('icon', id)"
          >
            <component v-if="icon.component" :is="icon.component" :size="18" /><span v-else>{{
              id === 'dot' ? '•' : '∅'
            }}</span>
          </button>
        </div>
      </fieldset>
      <label class="ref-setting"
        ><span>Color</span
        ><select
          class="ui-field"
          aria-label="Label color"
          :value="style.color || 'lane'"
          @change="
            setStyle('color', ($event.target as HTMLSelectElement).value as (typeof colors)[number])
          "
        >
          <option v-for="color in colors" :key="color" :value="color">
            {{ color === 'lane' ? 'Follow graph lane' : color[0]!.toUpperCase() + color.slice(1) }}
          </option>
        </select></label
      >
      <label class="ref-setting"
        ><span>Background</span
        ><select
          class="ui-field"
          aria-label="Label background"
          :value="style.background || 'filled'"
          @change="
            setStyle(
              'background',
              ($event.target as HTMLSelectElement).value as (typeof backgrounds)[number],
            )
          "
        >
          <option v-for="background in backgrounds" :key="background" :value="background">
            {{ background[0]!.toUpperCase() + background.slice(1) }}
          </option>
        </select></label
      >
      <details class="ref-advanced">
        <summary>Advanced formatting</summary>
        <p>
          Set different text for the graph and inspector. Choosing a preset replaces both templates.
        </p>
        <label v-for="mode in ['compact', 'expanded'] as const" :key="mode"
          >{{ mode === 'compact' ? 'Compact · graph' : 'Expanded · inspector'
          }}<input
            :id="`ref-format-${mode}`"
            class="ui-field"
            :aria-label="`${mode} custom template`"
            :value="style[mode]"
            @input="setStyle(mode, ($event.target as HTMLInputElement).value)"
            spellcheck="false"
        /></label>
        <p>
          <code>.Name</code> · <code>.Branch</code> · <code>.Remote</code> · <code>.Kind</code> ·
          <code>.Current</code>
        </p>
        <small>Go templates · one line, up to 512 bytes.</small
        ><UiButton size="sm" @click="resetDraft">Restore all defaults</UiButton>
      </details>
      <p v-if="message" role="status">{{ message }}</p>
    </div>
    <footer class="ref-actions">
      <span role="status">{{
        validating ? 'Checking formats…' : dirty ? 'Unapplied changes' : 'Using saved style'
      }}</span
      ><UiButton :disabled="!dirty" @click="discard">Revert</UiButton
      ><UiButton
        variant="primary"
        :disabled="!dirty || validating || !!errors.length"
        @click="apply"
        >Apply ref labels</UiButton
      >
    </footer>
    <SettingsPreview
      ><div class="ref-stage ref-live-preview" aria-label="Ref preview">
        <h3>
          {{ refTypes.find((type) => type.id === target)?.label
          }}<template v-if="remoteScope"> · {{ remoteScope }}</template>
        </h3>
        <p class="preview-help">Sample labels · click a remote below to customize it.</p>
        <label class="ref-width"
          >Compact width
          <input
            v-model.number="previewWidth"
            type="range"
            min="80"
            max="300"
            aria-label="Badge preview width"
          /><span>{{ previewWidth }}px</span></label
        >
        <div class="ref-samples" aria-label="Ref label preview">
          <section
            v-for="expanded in [false, true]"
            :key="String(expanded)"
            class="ref-preview-card"
          >
            <h4>{{ expanded ? 'Expanded · inspector' : 'Compact · graph' }}</h4>
            <div
              v-for="example in selectedExamples"
              :key="`${example.name}-${example.current}`"
              class="ref-example"
              :class="{ selected: example.current }"
            >
              <RefLabel
                v-bind="example"
                :config="previewConfig"
                :expanded="expanded"
                :style="{ maxWidth: expanded ? '100%' : `${previewWidth}px` }"
              /><small v-if="example.current">Current branch</small>
            </div>
          </section>
        </div>
        <ul v-if="errors.length" class="ref-errors" role="alert">
          <li v-for="error in errors" :key="error">{{ error }}</li>
        </ul>
        <section v-if="target === 'remote'" class="ref-preview-card">
          <h4>Remote styles</h4>
          <button
            v-for="remote in remoteNames"
            :key="remote"
            class="remote-example"
            :aria-label="`Customize ${remote} from preview`"
            @click="editExample({ name: `${remote}/main`, kind: 'remote', current: false, remote })"
          >
            <RefLabel :name="`${remote}/main`" kind="remote" :config="draft" expanded /><small>{{
              draft.remotes[remote] ? 'Custom' : 'Shared'
            }}</small>
          </button>
        </section>
      </div></SettingsPreview
    >
  </section>
</template>
<style scoped>
.ref-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  gap: 20px;
}
.ref-edit-controls {
  overflow: auto;
  padding-right: 6px;
  flex: 1;
  min-width: 0;
}
h3 {
  margin: 24px 0 12px;
  font-size: 13px;
  color: var(--head);
  font-weight: 600;
}
h3:first-child {
  margin-top: 0;
}
.ref-options,
.icon-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
button {
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  color: var(--text);
  background: var(--surface-panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
}
button[aria-pressed='true'] {
  background: var(--selected);
  border-color: var(--accent);
  color: var(--accent-text);
}
button:focus-visible,
input:focus-visible,
select:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.remote-scope {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-base);
}
.remote-scope p {
  margin: 0 0 12px;
  font-size: 12px;
}
.remote-scope span,
small {
  display: block;
  color: var(--text-mut);
  font-size: 11px;
  margin-top: 5px;
  line-height: 1.5;
}
summary {
  cursor: pointer;
  font-size: 12px;
}
details .ref-options {
  margin-top: 12px;
}
.remote-add {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}
.remote-add input {
  min-width: 0;
  flex: 1;
  width: 100px;
}
.ref-presets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
  gap: 8px;
}
.ref-presets button {
  text-align: left;
  padding: 12px;
}
.ref-presets strong {
  font-weight: 500;
}
.ref-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  font-size: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}
.ref-setting select {
  max-width: 200px;
}
.ref-setting input {
  accent-color: var(--accent);
}
fieldset {
  border: 0;
  padding: 0;
  margin: 0 0 12px;
}
legend {
  font-size: 12px;
  color: var(--text-mut);
  margin-bottom: 10px;
}
.icon-choices button {
  width: 34px;
  height: 34px;
  padding: 6px;
  display: grid;
  place-items: center;
}
.ref-advanced {
  margin-top: 24px;
  font-size: 12px;
}
.ref-advanced p {
  color: var(--text-mut);
  line-height: 1.6;
}
.ref-advanced label {
  display: grid;
  gap: 8px;
  margin: 16px 0;
}
.ref-advanced input {
  width: 100%;
  font-family: var(--font-mono);
}
.ref-advanced .ui-button {
  margin-top: 16px;
}
.ref-actions {
  position: relative;
  flex: none;
  bottom: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px 0;
  background: var(--surface-panel);
  border-top: 1px solid var(--border);
  margin-top: auto;
}
.ref-actions > span {
  margin-right: auto;
  font-size: 11px;
  color: var(--text-mut);
}
.preview-help {
  font-size: 11px;
  color: var(--text-mut);
  line-height: 1.6;
}
.ref-width {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  margin: 16px 0;
}
.ref-width input {
  min-width: 60px;
  width: 100px;
  flex: 1;
  accent-color: var(--accent);
}
.ref-preview-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-panel);
  padding: 12px;
  margin-bottom: 14px;
  min-width: 0;
}
.ref-preview-card h4 {
  margin: 0 0 12px;
  font-size: 11px;
  color: var(--text-mut);
  font-weight: 500;
}
.ref-example {
  padding: 8px 0;
  min-width: 0;
}
.ref-example.selected {
  background: var(--selected);
  padding: 8px;
  border-radius: 4px;
}
.remote-example {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  text-align: left;
  margin: 6px 0;
}
.remote-example small {
  flex: none;
}
.ref-errors {
  color: var(--negative-text);
  font-size: 11px;
  overflow-wrap: anywhere;
  padding-left: 16px;
}
@media (max-width: 620px) {
  .ref-actions {
    bottom: 0;
  }
}
</style>
