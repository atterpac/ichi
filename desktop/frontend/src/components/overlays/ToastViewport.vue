<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useShellSettings } from '../../composables/useShellSettings'
import { dismissToast, type Toast, useToasts } from '../../composables/useToasts'
import {
  PhCheckCircle,
  PhInfo,
  PhWarning,
  PhWarningCircle,
  PhX,
} from '@phosphor-icons/vue'

const settings = useShellSettings()
const { toasts } = useToasts()

const toneIcons: Record<Toast['tone'], Component> = {
  info: PhInfo,
  success: PhCheckCircle,
  warning: PhWarning,
  danger: PhWarningCircle,
}

const viewportClass = computed(() => `toast-${settings.toastStyle}`)

function runAction(toast: Toast) {
  toast.onAction?.()
  dismissToast(toast.id)
}
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="toast-move" tag="section" class="toast-viewport" :class="viewportClass" aria-live="polite">
      <article v-for="toast in toasts" :key="toast.id" class="toast" :class="`tone-${toast.tone}`">
        <component :is="toneIcons[toast.tone]" class="toast-icon" :size="18" weight="bold" />
        <div class="toast-copy">
          <b>{{ toast.title }}</b>
          <small v-if="toast.message">{{ toast.message }}</small>
        </div>
        <button v-if="toast.actionLabel" class="toast-action" type="button" @click="runAction(toast)">
          {{ toast.actionLabel }}
        </button>
        <button class="toast-close" type="button" aria-label="Dismiss notification" @click="dismissToast(toast.id)">
          <PhX :size="12" weight="bold" />
        </button>
      </article>
    </TransitionGroup>
  </Teleport>
</template>
