<script setup lang="ts">
import { computed, ref } from 'vue'
import { placeholderStyles, placeholderSvg } from '../common/avatarPlaceholder'
import { usePreferenceBindings } from '../../customization/usePreferences'
import { DEFAULT_THEME, THEMES } from '../../theme/themes'
import GraphPreview from './GraphPreview.vue'
import UiButton from '../common/UiButton.vue'
const emit = defineEmits<{ appearanceLab: [] }>()
const settings = usePreferenceBindings()
const section = ref('Themes')
const filter = ref('All')
const visibleThemes = computed(() =>
  THEMES.filter(
    (theme) => filter.value === 'All' || (filter.value === 'Light' ? theme.light : !theme.light),
  ),
)
const selectedTheme = computed(() =>
  THEMES.find((theme) => theme.id === settings['appearance.theme']),
)
</script>
<template>
  <div class="appearance-settings">
    <div class="set-subnav" role="group" aria-label="Appearance sections">
      <button
        v-for="tab in ['Themes', 'Typography', 'Avatars']"
        :key="tab"
        type="button"
        :aria-pressed="section === tab"
        @click="section = tab"
      >
        {{ tab }}
      </button>
    </div>
    <template v-if="section === 'Themes'">
      <section class="theme-feature" aria-label="Selected theme preview">
        <div class="theme-feature-copy">
          <h3>{{ selectedTheme?.label }}</h3>
        </div>
        <div class="theme-feature-scene">
          <GraphPreview />
          <div class="theme-code-preview" aria-hidden="true">
            <code> export const workspace = {</code><code class="removed">− theme: 'before'</code
            ><code class="added">+ theme: '{{ selectedTheme?.label }}'</code><code> }</code>
          </div>
        </div>
      </section>
      <div class="theme-gallery-head">
        <div class="set-segmented" role="group" aria-label="Theme brightness">
          <button
            v-for="option in ['All', 'Dark', 'Light']"
            :key="option"
            type="button"
            :aria-pressed="filter === option"
            @click="filter = option"
          >
            {{ option }}
          </button>
        </div>
      </div>
      <div class="theme-chip-grid" role="radiogroup" aria-label="Color theme">
        <button
          v-for="theme in visibleThemes"
          :key="theme.id"
          class="theme-chip"
          :class="[`theme-${theme.id}`, { active: settings['appearance.theme'] === theme.id }]"
          type="button"
          role="radio"
          :aria-checked="settings['appearance.theme'] === theme.id"
          @click="settings['appearance.theme'] = theme.id"
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
            <small>{{
              theme.id === DEFAULT_THEME ? 'default · dark' : theme.light ? 'light' : 'dark'
            }}</small>
          </span>
        </button>
      </div>
    </template>
    <template v-else-if="section === 'Typography'">
      <div class="settings-split">
        <div class="settings-controls">
          <p class="set-note">Bundled or installed fonts.</p>
          <label class="set-field"
            >Interface font<input
              v-model="settings['appearance.uiFont']"
              class="ui-field"
              list="settings-ui-fonts"
          /></label>
          <datalist id="settings-ui-fonts">
            <option value="Inter Variable" />
            <option value="system-ui" />
          </datalist>
          <label class="set-field"
            >Code font<input
              v-model="settings['appearance.codeFont']"
              class="ui-field"
              list="settings-code-fonts"
          /></label>
          <datalist id="settings-code-fonts">
            <option value="JetBrains Mono" />
            <option value="ui-monospace" />
          </datalist>
          <label class="set-field"
            >Text size <span>{{ settings['appearance.textScale'] }}%</span
            ><input
              v-model.number="settings['appearance.textScale']"
              type="range"
              min="85"
              max="125"
              step="5"
          /></label>
          <UiButton size="sm" @click="settings['appearance.textScale'] = 100"
            >Reset text size</UiButton
          >
        </div>
        <aside class="settings-preview typography-preview" aria-label="Typography preview">
          <h3>Polish the settings workspace</h3>
          <small>Alex Chen committed 12 minutes ago</small>
          <div class="theme-code-preview">
            <code>const greeting = 'Hello, world'</code><code>// 0123456789 · {} [] () =&gt;</code>
          </div>
        </aside>
      </div>
    </template>
    <template v-else>
      <p class="set-section">Avatar placeholders</p>
      <p class="set-note">Used when an author photo is unavailable.</p>
      <div class="avatar-placeholder-options" role="group" aria-label="Avatar placeholder style">
        <button
          v-for="style in placeholderStyles"
          :key="style.id"
          type="button"
          :aria-pressed="settings['appearance.avatarPlaceholder'] === style.id"
          @click="settings['appearance.avatarPlaceholder'] = style.id"
        >
          <span
            class="avatar-placeholder-preview"
            aria-hidden="true"
            v-html="placeholderSvg('Alex Chen', style.id)"
          />
          <b>{{ style.name }}</b>
        </button>
      </div>
      <UiButton size="sm" @click="emit('appearanceLab')">Open live appearance lab</UiButton>
    </template>
  </div>
</template>
