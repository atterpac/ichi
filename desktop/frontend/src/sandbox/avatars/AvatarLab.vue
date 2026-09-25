<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AvatarMark from './AvatarMark.vue'
import { avatarStyles, avatarSvg, type AvatarStyle } from './generate'

const seed = ref('atterpac')
const selected = ref<AvatarStyle>('spore')
const collection = ref<'pixels' | 'originals'>('pixels')
const visibleStyles = computed(() =>
  collection.value === 'pixels'
    ? avatarStyles.filter(
        (style) => ['relay', 'spore', 'lumen', 'alley'].includes(style.id),
      )
    : avatarStyles.filter((style) => !['relay', 'spore', 'lumen', 'alley'].includes(style.id)),
)
function setCollection(value: 'pixels' | 'originals') {
  collection.value = value
  selected.value = value === 'pixels' ? 'spore' : 'glass'
}
const light = ref(false)
const monochrome = ref(false)
const batch = ref(0)
const people = ['atterpac', 'mira.chen', 'sam-rivera', 'jules', 'ren.sato', 'build-bot']
const family = computed(() =>
  Array.from({ length: 7 }, (_, i) => `${seed.value}:${batch.value * 7 + i}`),
)
const active = computed(() => avatarStyles.find((style) => style.id === selected.value)!)
const commits = [
  'Refine the review cursor',
  'Keep focus with the active pane',
  'Make room for the code',
  'Remember the last selected file',
]
watch(
  light,
  (value) => {
    document.documentElement.classList.toggle('theme-ayu-light', value)
    document.documentElement.classList.toggle('theme-tokyonight-night', !value)
  },
  { immediate: true },
)
function download() {
  const url = URL.createObjectURL(
    new Blob([avatarSvg(seed.value, selected.value)], { type: 'image/svg+xml' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `ichi-${selected.value}-avatar.svg`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <main class="avatar-lab" :class="{ monochrome }">
    <header class="lab-heading">
      <div>
        <p class="eyebrow">ICHI / IDENTITY STUDIES</p>
        <h1>A little identity.<br /><span>Zero initials.</span></h1>
      </div>
      <div class="heading-aside">
        <p>
          Small creatures. Big personalities.<br />Something you recognize before you read the name.
        </p>
        <button :aria-pressed="light" @click="light = !light">
          {{ light ? 'Dark canvas' : 'Light canvas' }}
        </button>
      </div>
    </header>

    <section class="seed-bar" aria-label="Avatar controls">
      <label
        ><span class="eyebrow">YOUR INPUT</span
        ><input
          v-model="seed"
          spellcheck="false"
          autocomplete="off"
          aria-label="Avatar input"
          placeholder="Name, email, or any identifier"
      /></label>
      <div class="seed-presets">
        <button
          v-for="person in people.slice(0, 4)"
          :key="person"
          :aria-pressed="seed === person"
          @click="seed = person"
        >
          {{ person }}
        </button>
      </div>
      <label class="mono-toggle"
        ><input v-model="monochrome" type="checkbox" /> Grayscale check</label
      >
    </section>

    <nav class="collection-tabs" aria-label="Avatar collections">
      <button :aria-pressed="collection === 'pixels'" @click="setCollection('pixels')">
        Pixel creatures · 4
      </button>
      <button :aria-pressed="collection === 'originals'" @click="setCollection('originals')">
        Original collection · 6
      </button>
    </nav>
    <div class="collection-bar">
      <span>{{
        collection === 'pixels'
          ? 'FOUR SPECIES / ONE IDENTITY'
          : 'SIX VISUAL LANGUAGES / ONE INPUT'
      }}</span
      ><span>Same input → same avatar, every time.</span>
    </div>
    <section
      class="avatar-grid"
      :aria-label="collection === 'pixels' ? 'Pixel creature styles' : 'Original avatar styles'"
    >
      <article
        v-for="(style, index) in visibleStyles"
        :key="style.id"
        class="style-card"
        :class="{ selected: selected === style.id }"
      >
        <header>
          <span class="card-index">0{{ index + 1 }}</span
          ><span class="eyebrow">{{ style.category }}</span
          ><button
            :aria-pressed="selected === style.id"
            :aria-label="`Preview ${style.name} in app`"
            @click="selected = style.id"
          >
            {{ selected === style.id ? 'Selected' : 'Try in context ↗' }}
          </button>
        </header>
        <button
          class="hero-avatar"
          :aria-label="`Select ${style.name}`"
          @click="selected = style.id"
        >
          <AvatarMark :seed="seed" :kind="style.id" :size="124" />
        </button>
        <div class="card-description">
          <h2>{{ style.name }}</h2>
          <p>{{ style.description }}</p>
        </div>
        <div class="size-strip">
          <span class="eyebrow">ACTUAL SIZE</span>
          <div v-for="size in [16, 24, 32, 48]" :key="size">
            <AvatarMark :seed="seed" :kind="style.id" :size="size" /><small>{{ size }}</small>
          </div>
        </div>
        <div class="family-strip">
          <AvatarMark
            v-for="identity in family"
            :key="identity"
            :seed="identity"
            :kind="style.id"
            :size="32"
          />
        </div>
        <p class="card-note">{{ style.note }}</p>
      </article>
    </section>

    <section class="context-section" aria-label="Selected style in context">
      <div class="context-intro">
        <p class="eyebrow">OFF THE DISPLAY SHELF</p>
        <h2>{{ active.name }} in the wild.</h2>
        <p>
          A big illustration is easy. An identity has to work at 24 pixels, next to actual work.
        </p>
        <div class="context-buttons">
          <button @click="batch++">New variation set</button
          ><button class="export" @click="download">Export selected SVG ↓</button>
        </div>
        <p class="export-note">Export uses the original colors.</p>
      </div>
      <div class="commit-preview">
        <header>
          <span>ichi / recent activity</span><span class="eyebrow">{{ active.name }}</span>
        </header>
        <div v-for="(message, index) in commits" :key="message" class="preview-row">
          <AvatarMark :seed="index === 0 ? seed : people[index]!" :kind="selected" :size="28" />
          <div>
            <strong>{{ message }}</strong
            ><span
              >{{ index === 0 ? seed || 'Empty input' : people[index] }}
              <i>· {{ index + 1 }}h ago</i></span
            >
          </div>
          <code>{{ ['b73a8d1', 'a90e24f', 'f12bc03', '8ec741a'][index] }}</code>
        </div>
      </div>
    </section>
    <footer class="lab-footer">
      <span>Original procedural SVG studies · no images fetched · no account needed</span
      ><span>Input stays in this page.</span>
    </footer>
  </main>
</template>

<style scoped>
.avatar-lab {
  max-width: 1480px;
  padding: 48px 48px 24px;
  margin: auto;
  color: var(--text);
}
.lab-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
  margin-bottom: 34px;
}
.eyebrow {
  font: 10px/1.5 var(--font-mono);
  letter-spacing: 0.09em;
  color: var(--text-mut);
  margin: 0;
}
h1 {
  margin: 16px 0 0;
  font-size: clamp(36px, 4vw, 58px);
  line-height: 1.08;
  font-weight: 500;
  letter-spacing: -2px;
}
h1 span {
  color: var(--text-mut);
}
.heading-aside {
  max-width: 320px;
}
.heading-aside p {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-dim);
}
button {
  color: var(--text-dim);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 8px 12px;
  font-size: 11px;
}
button:hover {
  color: var(--text);
  background: var(--hover);
}
.seed-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 20px 24px;
  background: var(--surface-panel);
  border: 1px solid var(--border);
  border-radius: 9px;
}
.seed-bar > label:first-child {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 180px;
}
.seed-bar input[type='text'],
.seed-bar input:not([type]) {
  font: 18px/1.5 var(--font-mono);
  background: transparent;
  color: var(--text);
  border: 0;
  border-bottom: 1px solid var(--border);
  width: 100%;
  padding: 6px 0 3px;
}
.seed-presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
}
.seed-presets button {
  font: 10px var(--font-mono);
  padding: 7px 9px;
}
.seed-presets button[aria-pressed='true'] {
  border-color: var(--accent-line);
  color: var(--accent-text);
}
.mono-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  color: var(--text-mut);
  white-space: nowrap;
}
.mono-toggle input {
  accent-color: var(--accent);
}
.collection-tabs {
  display: flex;
  gap: 8px;
  margin-top: 24px;
}
.collection-tabs button[aria-pressed='true'] {
  background: var(--selected);
  border-color: var(--accent-line);
  color: var(--accent-text);
}
.collection-bar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin: 26px 0 14px;
  font: 10px/1.5 var(--font-mono);
  color: var(--text-mut);
}
.avatar-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.style-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-panel);
  padding: 16px 20px 12px;
  min-width: 0;
}
.style-card.selected {
  border-color: var(--accent-line);
}
.style-card > header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.card-index {
  font: 10px var(--font-mono);
  color: var(--accent-text);
}
.style-card header button {
  margin-left: auto;
  border: 0;
  padding: 3px 0;
  font-size: 10px;
}
.style-card header button[aria-pressed='true'] {
  color: var(--accent-text);
}
.hero-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 172px;
  border: 0;
  border-radius: 7px;
  margin-top: 8px;
  background-image: radial-gradient(var(--border) 0.6px, transparent 0.6px);
  background-size: 12px 12px;
}
.hero-avatar:hover {
  background-color: var(--hover);
}
.card-description {
  padding: 15px 0 18px;
  min-height: 96px;
}
.card-description h2 {
  font-size: 19px;
  font-weight: 500;
  margin: 0 0 6px;
  letter-spacing: -0.4px;
}
.card-description p {
  color: var(--text-mut);
  font-size: 12px;
  margin: 0;
  line-height: 1.6;
  max-width: 290px;
}
.size-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-block: 1px solid var(--border);
  padding: 12px 0 8px;
  min-height: 92px;
}
.size-strip > div {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 70px;
  gap: 6px;
}
.size-strip small {
  font: 9px var(--font-mono);
  color: var(--text-mut);
}
.family-strip {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  margin: 16px 0 10px;
}
.family-strip :deep(.avatar-mark) {
  flex-shrink: 1;
  min-width: 0;
}
.card-note {
  color: var(--text-mut);
  font-size: 10px;
  margin: 0;
}
.context-section {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 64px;
  padding: 42px 0;
  margin-top: 10px;
  align-items: center;
}
.context-intro h2 {
  font-size: 26px;
  font-weight: 500;
  margin: 8px 0;
  letter-spacing: -0.7px;
}
.context-intro > p:not(.eyebrow) {
  color: var(--text-mut);
  font-size: 12px;
  line-height: 1.7;
  max-width: 310px;
}
.context-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}
.context-buttons .export {
  color: var(--accent-text);
  border-color: var(--accent-line);
}
.context-intro .export-note {
  font-size: 10px !important;
}
.commit-preview {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface-panel);
}
.commit-preview > header {
  display: flex;
  justify-content: space-between;
  padding: 13px 18px;
  border-bottom: 1px solid var(--border);
  font: 10px var(--font-mono);
  color: var(--text-mut);
}
.preview-row {
  display: flex;
  gap: 12px;
  padding: 13px 18px;
  align-items: center;
  border-bottom: 1px solid var(--line-faint);
}
.preview-row > div {
  flex: 1;
  min-width: 0;
}
.preview-row strong {
  display: block;
  font-size: 12px;
  font-weight: 400;
}
.preview-row div > span {
  display: block;
  color: var(--text-mut);
  font: 10px/1.6 var(--font-mono);
  overflow-wrap: anywhere;
}
.preview-row i {
  font-style: normal;
  opacity: 0.7;
}
.preview-row code {
  color: var(--text-mut);
  font: 10px var(--font-mono);
}
.lab-footer {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px solid var(--border);
  padding-top: 18px;
  color: var(--text-mut);
  font: 10px/1.5 var(--font-mono);
}
.monochrome :deep(.avatar-mark) {
  filter: grayscale(1);
}
@media (max-width: 1100px) {
  .avatar-lab {
    padding: 32px 24px;
  }
  .seed-bar {
    flex-wrap: wrap;
    gap: 14px;
  }
  .avatar-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .context-section {
    gap: 28px;
  }
}
@media (max-width: 620px) {
  .avatar-lab {
    padding: 24px 16px;
  }
  .lab-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .heading-aside {
    display: flex;
    align-items: center;
    gap: 16px;
    max-width: none;
  }
  .heading-aside button {
    flex: none;
  }
  .avatar-grid,
  .context-section {
    grid-template-columns: minmax(0, 1fr);
  }
  .seed-presets {
    flex-basis: 100%;
  }
  .collection-bar,
  .lab-footer {
    flex-direction: column;
    gap: 5px;
  }
  .preview-row code {
    display: none;
  }
  .card-description {
    min-height: auto;
  }
}
</style>
