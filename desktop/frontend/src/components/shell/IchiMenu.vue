<script setup lang="ts">
import { ref } from 'vue'
import { Browser, System } from '@wailsio/runtime'
import { PhArrowUpRight, PhGithubLogo, PhChatCircle, PhSparkle, PhX } from '@phosphor-icons/vue'
import UiIconButton from '../common/UiIconButton.vue'
import { useDialogFocus } from '../../composables/useDialogFocus'

const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLElement | null>(null)
const error = ref('')
useDialogFocus(dialog, () => emit('close'))
const links = [
  { label: 'Updates & release notes', note: 'See what’s new', url: 'https://github.com/atterpac/ichi/releases', icon: PhSparkle },
  { label: 'Ichi on GitHub', note: 'Explore the source', url: 'https://github.com/atterpac/ichi', icon: PhGithubLogo },
  { label: 'Feedback & issues', note: 'Help shape Ichi', url: 'https://github.com/atterpac/ichi/issues', icon: PhChatCircle },
]
async function openLink(event: MouseEvent, url: string) {
  // Browser previews use the native anchor; desktop opens the system browser.
  if (!System.IsDesktop()) return
  event.preventDefault()
  error.value = ''
  try { await Browser.OpenURL(url) }
  catch { error.value = 'Could not open your browser. Please try again.' }
}
</script>

<template>
  <div class="ichi-menu-backdrop" @click.self="emit('close')">
    <section id="ichi-menu" ref="dialog" class="ichi-menu" role="dialog" aria-modal="true" aria-labelledby="ichi-menu-title" tabindex="-1">
      <header class="ichi-menu-heading">
        <div><h2 id="ichi-menu-title">ichi<span>一</span></h2><p>A quieter place for Git.</p></div>
        <UiIconButton size="sm" label="Close About Ichi" @click="emit('close')"><PhX :size="16" /></UiIconButton>
      </header>
      <p class="ichi-menu-about">Read your history, review your changes, and make your next commit. Built by Atterpac and contributors.</p>
      <nav aria-label="Ichi resources">
        <a v-for="link in links" :key="link.url" :href="link.url" target="_blank" rel="noopener noreferrer" @click="openLink($event, link.url)">
          <component :is="link.icon" :size="18" aria-hidden="true" />
          <span><b>{{ link.label }}</b><small>{{ link.note }}</small></span>
          <PhArrowUpRight :size="14" aria-hidden="true" />
        </a>
      </nav>
      <p v-if="error" class="ichi-menu-error" role="alert">{{ error }}</p>
    </section>
  </div>
</template>

<style scoped>
.ichi-menu-backdrop { position: fixed; inset: 0; z-index: 80; }
.ichi-menu { position: absolute; right: 10px; bottom: 32px; width: min(320px, calc(100vw - 20px)); max-height: calc(100vh - 48px); overflow: auto; padding: var(--space-8); border: 1px solid var(--border); border-radius: var(--radius-xl); background: var(--surface-overlay); box-shadow: var(--elev-3); color: var(--text); font: var(--fs-sm)/1.5 var(--font-ui); }
.ichi-menu-heading { display: flex; align-items: flex-start; justify-content: space-between; }
.ichi-menu-heading h2 { display: flex; align-items: center; gap: var(--space-4); margin: 0; color: var(--head); font-size: var(--fs-xl); font-weight: var(--weight-medium); letter-spacing: -.04em; }
.ichi-menu-heading h2 span { color: var(--accent-text); font-size: var(--fs-lg); }
.ichi-menu-heading p { margin: var(--space-2) 0 0; color: var(--text-mut); }
.ichi-menu-about { margin: var(--space-6) 0 var(--space-8); color: var(--text-dim); }
.ichi-menu nav { display: grid; gap: var(--space-2); padding-top: var(--space-4); border-top: 1px solid var(--line-faint); }
.ichi-menu a { display: flex; align-items: center; gap: var(--space-6); padding: var(--space-4); border-radius: var(--radius-md); color: var(--text-dim); text-decoration: none; }
.ichi-menu a:hover { background: var(--hover); color: var(--text); }
.ichi-menu a:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }
.ichi-menu a > span { flex: 1; }
.ichi-menu b, .ichi-menu small { display: block; }
.ichi-menu b { font-weight: var(--weight-medium); }
.ichi-menu small { color: var(--text-mut); font-size: var(--fs-xs); }
.ichi-menu-error { color: var(--negative-text); margin-bottom: 0; }
</style>
