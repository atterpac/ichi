<script setup lang="ts">
import type { Component } from 'vue'
import { PhCheckCircle, PhInfo, PhWarning, PhWarningCircle, PhX, PhArrowUpRight } from '@phosphor-icons/vue'
import type { Toast } from '../../composables/useToasts'
import type { ToastStyle } from '../../customization/usePreferences'

defineProps<{ toast: Toast; design: ToastStyle; preview?: boolean }>()
const emit = defineEmits<{ action: []; dismiss: [] }>()
const icons: Record<Toast['tone'], Component> = { info: PhInfo, success: PhCheckCircle, warning: PhWarning, danger: PhWarningCircle }
const labels = { info: 'Update', success: 'Done', warning: 'Heads up', danger: 'Failed' }
</script>
<template>
  <article class="toast" :aria-label="labels[toast.tone]" :class="[`tone-${toast.tone}`, `toast-${design}`, { 'toast-with-message': !!toast.message }]">
    <div v-if="design !== 'card'" class="toast-signal"><component :is="icons[toast.tone]" :size="design === 'capsule' ? 22 : 16" weight="bold" aria-hidden="true" /><span>{{ labels[toast.tone] }}</span></div>
    <div class="toast-copy"><b>{{ toast.title }}</b><small v-if="toast.message">{{ toast.message }}</small></div>
    <button v-if="toast.actionLabel" type="button" class="toast-action" :disabled="preview" @click="emit('action')"><span>{{ toast.actionLabel }}</span><PhArrowUpRight v-if="design !== 'card'" :size="14" aria-hidden="true" /></button>
    <button type="button" class="toast-close" aria-label="Dismiss notification" :disabled="preview" @click="emit('dismiss')"><PhX weight="bold" :size="14" /></button>
  </article>
</template>
