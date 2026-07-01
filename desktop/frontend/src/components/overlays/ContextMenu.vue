<script lang="ts">
import type { Component } from 'vue'

export type ContextMenuVariant = 'default' | 'compact' | 'spacious' | 'glass' | 'terminal' | 'pill'

export interface ContextMenuItem {
  /** stable id (optional, useful for @select handlers) */
  id?: string
  /** row label; omit + set separator for a divider */
  label?: string
  /** phosphor (or any) icon component */
  icon?: Component
  /** right-aligned shortcut hint, e.g. "⌘C" or "yy" */
  shortcut?: string
  /** red destructive styling */
  danger?: boolean
  disabled?: boolean
  /** render a divider instead of a row */
  separator?: boolean
  /** invoked on activation (also emitted via @select) */
  action?: () => void
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

const props = withDefaults(
  defineProps<{ items?: ContextMenuItem[]; variant?: ContextMenuVariant }>(),
  { variant: 'default' },
)
const emit = defineEmits<{ select: [item: ContextMenuItem] }>()

const visible = ref(false)
const x = ref(0)
const y = ref(0)
const active = ref(-1)
const localItems = ref<ContextMenuItem[]>([])
const menuEl = ref<HTMLElement | null>(null)

const items = computed(() => (localItems.value.length ? localItems.value : props.items ?? []))
const selectable = computed(() =>
  items.value.map((it, i) => ({ it, i })).filter(({ it }) => !it.separator && !it.disabled),
)

const style = computed(() => ({ left: `${x.value}px`, top: `${y.value}px` }))

function open(event: MouseEvent | { clientX: number; clientY: number }, override?: ContextMenuItem[]) {
  if (override) localItems.value = override
  else localItems.value = []
  x.value = event.clientX
  y.value = event.clientY
  active.value = -1
  visible.value = true
  attach()
  void nextTick(() => {
    clampToViewport()
    menuEl.value?.focus()
  })
}

function close() {
  if (!visible.value) return
  visible.value = false
  detach()
}

function clampToViewport() {
  const el = menuEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const pad = 8
  if (x.value + rect.width > window.innerWidth - pad) {
    x.value = Math.max(pad, window.innerWidth - rect.width - pad)
  }
  if (y.value + rect.height > window.innerHeight - pad) {
    y.value = Math.max(pad, window.innerHeight - rect.height - pad)
  }
}

function choose(item: ContextMenuItem) {
  if (item.disabled || item.separator) return
  item.action?.()
  emit('select', item)
  close()
}

function move(delta: number) {
  const list = selectable.value
  if (!list.length) return
  const current = list.findIndex(({ i }) => i === active.value)
  const next = current === -1
    ? delta > 0 ? 0 : list.length - 1
    : (current + delta + list.length) % list.length
  active.value = list[next]!.i
}

function onKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
    case 'j':
      event.preventDefault()
      move(1)
      break
    case 'ArrowUp':
    case 'k':
      event.preventDefault()
      move(-1)
      break
    case 'Home':
      event.preventDefault()
      active.value = selectable.value[0]?.i ?? -1
      break
    case 'End':
      event.preventDefault()
      active.value = selectable.value[selectable.value.length - 1]?.i ?? -1
      break
    case 'Enter':
    case ' ': {
      event.preventDefault()
      const item = items.value[active.value]
      if (item) choose(item)
      break
    }
    case 'Escape':
    case 'Tab':
      event.preventDefault()
      close()
      break
  }
}

function onPointerDown(event: PointerEvent) {
  if (!menuEl.value?.contains(event.target as Node)) close()
}

function attach() {
  document.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('resize', close)
  window.addEventListener('blur', close)
  window.addEventListener('scroll', close, true)
}
function detach() {
  document.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('resize', close)
  window.removeEventListener('blur', close)
  window.removeEventListener('scroll', close, true)
}

onBeforeUnmount(detach)
defineExpose({ open, close })
</script>

<template>
  <Teleport to="body">
    <Transition name="ctx-fade">
      <div
        v-if="visible"
        ref="menuEl"
        class="ctx-menu"
        :class="`ctx-${props.variant}`"
        role="menu"
        tabindex="-1"
        :style="style"
        @keydown="onKeydown"
        @contextmenu.prevent
      >
        <template v-for="(item, i) in items" :key="item.id ?? i">
          <div v-if="item.separator" class="ctx-sep" role="separator" />
          <button
            v-else
            class="ctx-item"
            :class="{ active: i === active, danger: item.danger, disabled: item.disabled }"
            role="menuitem"
            type="button"
            :disabled="item.disabled"
            @click="choose(item)"
            @mousemove="active = i"
          >
            <span class="ctx-icon">
              <component :is="item.icon" v-if="item.icon" :size="15" />
            </span>
            <span class="ctx-label">{{ item.label }}</span>
            <kbd v-if="item.shortcut" class="ctx-shortcut">{{ item.shortcut }}</kbd>
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>
