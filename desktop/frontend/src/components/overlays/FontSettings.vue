<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { System } from '@wailsio/runtime'
import { ListSystemFonts } from '../../bindings/github.com/atterpac/ichi/desktop/services/preferencesservice'
import { usePreferenceBindings } from '../../customization/usePreferences'
import { bundledFonts, fontChoices } from './fontCatalog'
import UiButton from '../common/UiButton.vue'
const settings = usePreferenceBindings()
const installed = ref<{ Family: string; Monospace: boolean }[]>([])
const busy = ref(false)
const error = ref('')
const query = ref('')
const groups = ['Default', 'Bundled', 'System', 'Current'] as const
const uiFonts = computed(() =>
  fontChoices(installed.value, false, settings['appearance.uiFont'], query.value),
)
const codeFonts = computed(() =>
  fontChoices(installed.value, true, settings['appearance.codeFont'], query.value),
)
async function refresh() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    if (!System.IsDesktop()) {
      error.value =
        'Installed fonts are available in the desktop app. Bundled fonts work in this preview.'
      return
    }
    installed.value = await ListSystemFonts()
  } catch (e) {
    error.value = `Could not refresh system fonts. Bundled fonts remain available. ${String(e)}`
  } finally {
    busy.value = false
  }
}
function resetFonts() {
  settings['appearance.uiFont'] = 'Inter Variable'
  settings['appearance.codeFont'] = 'JetBrains Mono'
}
onMounted(refresh)
</script>
<template>
  <div class="font-library-head">
    <div>
      <strong>Font library</strong>
      <p>{{ bundledFonts.length }} bundled · {{ installed.length }} installed</p>
    </div>
    <UiButton size="sm" :disabled="busy" @click="refresh">{{
      busy ? 'Loading…' : 'Refresh system fonts'
    }}</UiButton>
  </div>
  <p class="set-note">
    Bundled fonts work offline. Install additional fonts with your system’s font manager, then
    refresh this list.
  </p>
  <label class="font-search"
    >Find fonts<input
      v-model="query"
      class="ui-field"
      type="search"
      placeholder="Filter by font name…"
  /></label>
  <p v-if="error" class="set-note" role="status">{{ error }}</p>
  <label class="set-field"
    >Interface font<select
      v-model="settings['appearance.uiFont']"
      class="ui-field"
      aria-label="Interface font"
    >
      <template v-for="group in groups" :key="group"
        ><optgroup v-if="uiFonts.some((font) => font.source === group)" :label="group">
          <option
            v-for="font in uiFonts.filter((font) => font.source === group)"
            :key="font.family"
            :value="font.family"
          >
            {{ font.label }}
          </option>
        </optgroup></template
      >
    </select></label
  >
  <label class="set-field"
    >Code font<select
      v-model="settings['appearance.codeFont']"
      class="ui-field"
      aria-label="Code font"
    >
      <template v-for="group in groups" :key="group"
        ><optgroup v-if="codeFonts.some((font) => font.source === group)" :label="group">
          <option
            v-for="font in codeFonts.filter((font) => font.source === group)"
            :key="font.family"
            :value="font.family"
          >
            {{ font.label }}
          </option>
        </optgroup></template
      ></select
    ><small>Monospaced fonts keep code and diff columns aligned.</small></label
  >
  <UiButton size="sm" @click="resetFonts">Reset fonts</UiButton>
</template>
<style scoped>
.font-library-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.font-library-head strong {
  font-size: 13px;
}
.font-library-head p {
  margin: 5px 0 0;
  font-size: 11px;
  color: var(--text-mut);
}
.font-search {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 12px;
  margin: 20px 0;
}
.font-search input {
  flex: 1;
  min-width: 0;
}
select {
  width: 100%;
  min-width: 0;
}
</style>
