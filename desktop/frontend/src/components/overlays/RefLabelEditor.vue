<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
const clone = (value: RefLabelConfig): RefLabelConfig => JSON.parse(JSON.stringify(value))
const draft = ref(clone(preferences.values.value['graph.refLabels']))
const target = ref<RefKind>('remote')
const selectedRemote = ref('')
const remoteScope = ref('')
const newRemote = ref('')
const message = ref('')
const previewWidth = ref(160)
const sampleBranch = ref('feature/search')
const mode = ref<'compact' | 'expanded'>('compact')
const previewRemote = ref('origin')
const sampleRemotes = ref(['origin', 'upstream'])
const sampleSubjects = [
  'Add search shortcuts',
  'Polish the finder',
  'Update dependencies',
  'Release 1.2.0',
  'Check out a commit',
]
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
function isSelected(example: Example) {
  if (target.value !== example.kind) return false
  if (example.kind !== 'remote') return true
  return remoteScope.value
    ? example.remote === remoteScope.value
    : !draft.value.remotes[example.remote!]
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
  { id: 'branch', label: 'Local branches', name: 'feature/search' },
  { id: 'remote', label: 'Remotes', name: 'origin/feature/search' },
  { id: 'tag', label: 'Tags', name: 'v1.2.0' },
  { id: 'head', label: 'HEAD', name: 'HEAD' },
] as const
const selectedExample = computed(() => ({
  name:
    target.value === 'remote'
      ? `${previewRemote.value}/${sampleBranch.value}`
      : target.value === 'branch'
        ? sampleBranch.value
        : target.value === 'tag'
          ? 'v1.2.0'
          : 'HEAD',
  kind: target.value,
}))
function presetConfig(format: string): RefLabelConfig {
  const config = clone(draft.value)
  if (target.value === 'remote' && !selectedRemote.value) delete config.remotes[previewRemote.value]
  const selected =
    target.value === 'remote' && selectedRemote.value
      ? config.remotes[selectedRemote.value]!
      : config.kinds[target.value]
  selected.compact = format
  selected.expanded = format
  return config
}
const presets = computed(() => [
  { label: 'Full ref name', format: '{{.Name}}' },
  ...(target.value === 'remote'
    ? [
        { label: 'Branch only', format: '{{.Branch}}' },
        { label: 'Branch · remote', format: '{{.Branch}} · {{.Remote}}' },
      ]
    : []),
])
</script>

<template>
  <section class="ref-editor" aria-label="Ref label editor">
    <div class="ref-stage ref-live-preview" aria-label="Ref preview">
      <div class="ref-target-picker" role="group" aria-label="Label type">
        <button
          v-for="type in refTypes"
          :key="type.id"
          type="button"
          :aria-pressed="target === type.id"
          @click="selectType(type.id)"
        >
          {{ type.label }}
        </button>
      </div>
      <div
        v-if="target === 'remote'"
        class="ref-remote-picker"
        role="group"
        aria-label="Remote style"
      >
        <button type="button" :aria-pressed="!remoteScope" @click="selectRemote('')">
          All remotes
        </button>
        <button
          v-for="remote in remoteNames"
          :key="remote"
          type="button"
          :aria-label="`Edit ${remote}`"
          :aria-pressed="remoteScope === remote"
          @click="selectRemote(remote)"
        >
          {{ remote }}<i v-if="draft.remotes[remote]" class="ref-custom-dot" aria-hidden="true" />
        </button>
      </div>
      <div class="ref-stage-toolbar">
        <div class="set-segmented" role="group" aria-label="Label mode">
          <button
            v-for="item in ['compact', 'expanded'] as const"
            :key="item"
            type="button"
            :aria-pressed="mode === item"
            @click="mode = item"
          >
            {{ item === 'compact' ? 'Compact' : 'Expanded' }}
          </button>
        </div>
        <label class="ref-width"
          >Width
          <input
            v-model.number="previewWidth"
            type="range"
            min="80"
            max="360"
            aria-label="Badge preview width"
            :disabled="mode === 'expanded'"
        /></label>
      </div>
      <div class="ref-samples" aria-label="Ref label preview">
        <div
          v-for="(example, index) in examples"
          :key="example.name"
          class="ref-scene-row"
          :class="{ selected: isSelected(example) }"
        >
          <span class="ref-scene-rail" aria-hidden="true"
            ><i :class="{ merge: example.kind === 'tag' }"
          /></span>
          <span class="ref-scene-subject">{{ sampleSubjects[index % sampleSubjects.length] }}</span>
          <span class="ref-scene-badge">
            <RefLabel
              v-bind="example"
              :config="draft"
              :expanded="mode === 'expanded'"
              :style="{ maxWidth: mode === 'compact' ? `${previewWidth}px` : '100%' }"
            />
          </span>
          <span
            v-if="example.remote && draft.remotes[example.remote]"
            class="ref-custom-dot"
            :title="`${example.remote} has a custom style`"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>

    <div class="ref-inspector">
      <header class="ref-inspector-head">
        <h3>
          {{
            target === 'remote'
              ? remoteScope || 'All remotes'
              : refTypes.find((type) => type.id === target)?.label
          }}
        </h3>
        <div v-if="target === 'remote' && remoteScope" class="ref-scope">
          <UiButton v-if="selectedRemote" size="sm" @click="removeRemote"
            >Use shared style</UiButton
          >
          <span v-else class="ref-scope-note">Shared style</span>
        </div>
        <details v-if="target === 'remote'" class="ref-add-remote">
          <summary>Add remote</summary>
          <form class="remote-add" @submit.prevent="addRemote">
            <input
              v-model="newRemote"
              class="ui-field"
              aria-label="New remote name"
              placeholder="e.g. upstream"
              maxlength="128"
            />
            <UiButton @click="addRemote">Add override</UiButton>
          </form>
        </details>
      </header>
      <div class="ref-tools">
        <fieldset class="ref-icon-tool">
          <legend>Icon</legend>
          <div class="icon-choices" role="group" aria-label="Ref icon">
            <button
              v-for="(icon, id) in refIcons"
              :key="id"
              type="button"
              :aria-label="icon.label"
              :title="icon.label"
              :aria-pressed="style.icon === id"
              @click="setStyle('icon', id)"
            >
              <component :is="icon.component" v-if="icon.component" :size="20" aria-hidden="true" />
              <span v-else-if="id === 'dot'" class="icon-dot" aria-hidden="true" />
              <span v-else aria-hidden="true">∅</span>
            </button>
          </div>
        </fieldset>
        <fieldset class="ref-text-tool">
          <legend>{{ mode === 'compact' ? 'Compact text' : 'Expanded text' }}</legend>
          <div class="ref-format-options" role="group" :aria-label="`${mode} format preset`">
            <button
              v-for="preset in presets"
              :key="preset.format"
              type="button"
              class="ref-format-choice"
              :aria-pressed="style[mode] === preset.format"
              :data-format="preset.format"
              @click="setStyle(mode, preset.format)"
            >
              <RefLabel v-bind="selectedExample" :config="presetConfig(preset.format)" expanded />
              <span>{{ preset.label }}</span
              ><span class="ref-choice-check" aria-hidden="true">{{
                style[mode] === preset.format ? '✓' : ''
              }}</span>
            </button>
          </div>
          <details
            :key="`${target}-${selectedRemote}-${mode}`"
            class="format-custom"
            :open="!presets.some((p) => p.format === style[mode])"
          >
            <summary>Custom template</summary>
            <input
              :id="`ref-format-${mode}`"
              :value="style[mode]"
              @input="setStyle(mode, ($event.target as HTMLInputElement).value)"
              class="ui-field format-input"
              spellcheck="false"
              :aria-label="`${mode} custom template`"
            />
            <p>
              <code>.Name</code> · <code>.Branch</code> · <code>.Remote</code> ·
              <code>.Kind</code> · <code>.Current</code>
            </p>
            <p class="ref-template-note">
              Go templates · one line, up to 512 bytes · evaluated in the desktop app.
            </p>
          </details>
        </fieldset>
      </div>
      <details class="ref-sample-options">
        <summary>Sample branch</summary>
        <input v-model="sampleBranch" class="ui-field" aria-label="Sample branch" maxlength="128" />
      </details>
      <p v-if="validating" role="status">Checking formats…</p>
      <ul v-if="errors.length" class="ref-errors" role="alert">
        <li v-for="error in errors" :key="error">{{ error }}</li>
      </ul>
      <p v-if="message" role="status">{{ message }}</p>
    </div>
    <div class="ref-actions">
      <span class="ref-save-state">{{ dirty ? 'Unapplied changes' : '' }}</span>
      <UiButton :disabled="!dirty" @click="discard">Discard edits</UiButton>
      <UiButton @click="resetDraft">Restore defaults</UiButton>
      <UiButton variant="primary" :disabled="!dirty || validating || !!errors.length" @click="apply"
        >Apply ref labels</UiButton
      >
    </div>
  </section>
</template>

<style scoped>
.ref-editor {
  display: flex;
  flex-direction: column;
  gap: 28px;
  min-height: 100%;
}
.ref-stage {
  position: sticky;
  top: 0;
  z-index: 9;
  flex: none;
  max-height: 48vh;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--read-bg);
}
.ref-stage-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
}
.ref-width {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--fs-xs);
  color: var(--text-mut);
}
.ref-width input {
  width: 100px;
  accent-color: var(--accent);
}
.ref-samples {
  padding: 8px 20px 16px;
}
.ref-scene-row {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 36px;
  padding-right: 10px;
  border-radius: var(--radius-sm);
}
.ref-scene-row.selected {
  background: var(--selected);
}
.ref-scene-rail {
  position: relative;
  display: grid;
  place-items: center;
  width: 30px;
  height: 36px;
  flex: none;
}
.ref-scene-rail::before {
  content: '';
  position: absolute;
  width: 2px;
  inset-block: 0;
  background: var(--accent);
  opacity: 0.5;
}
.ref-scene-rail i {
  position: relative;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  outline: 3px solid var(--read-bg);
}
.ref-scene-rail i.merge {
  border-radius: 1px;
  transform: rotate(45deg);
}
.ref-scene-subject {
  flex: 1;
  min-width: 0;
  color: var(--text-dim);
  font-size: var(--fs-sm);
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
.ref-scene-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 60%;
  padding: 4px 8px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text-mut);
}
.ref-custom-dot {
  height: 5px;
  width: 5px;
  border-radius: 50%;
  background: var(--accent);
  flex: none;
}
.ref-inspector {
  padding: 0 4px;
}
.ref-inspector-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 28px;
}
.ref-inspector-head h3 {
  margin: 0;
  font-size: var(--fs-md);
  font-weight: 500;
  color: var(--head);
}
.ref-scope {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ref-scope-note {
  color: var(--text-mut);
  font-size: var(--fs-xs);
}
.ref-add-remote {
  margin-left: auto;
  position: relative;
  font-size: var(--fs-sm);
  color: var(--text-dim);
}
summary {
  cursor: pointer;
}
.remote-add {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.remote-add input {
  width: 160px;
  min-width: 0;
}
.ref-tools {
  display: grid;
  grid-template-columns: minmax(180px, 0.55fr) minmax(0, 1fr);
  gap: 40px;
}
fieldset {
  min-width: 0;
  padding: 0;
  margin: 0;
  border: 0;
}
legend {
  font-size: var(--fs-sm);
  color: var(--text-mut);
  margin-bottom: 16px;
  padding: 0;
}
.icon-choices {
  display: grid;
  grid-template-columns: repeat(6, 36px);
  gap: 8px;
}
.icon-choices button {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-dim);
  background: transparent;
}
.icon-choices button:hover {
  color: var(--text);
  background: var(--hover);
}
.icon-choices button[aria-pressed='true'] {
  border-color: var(--accent);
  color: var(--accent-text);
  background: var(--selected);
}
.icon-dot {
  height: 6px;
  width: 6px;
  border-radius: 50%;
  background: currentColor;
}
.ref-format-options {
  display: grid;
  gap: 8px;
}
.ref-format-choice {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-dim);
  background: transparent;
  text-align: left;
}
.ref-format-choice > span:nth-child(2) {
  margin-left: auto;
  font-size: var(--fs-xs);
  white-space: nowrap;
}
.ref-format-choice[aria-pressed='true'] {
  border-color: var(--accent);
  background: var(--selected);
}
.ref-choice-check {
  width: 12px;
  color: var(--accent-text);
  flex: none;
}
.format-custom,
.ref-sample-options {
  margin-top: 16px;
  color: var(--text-mut);
  font-size: var(--fs-sm);
}
.format-input,
.ref-sample-options input {
  display: block;
  width: 100%;
  margin-top: 12px;
  font-family: var(--font-mono);
}
.ref-template-note {
  line-height: 1.6;
}
.ref-errors {
  color: var(--red);
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}
.ref-actions {
  position: sticky;
  bottom: -32px;
  z-index: 10;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
  padding: 18px 0;
  background: var(--surface-panel);
  border-top: 1px solid var(--border);
}
.ref-save-state {
  margin-right: auto;
  color: var(--text-mut);
  font-size: var(--fs-xs);
}
button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
@media (max-width: 1100px) {
  .ref-tools {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
  }
  .ref-stage {
    max-height: 42vh;
  }
}
@media (max-width: 620px) {
  .ref-stage-toolbar {
    padding: 10px;
    gap: 8px;
  }
  .ref-width {
    gap: 4px;
  }
  .ref-width input {
    width: 70px;
  }
  .ref-samples {
    padding: 8px;
  }
  .ref-scene-row {
    gap: 8px;
  }
  .ref-scene-subject {
    display: none;
  }
  .ref-scene-badge {
    max-width: calc(100% - 45px);
  }
  .ref-format-choice {
    flex-wrap: wrap;
  }
  .ref-format-choice > span:nth-child(2) {
    margin-left: 0;
  }
  .ref-actions {
    bottom: -20px;
  }
}
.ref-target-picker {
  display: flex;
  gap: 24px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border);
}
.ref-target-picker button {
  padding: 14px 0;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--text-dim);
  font-size: var(--fs-sm);
  white-space: nowrap;
}
.ref-target-picker button[aria-pressed='true'] {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.ref-remote-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border);
}
.ref-remote-picker button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-dim);
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}
.ref-remote-picker button[aria-pressed='true'] {
  background: var(--selected);
  border-color: var(--accent-line);
  color: var(--text);
}
@media (max-width: 620px) {
  .ref-target-picker {
    padding-inline: 10px;
    gap: 20px;
  }
  .ref-remote-picker {
    padding-inline: 10px;
  }
  .ref-scene-row {
    min-height: 28px;
  }
  .ref-scene-rail {
    height: 28px;
  }
  .ref-scene-badge {
    padding-block: 2px;
  }
}
</style>
