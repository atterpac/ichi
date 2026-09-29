<script setup lang="ts">
import ToastCard from './ToastCard.vue'
import { useShellSettings } from '../../composables/useShellSettings'
import { dismissToast, type Toast, useToasts } from '../../composables/useToasts'

const { toasts } = useToasts()
const settings = useShellSettings()
function runAction(toast: Toast) {
  toast.onAction?.()
  dismissToast(toast.id)
}
</script>
<template>
  <Teleport to="body">
    <TransitionGroup name="toast-move" tag="section" class="toast-viewport" :class="`toast-placement-${settings.toastStyle}`" aria-label="Notifications" aria-live="polite" aria-relevant="additions">
      <ToastCard v-for="toast in toasts" :key="toast.id" :toast="toast" :design="settings.toastStyle" @action="runAction(toast)" @dismiss="dismissToast(toast.id)" />
    </TransitionGroup>
  </Teleport>
</template>
