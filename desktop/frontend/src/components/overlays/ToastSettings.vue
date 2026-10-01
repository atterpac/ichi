<script lang="ts">
// Retain sample IDs when settings closes so reopening can clear only test notices.
const sampleIds = new Set<number>()
</script>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { usePreferenceBindings } from '../../customization/usePreferences'
import { notify, dismissToast, type Toast, type ToastTone } from '../../composables/useToasts'
import ToastCard from './ToastCard.vue'
import { toastDesigns as styles } from './toastDesigns'
import UiButton from '../common/UiButton.vue'

const settings = usePreferenceBindings()
const tones: ToastTone[] = ['info', 'success', 'warning', 'danger']
const tone = ref<ToastTone>('success')
const length = ref<'short' | 'long' | 'title'>('short')
const action = ref(true)
const duration = ref(5200)
const titles: Record<ToastTone, string> = { info: 'Repository refreshed', success: 'Changes committed', warning: 'Branch has no upstream', danger: 'Unable to fetch remote' }
const messages: Record<ToastTone, string> = {
  info: 'Your local branch list is up to date.', success: '3 files committed on feature/toast-designs.',
  warning: 'Choose an upstream before pushing this branch.', danger: 'The remote could not be reached. Try again in a moment.',
}
const sample = computed<Toast>(() => ({
  id: 0, createdAt: 0, tone: tone.value, title: titles[tone.value],
  message: length.value === 'title' ? undefined : length.value === 'long'
    ? 'This is a longer sample notification to check wrapping. Changes in src/components/overlays/ToastViewport.vue are ready to review alongside the remaining files in your working tree.'
    : messages[tone.value],
  actionLabel: action.value ? 'Try action' : undefined,
}))
function send(testTone = tone.value) {
  if (!settings['developer.enabled']) return
  sampleIds.add(notify({ ...sample.value, tone: testTone, title: titles[testTone], duration: duration.value,
    onAction: action.value ? () => { if (!settings['developer.enabled']) return; sampleIds.add(notify({ tone: 'info', title: 'Sample action completed', message: 'The test button worked.', duration: duration.value })) } : undefined,
  }))
}
function clearSamples() { for (const id of sampleIds) dismissToast(id); sampleIds.clear() }
watch(() => settings['developer.enabled'], enabled => { if (!enabled) clearSamples() })
</script>
<template>
  <label class="set-row">
    <span><b>Developer mode</b><small>Preview interface styles and send sample notifications.</small></span>
    <button class="toggle" :class="{ on: settings['developer.enabled'] }" type="button" role="switch" aria-label="Developer mode" :aria-checked="settings['developer.enabled']" @click="settings['developer.enabled'] = !settings['developer.enabled']"><i /></button>
  </label>
  <p v-if="!settings['developer.enabled']" class="set-note">Enable developer mode to open the toast design playground.</p>
  <template v-else>
    <p class="set-section">Toast designs</p>
    <p class="set-note">Choose a design to use across the app. Your choice is saved locally.</p>
    <div class="toast-designs" role="group" aria-label="Toast design">
      <section v-for="style in styles" :key="style.id" class="toast-design" :class="{ selected: settings['notifications.style'] === style.id }">
        <button class="toast-design-choice" :aria-pressed="settings['notifications.style'] === style.id" @click="settings['notifications.style'] = style.id"><b>{{ style.name }}</b><span>{{ settings['notifications.style'] === style.id ? 'Selected' : 'Use design' }}</span></button>
        <p>{{ style.note }}</p><span class="toast-placement">{{ style.placement }}</span>
        <div class="toast-design-stage" :class="`stage-${style.id}`"><div class="toast-stage-lines" aria-hidden="true"><i /><i /><i /></div><div class="toast-design-preview"><ToastCard :toast="sample" :design="style.id" preview /></div></div>
      </section>
    </div>
    <p class="set-section">Test notifications</p>
    <div class="toast-test-fields">
      <label>Tone<select v-model="tone" class="ui-field size-sm"><option v-for="item in tones" :key="item" :value="item">{{ item }}</option></select></label>
      <label>Content<select v-model="length" class="ui-field size-sm"><option value="short">Short message</option><option value="long">Long message</option><option value="title">Title only</option></select></label>
      <label>Duration<select v-model="duration" class="ui-field size-sm"><option :value="2000">2 seconds</option><option :value="5200">5 seconds</option><option :value="10000">10 seconds</option><option :value="0">Until dismissed</option></select></label>
      <label class="toast-test-action"><input v-model="action" type="checkbox" /> Include sample action</label>
    </div>
    <div class="toast-test-buttons">
      <UiButton size="sm" variant="primary" @click="send()">Send test toast</UiButton>
      <UiButton size="sm" @click="tones.forEach(item => send(item))">Test stack of four</UiButton>
      <UiButton size="sm" @click="clearSamples">Clear test toasts</UiButton>
    </div>
    <p class="set-note">Samples use the live notification stack. Close settings to test their keyboard controls.</p>
  </template>
</template>
<style scoped>
.toast-designs { display: grid; gap: var(--space-6); }
.toast-design { min-width: 0; padding: var(--space-6); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-base); }
.toast-design.selected { border-color: var(--accent); }
.toast-design-choice { display: flex; align-items: center; justify-content: space-between; width: 100%; border: 0; background: transparent; color: var(--head); padding: var(--space-2) 0; cursor: pointer; }
.toast-design-choice span { color: var(--accent-text); font-size: var(--fs-xs); }
.toast-design p { color: var(--text-mut); font-size: var(--fs-sm); margin: var(--space-3) 0 var(--space-6); }
.toast-placement { display: block; margin-bottom: var(--space-4); color: var(--text-mut); font: var(--fs-2xs) var(--font-mono); text-transform: uppercase; letter-spacing: .1em; }
.toast-design-stage { position: relative; display: flex; min-height: 190px; padding: 20px 12px; overflow: hidden; border-radius: var(--radius-sm); background: var(--surface-panel); border: 1px solid var(--line-faint); }
.toast-stage-lines { position: absolute; inset: 20px; opacity: .3; pointer-events: none; }
.toast-stage-lines i { display: block; height: 4px; width: 38%; margin-bottom: 16px; background: var(--line-faint); }
.toast-stage-lines i:nth-child(2) { width: 62%; }
.toast-stage-lines i:nth-child(3) { width: 48%; }
.toast-design-preview { position: relative; width: 100%; min-width: 0; }
.stage-dock { align-items: flex-end; }
.stage-card { justify-content: flex-end; align-items: flex-end; }
.stage-card .toast-design-preview { max-width: 370px; }
.stage-capsule { justify-content: center; align-items: flex-start; }
.stage-capsule .toast-design-preview { max-width: 380px; }
.stage-bulletin { justify-content: flex-end; align-items: flex-start; }
.stage-bulletin .toast-design-preview { max-width: 330px; }
.toast-test-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--space-6); }
.toast-test-fields label { display: flex; flex-direction: column; gap: var(--space-3); color: var(--text-dim); font-size: var(--fs-sm); }
.toast-test-fields .toast-test-action { flex-direction: row; align-items: center; grid-column: 1 / -1; }
.toast-test-buttons { display: flex; flex-wrap: wrap; gap: var(--space-4); margin-block: var(--space-8); }
</style>
