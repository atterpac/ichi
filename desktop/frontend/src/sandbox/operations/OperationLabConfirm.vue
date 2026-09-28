<script setup lang="ts">
import { ref } from 'vue'
import { PhWarningCircle } from '@phosphor-icons/vue'
import { useDialogFocus } from '../../composables/useDialogFocus'
defineProps<{ kind: 'abort' | 'skip' }>()
const emit = defineEmits<{ close: []; confirm: [] }>()
const dialog = ref<HTMLElement | null>(null)
useDialogFocus(dialog, () => emit('close'))
</script>
<template>
  <div class="dialog-backdrop" @click.self="emit('close')">
    <section
      ref="dialog"
      class="confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      tabindex="-1"
    >
      <PhWarningCircle :size="28" class="amber" />
      <h2 id="confirm-title">
        {{ kind === 'abort' ? 'Abort this rebase?' : 'Skip the current commit?' }}
      </h2>
      <p>
        {{
          kind === 'abort'
            ? 'Return feature/session to f52cd09. Resolutions made during this example rebase will be discarded.'
            : 'Omit “Persist sessions without secrets” from the rewritten history. Its changes and the current conflict resolutions will not be applied.'
        }}
      </p>
      <p class="quiet">The pre-rebase recovery point remains available.</p>
      <div>
        <button @click="emit('close')">Keep resolving</button
        ><button class="danger-button" @click="emit('confirm')">
          {{ kind === 'abort' ? 'Abort rebase' : 'Skip commit' }}
        </button>
      </div>
    </section>
  </div>
</template>
