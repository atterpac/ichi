<script setup lang="ts">
import { computed, ref } from 'vue'
import { placeholderStyles, placeholderSvg } from '../common/avatarPlaceholder'
import { usePreferenceBindings } from '../../customization/usePreferences'
import { DEFAULT_THEME, THEMES } from '../../theme/themes'
import FontSettings from './FontSettings.vue'
import SettingsPreview from './SettingsPreview.vue'
import GraphPreview from './GraphPreview.vue'
import UiButton from '../common/UiButton.vue'
const emit = defineEmits<{ appearanceLab: [] }>()
const settings = usePreferenceBindings()
withDefaults(defineProps<{ section?: 'Themes' | 'Typography' | 'Avatars' }>(), {
  section: 'Themes',
})
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
    <template v-if="section === 'Themes'">
      <SettingsPreview
        ><section class="theme-feature" aria-label="Selected theme preview">
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
        </section></SettingsPreview
      >
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
          <FontSettings />
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
        <SettingsPreview
          ><aside class="settings-preview typography-preview" aria-label="Typography preview">
            <h3>Polish the settings workspace</h3>
            <small>Alex Chen committed 12 minutes ago</small>
            <div class="theme-code-preview">
              <code>const greeting = 'Hello, world'</code
              ><code>// 0123456789 · {} [] () =&gt;</code>
            </div>
          </aside></SettingsPreview
        >
      </div>
    </template>
    <template v-else>
      <SettingsPreview
        ><section class="settings-avatar-scene" aria-label="Avatar preview">
          <h3>Contributors</h3>
          <p class="set-note">When an author photo is unavailable</p>
          <div
            v-for="(name, index) in ['Alex Chen', 'Sam Rivera', 'Morgan Lee']"
            :key="name"
            class="settings-avatar-person"
          >
            <span
              aria-hidden="true"
              v-html="placeholderSvg(name, settings['appearance.avatarPlaceholder'])"
            />
            <div>
              <strong>{{ name }}</strong
              ><small>{{
                ['Refine the inspector', 'Fix keyboard navigation', 'Add contribution history'][
                  index
                ]
              }}</small>
            </div>
          </div>
        </section></SettingsPreview
      >
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
