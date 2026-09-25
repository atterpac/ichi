<script setup lang="ts">
import { computed } from 'vue'
import { PhCheckCircle, PhCircleNotch, PhGitCommit, PhWarningCircle } from '@phosphor-icons/vue'
import UiButton from './UiButton.vue'

const props = withDefaults(
  defineProps<{
    title: string
    message?: string
    tone?: 'loading' | 'empty' | 'error' | 'success'
    actionLabel?: string
    compact?: boolean
  }>(),
  {
    message: '',
    tone: 'empty',
    actionLabel: '',
    compact: false,
  },
)

const emit = defineEmits<{ action: [] }>()

const icon = computed(() => {
  if (props.tone === 'loading') return PhCircleNotch
  if (props.tone === 'error') return PhWarningCircle
  if (props.tone === 'success') return PhCheckCircle
  return PhGitCommit
})
</script>

<template>
  <section
    class="surface-state"
    :class="[`tone-${tone}`, { compact }]"
    :aria-busy="tone === 'loading'"
    :aria-live="tone === 'error' ? 'assertive' : 'polite'"
  >
    <component
      :is="icon"
      class="surface-state-icon"
      :class="{ spinning: tone === 'loading' }"
      :size="compact ? 18 : 24"
    />
    <div class="surface-state-copy">
      <strong>{{ title }}</strong>
      <p v-if="message">{{ message }}</p>
    </div>
    <UiButton v-if="actionLabel" class="surface-state-action" size="sm" @click="emit('action')">
      {{ actionLabel }}
    </UiButton>
  </section>
</template>
