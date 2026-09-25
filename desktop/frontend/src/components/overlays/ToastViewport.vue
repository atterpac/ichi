<script setup lang="ts">
import UiButton from '../common/UiButton.vue'
import UiIconButton from '../common/UiIconButton.vue'
import { type Component } from 'vue'
import { dismissToast, type Toast, useToasts } from '../../composables/useToasts'
import {
  PhCheckCircle,
  PhInfo,
  PhWarning,
  PhWarningCircle,
  PhX,
} from '@phosphor-icons/vue'

const { toasts } = useToasts()

const toneIcons: Record<Toast['tone'], Component> = {
  info: PhInfo,
  success: PhCheckCircle,
  warning: PhWarning,
  danger: PhWarningCircle,
}

function runAction(toast: Toast) {
  toast.onAction?.()
  dismissToast(toast.id)
}
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="toast-move" tag="section" class="toast-viewport" aria-live="polite">
      <article v-for="toast in toasts" :key="toast.id" class="toast" :class="`tone-${toast.tone}`">
        <component :is="toneIcons[toast.tone]" class="toast-icon" :size="18" weight="bold" />
        <div class="toast-copy">
          <b>{{ toast.title }}</b>
          <small v-if="toast.message">{{ toast.message }}</small>
        </div>
        <UiButton v-if="toast.actionLabel" class="toast-action" @click="runAction(toast)" size="sm">
          {{ toast.actionLabel }}
        </UiButton>
        <UiIconButton class="toast-close" size="sm" label="Dismiss notification" @click="dismissToast(toast.id)">
          <PhX weight="bold" :size="16" />
        </UiIconButton>
      </article>
    </TransitionGroup>
  </Teleport>
</template>
