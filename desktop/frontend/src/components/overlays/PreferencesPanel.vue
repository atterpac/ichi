<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePreferences } from '../../customization/usePreferences'
import {
  preferenceIds,
  preferenceRegistry,
  preferenceSchema,
  type PreferenceCategory,
  type PreferenceDefinition,
  type PreferenceId,
  type PreferenceValues,
} from '../../customization/registry'
import UiButton from '../common/UiButton.vue'

const preferences = usePreferences()
defineProps<{ hideSearch?: boolean }>()
const query = defineModel<string>('query', { default: '' })
const category = ref<PreferenceCategory | ''>('')
const error = ref('')
const importContent = ref('')
const importOpen = ref(false)
const fileInput = ref<HTMLInputElement>()
const overridden = computed(() => new Set(Object.keys(preferences.snapshot().user)))
const categories = [...new Set(preferenceIds.map((id) => preferenceRegistry[id].category))]
const visible = computed(() => {
  const terms = query.value.toLowerCase().trim().split(/\s+/).filter(Boolean)
  return preferenceIds.filter((id) => {
    const d = preferenceRegistry[id]
    return (
      (!category.value || category.value === d.category) &&
      terms.every((term) =>
        [id, d.label, d.description, d.category, ...d.aliases]
          .join(' ')
          .toLowerCase()
          .includes(term),
      )
    )
  })
})
const preview = computed(() => {
  if (!importContent.value.trim()) return { result: null, error: '' }
  try {
    return { result: preferences.previewImport(importContent.value), error: '' }
  } catch (err) {
    return { result: null, error: String(err) }
  }
})
function set(id: PreferenceId, event: Event) {
  const control = event.target as HTMLInputElement
  const definition: PreferenceDefinition = preferenceRegistry[id]
  try {
    const value =
      definition.type === 'object'
        ? JSON.parse(control.value)
        : definition.type === 'number'
          ? control.value.trim()
            ? Number(control.value)
            : NaN
          : definition.type === 'boolean'
            ? control.checked
            : control.value
    preferences.set(id, value as PreferenceValues[typeof id])
    error.value = ''
  } catch (err) {
    error.value = String(err)
    control.value =
      definition.type === 'object'
        ? JSON.stringify(preferences.values.value[id], null, 2)
        : String(preferences.values.value[id])
  }
}
function download(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function readImport(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    if (file.size > 1024 * 1024) throw new Error('Import exceeds 1 MiB')
    importContent.value = await file.text()
    importOpen.value = true
    error.value = ''
  } catch (err) {
    error.value = String(err)
  }
  ;(event.target as HTMLInputElement).value = ''
}
function cancelImport() {
  importOpen.value = false
  importContent.value = ''
}
function applyImport() {
  try {
    preferences.applyImport(importContent.value)
    importContent.value = ''
    importOpen.value = false
    error.value = ''
  } catch (err) {
    error.value = String(err)
  }
}
const sourceLabels = {
  default: 'App default',
  profile: 'Customization profile',
  user: 'Your override',
  workspace: 'Workspace override',
  repository: 'Repository override',
  preview: 'Preview',
}
</script>

<template>
  <div class="preference-panel">
    <div class="preference-search">
      <input
        v-if="!hideSearch"
        v-model="query"
        class="ui-field"
        type="search"
        aria-label="Search settings"
        placeholder="Search settings…"
      />
      <select v-model="category" class="ui-field" aria-label="Settings category">
        <option value="">All categories</option>
        <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
      </select>
    </div>
    <p class="set-note">
      Personal settings ·
      {{
        preferences.status.persistent
          ? preferences.status.saving
            ? 'Saving…'
            : preferences.status.dirty
              ? 'Unsaved changes'
              : 'Saved to preferences file'
          : 'Session only in browser previews'
      }}
    </p>
    <p v-if="preferences.status.path" class="preference-path">{{ preferences.status.path }}</p>
    <div v-if="preferences.status.error" class="preference-error" role="alert">
      <p>{{ preferences.status.error }}</p>
      <template v-if="preferences.status.conflicts.length">
        <ul>
          <li v-for="conflict in preferences.status.conflicts" :key="conflict">{{ conflict }}</li>
        </ul>
        <UiButton size="sm" @click="preferences.resolveConflict(true)"
          >Keep my conflicting values</UiButton
        >
        <UiButton size="sm" @click="preferences.resolveConflict(false)"
          >Use file's conflicting values</UiButton
        >
      </template>
      <UiButton v-else size="sm" @click="preferences.retry()">Retry</UiButton>
    </div>
    <ul v-if="preferences.diagnostics.value.length" class="preference-diagnostics">
      <li v-for="message in preferences.diagnostics.value" :key="message">{{ message }}</li>
    </ul>
    <p v-if="error" class="preference-error" role="alert">{{ error }}</p>
    <div class="preference-actions">
      <UiButton size="sm" @click="download(preferences.exportUser(), 'ichi-preferences.json')"
        >Export settings</UiButton
      >
      <UiButton size="sm" @click="importOpen = !importOpen">Import settings</UiButton>
      <UiButton
        size="sm"
        @click="
          download(JSON.stringify(preferenceSchema(), null, 2), 'ichi-preferences.schema.json')
        "
        >Export schema</UiButton
      >
      <UiButton size="sm" @click="preferences.resetCategory(category || undefined)">{{
        category ? 'Reset category' : 'Reset personal settings'
      }}</UiButton>
    </div>
    <section v-if="importOpen" class="preference-import" aria-label="Import settings preview">
      <p class="set-note">
        Import adds or replaces the listed personal overrides. Other settings remain as they are.
      </p>
      <input
        ref="fileInput"
        type="file"
        accept=".json,application/json"
        aria-label="Choose settings file"
        @change="readImport"
      />
      <textarea
        v-model="importContent"
        class="ui-field"
        aria-label="Settings JSON"
        placeholder="Paste exported settings JSON"
        rows="5"
      />
      <p v-if="preview.error" role="alert" class="preference-error">{{ preview.error }}</p>
      <template v-if="preview.result">
        <p>{{ preview.result.changes.length }} settings will change.</p>
        <ul>
          <li v-for="id in preview.result.changes" :key="id">
            {{ preferenceRegistry[id].label }}: {{ preferences.values.value[id] }} →
            {{ preview.result.overrides[id] }}
          </li>
        </ul>
      </template>
      <UiButton
        size="sm"
        :disabled="!preview.result || !preview.result.changes.length"
        @click="applyImport"
        >Apply import</UiButton
      >
      <UiButton size="sm" @click="cancelImport">Cancel</UiButton>
    </section>
    <p v-if="!visible.length" class="set-note">No settings match your search.</p>
    <div v-for="id in visible" :key="id" class="preference-row" :data-preference="id">
      <label :for="`preference-${id}`"
        ><b>{{ preferenceRegistry[id].label }}</b
        ><small>{{ preferenceRegistry[id].description }}</small
        ><span class="preference-source">{{
          sourceLabels[preferences.sources.value[id]]
        }}</span></label
      >
      <input
        v-if="preferenceRegistry[id].type === 'boolean'"
        :id="`preference-${id}`"
        type="checkbox"
        :checked="Boolean(preferences.values.value[id])"
        @change="set(id, $event)"
      />
      <select
        v-else-if="preferenceRegistry[id].options"
        :id="`preference-${id}`"
        class="ui-field"
        :value="preferences.values.value[id]"
        @change="set(id, $event)"
      >
        <option
          v-for="option in preferenceRegistry[id].options"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
      <textarea
        v-else-if="preferenceRegistry[id].type === 'object'"
        :id="`preference-${id}`"
        class="ui-field"
        :value="JSON.stringify(preferences.values.value[id], null, 2)"
        rows="6"
        @change="set(id, $event)"
      />
      <input
        v-else
        :id="`preference-${id}`"
        class="ui-field"
        :type="preferenceRegistry[id].type === 'number' ? 'number' : 'text'"
        :min="preferenceRegistry[id].min"
        :max="preferenceRegistry[id].max"
        :step="preferenceRegistry[id].step"
        :value="preferences.values.value[id]"
        :list="
          id === 'appearance.uiFont'
            ? 'preference-ui-fonts'
            : id === 'appearance.codeFont'
              ? 'preference-code-fonts'
              : undefined
        "
        @change="set(id, $event)"
      />
      <UiButton
        size="sm"
        :aria-label="`Reset ${preferenceRegistry[id].label}`"
        :disabled="!overridden.has(id)"
        @click="preferences.reset(id)"
        >Reset</UiButton
      >
    </div>
    <datalist id="preference-ui-fonts">
      <option value="Inter Variable" />
      <option value="system-ui" />
    </datalist>
    <datalist id="preference-code-fonts">
      <option value="JetBrains Mono" />
      <option value="ui-monospace" />
    </datalist>
  </div>
</template>

<style scoped>
.preference-search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px;
  gap: 8px;
  margin-bottom: 12px;
}
.preference-path {
  color: var(--text-mut);
  font: var(--fs-xs) var(--font-mono);
  overflow-wrap: anywhere;
}
.preference-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0;
}
.preference-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(80px, 160px) auto;
  gap: 12px;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid var(--line-faint);
}
.preference-row label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.preference-row b {
  color: var(--head);
  font-weight: 500;
}
.preference-row small {
  color: var(--text-dim);
  font-size: var(--fs-xs);
  line-height: 1.5;
}
.preference-source {
  color: var(--text-mut);
  font-size: var(--fs-2xs);
}
.preference-row input[type='checkbox'] {
  justify-self: end;
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
}
.preference-row .ui-field {
  min-width: 0;
  width: 100%;
}
.preference-error {
  color: var(--negative-text);
  font-size: var(--fs-xs);
  overflow-wrap: anywhere;
}
.preference-diagnostics {
  color: var(--warning-text);
  font-size: var(--fs-xs);
}
.preference-import {
  padding: 14px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 16px;
}
.preference-import textarea {
  width: 100%;
  margin: 12px 0;
  font-family: var(--font-mono);
}
.preference-import ul {
  font-size: var(--fs-xs);
  overflow-wrap: anywhere;
}
@media (max-width: 650px) {
  .preference-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .preference-row label {
    grid-column: 1 / -1;
  }
  .preference-search {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
