<script setup lang="ts">
/**
 * PLAYGROUND — confirm/deny modal design exploration.
 * Git action prompts (cherry-pick, merge, rebase, force-push…) rendered six ways.
 * Floating bar: Design switches the modal style, Operation switches the git action.
 *   1 Classic       centered card, headline + two buttons
 *   2 Command       terminal chip previewing the literal git command
 *   3 Context       meta grid of everything the op touches
 *   4 Keyboard      vim-style y/n prompt for power users
 *   5 Banner        non-blocking top slide-down bar
 *   6 Type-confirm  destructive guard — type the target to unlock
 */
import { computed, onMounted, onUnmounted } from 'vue'
import { clearControls, controlValue, registerControl } from '../store'
import { OPS, OP_IDS } from './ops'
import ModalClassic from './ModalClassic.vue'
import ModalCommand from './ModalCommand.vue'
import ModalContext from './ModalContext.vue'
import ModalKeyboard from './ModalKeyboard.vue'
import ModalBanner from './ModalBanner.vue'
import ModalTypeConfirm from './ModalTypeConfirm.vue'

const DESIGNS = [
  { id: '1', label: 'Classic', cmp: ModalClassic },
  { id: '2', label: 'Command', cmp: ModalCommand },
  { id: '3', label: 'Context', cmp: ModalContext },
  { id: '4', label: 'Keyboard', cmp: ModalKeyboard },
  { id: '5', label: 'Banner', cmp: ModalBanner },
  { id: '6', label: 'Type-confirm', cmp: ModalTypeConfirm },
]

onMounted(() => {
  registerControl({
    id: 'design', kind: 'select', label: 'Design',
    options: DESIGNS.map((d) => d.id), value: '1',
  })
  registerControl({
    id: 'op', kind: 'select', label: 'Operation',
    options: OP_IDS, value: 'cherry',
  })
})
onUnmounted(clearControls)

const designId = computed(() => controlValue<string>('design') ?? '1')
const opId = computed(() => controlValue<string>('op') ?? 'cherry')
const current = computed(() => DESIGNS.find((d) => d.id === designId.value) ?? DESIGNS[0]!)
const op = computed(() => OPS[opId.value] ?? OPS.cherry!)
</script>

<template>
  <div class="frame">
    <div class="caption">
      <span class="n">{{ current.id }}</span>
      <span class="t">{{ current.label }}</span>
      <span class="sep">·</span>
      <span class="o">{{ op.verb }}</span>
    </div>
    <div class="window">
      <!-- faux app chrome behind the modal, so overlays read in context -->
      <div class="backdrop">
        <div class="bar">
          <span class="branch">⎇ atterpac/gui</span>
          <span class="dim">6 commits ahead · clean</span>
        </div>
        <div class="rows">
          <div v-for="i in 9" :key="i" class="commit">
            <span class="sha">{{ ['9a1a579', '9c374ee', 'ef8a1ff', '6261595', '95b3f94', 'a1b2c3d', 'e4f5061', '778899a', 'bcafe12'][i - 1] }}</span>
            <span class="msg">commit subject line {{ i }}</span>
          </div>
        </div>
      </div>
      <component :is="current.cmp" :op="op" :key="current.id + op.id" />
    </div>
  </div>
</template>

<style scoped>
.frame { display: flex; flex-direction: column; gap: 10px; }
.caption { display: flex; align-items: center; gap: 10px; padding-left: 4px; }
.caption .n {
  width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center;
  justify-content: center; font-size: 0.78em; font-weight: 800;
  background: var(--accent); color: var(--bg);
}
.caption .t { color: var(--fg); font-size: 0.9em; font-weight: 600; letter-spacing: 0.3px; }
.caption .sep { color: var(--fg-muted); }
.caption .o { color: var(--fg-muted); font-size: 0.9em; }
.window {
  position: relative;
  width: min(1080px, 94vw); height: min(700px, 84vh);
  background: var(--bg-soft); border: 1px solid var(--border);
  border-radius: 14px; overflow: hidden; color: var(--fg);
  box-shadow: 0 18px 60px color-mix(in srgb, var(--accent) 8%, transparent);
}
.backdrop { position: absolute; inset: 0; display: flex; flex-direction: column; }
.bar {
  display: flex; align-items: center; gap: 14px; padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}
.branch { font-weight: 700; font-size: 0.9em; }
.dim { color: var(--fg-muted); font-size: 0.82em; }
.rows { padding: 8px 0; overflow: hidden; }
.commit {
  display: flex; gap: 14px; padding: 9px 18px; font-size: 0.86em;
  font-family: ui-monospace, monospace;
}
.commit .sha { color: var(--accent-2); }
.commit .msg { color: var(--fg-muted); }
</style>
