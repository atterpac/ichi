<script lang="ts">
import type { Component } from 'vue'

export type OperationTone = 'default' | 'warning' | 'danger'

export type OperationDetail = {
  label: string
  value: string
}

export type OperationInput = {
  id: string
  label: string
  placeholder?: string
  value?: string
  required?: boolean
  pattern?: string
}

export type OperationInputValues = Record<string, string>

export type OperationConfirmRequest = {
  title: string
  message: string
  confirmLabel: string
  target?: string
  details?: OperationDetail[]
  inputs?: OperationInput[]
  tone?: OperationTone
  icon?: Component
  onConfirm: (values: OperationInputValues) => void | Promise<void>
}
</script>

<script setup lang="ts">
import UiButton from '../common/UiButton.vue'
import UiInput from '../common/UiInput.vue'
import { useDialogFocus } from '../../composables/useDialogFocus'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PhCheck, PhWarningCircle, PhX } from '@phosphor-icons/vue'

const props = defineProps<{
  request: OperationConfirmRequest
}>()

const emit = defineEmits<{
  close: []
}>()

const dialog = ref<HTMLElement | null>(null)
useDialogFocus(dialog, () => emit('close'))

const busy = ref(false)
const error = ref('')
const values = ref<OperationInputValues>({})

const tone = computed(() => props.request.tone ?? 'default')
const Icon = computed(() => props.request.icon ?? PhWarningCircle)
const inputError = computed(() => {
  for (const input of props.request.inputs ?? []) {
    const value = values.value[input.id]?.trim() ?? ''
    if (input.required && !value) return `${input.label} is required.`
    if (input.pattern && value && !new RegExp(input.pattern).test(value))
      return `${input.label} is not valid.`
  }
  return ''
})
const canConfirm = computed(() => !busy.value && !inputError.value)

watch(
  () => props.request,
  (request) => {
    values.value = Object.fromEntries(
      (request.inputs ?? []).map((input) => [input.id, input.value ?? '']),
    )
    error.value = ''
  },
  { immediate: true },
)

async function confirm() {
  if (!canConfirm.value) {
    error.value = inputError.value
    return
  }
  busy.value = true
  error.value = ''
  try {
    await props.request.onConfirm(values.value)
    emit('close')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
  if ((event.key === 'Enter' || event.key === ' ') && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    void confirm()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="operation-backdrop" @click.self="emit('close')">
      <section
        ref="dialog"
        tabindex="-1"
        class="operation-confirm"
        :class="`tone-${tone}`"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operation-confirm-title"
      >
        <header class="operation-head">
          <span class="operation-icon">
            <component :is="Icon" :size="20" weight="bold" />
          </span>
          <div>
            <h2 id="operation-confirm-title">{{ props.request.title }}</h2>
            <p>{{ props.request.message }}</p>
          </div>
          <UiButton
            class="operation-close"
            aria-label="Close confirmation"
            @click="emit('close')"
            size="sm"
            variant="ghost"
          >
            <kbd>esc</kbd>
            <PhX :size="16" weight="bold" />
          </UiButton>
        </header>

        <div class="operation-body">
          <p v-if="props.request.target" class="operation-target">{{ props.request.target }}</p>
          <div v-if="props.request.inputs?.length" class="operation-inputs">
            <label v-for="input in props.request.inputs" :key="input.id">
              <span>{{ input.label }}</span>
              <UiInput
                size="lg"
                v-model="values[input.id]"
                :placeholder="input.placeholder"
                :required="input.required"
                :invalid="Boolean(error)"
                autocomplete="off"
                spellcheck="false"
              />
            </label>
          </div>
          <dl v-if="props.request.details?.length" class="operation-details">
            <div v-for="detail in props.request.details" :key="detail.label">
              <dt>{{ detail.label }}</dt>
              <dd>{{ detail.value }}</dd>
            </div>
          </dl>
          <p v-if="error" class="operation-error">{{ error }}</p>
        </div>

        <footer class="operation-actions">
          <UiButton class="operation-secondary" :disabled="busy" @click="emit('close')" size="lg"
            >Cancel</UiButton
          >
          <UiButton
            class="operation-primary"
            :disabled="!canConfirm"
            @click="confirm"
            :variant="tone === 'danger' ? 'danger' : 'primary'"
            size="lg"
            :loading="busy"
          >
            <PhCheck :size="16" weight="bold" />
            {{ busy ? 'Running...' : props.request.confirmLabel }}
          </UiButton>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.operation-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: end center;
  padding: var(--space-10) var(--space-10) 42px;
  background: rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(1px);
}

.operation-confirm {
  width: min(calc(100vw - 32px), 620px);
  overflow: hidden;
  border: 1px solid var(--border-2);
  border-radius: var(--radius-xl);
  background: var(--surface-overlay);
  box-shadow: var(--elev-3);
}

.operation-head {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: start;
  border-bottom: 1px solid var(--border);
  padding: var(--dialog-inset);
  gap: var(--space-6);
}

.operation-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--accent-line);
  border-radius: var(--radius-lg);
  background: var(--accent-soft);
  color: var(--accent-text);
}

.operation-confirm.tone-warning .operation-icon {
  border-color: color-mix(in oklab, var(--orange) 42%, transparent);
  background: color-mix(in oklab, var(--orange) 16%, transparent);
  color: var(--warning-text);
}

.operation-confirm.tone-danger .operation-icon {
  border-color: color-mix(in oklab, var(--red) 42%, transparent);
  background: color-mix(in oklab, var(--red) 14%, transparent);
  color: var(--negative-text);
}

.operation-head h2,
.operation-head p {
  margin: 0;
}

.operation-head h2 {
  color: var(--head);
  font: var(--weight-medium) var(--fs-lg)/1.35 var(--font-ui);
}

.operation-head p {
  margin-top: var(--space-2);
  color: var(--text-dim);
  font-size: var(--fs-md);
  line-height: 1.45;
}

.operation-close kbd {
  color: var(--text-mut);
  font: var(--fs-2xs) var(--font-mono);
}

.operation-body {
  display: grid;
  padding: var(--space-8) var(--dialog-inset);
  gap: var(--space-8);
}

.operation-target {
  margin: 0;
  padding: var(--space-4) var(--space-6);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  color: var(--text);
  font: var(--fs-sm) var(--font-mono);
  overflow-wrap: anywhere;
}

.operation-inputs {
  display: grid;
  gap: var(--space-6);
}

.operation-inputs label {
  display: grid;
  gap: var(--space-4);
}

.operation-inputs span {
  color: var(--text-mut);
  font: var(--fs-sm) var(--font-ui);
}

.operation-details {
  display: grid;
  gap: var(--space-4);
  margin: 0;
}

.operation-details div {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: var(--space-4);
}

.operation-details dt {
  color: var(--text-mut);
  font: var(--fs-xs) var(--font-mono);
}

.operation-details dd {
  min-width: 0;
  margin: 0;
  color: var(--text-dim);
  font-size: var(--fs-md);
  overflow-wrap: anywhere;
}

.operation-error {
  margin: 0;
  padding: var(--space-4) var(--space-4);
  border: 1px solid color-mix(in oklab, var(--red) 36%, transparent);
  border-radius: 8px;
  background: color-mix(in oklab, var(--red) 10%, transparent);
  color: var(--negative-text);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.operation-actions {
  display: flex;
  justify-content: flex-end;
  padding: 0 var(--dialog-inset) var(--dialog-inset);
  gap: var(--space-4);
}

.operation-confirm.tone-warning .operation-primary {
  border-color: color-mix(in oklab, var(--orange) 44%, transparent);
  background: color-mix(in oklab, var(--orange) 16%, transparent);
  color: var(--warning-text);
}

.operation-confirm.tone-danger .operation-primary {
  border-color: color-mix(in oklab, var(--red) 44%, transparent);
  background: color-mix(in oklab, var(--red) 16%, transparent);
  color: var(--negative-text);
}

.operation-primary:disabled,
.operation-secondary:disabled {
  opacity: 0.62;
  cursor: wait;
}

@media (max-width: 560px) {
  .operation-backdrop {
    padding: var(--space-6) var(--space-6) 34px;
  }

  .operation-head {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .operation-close {
    grid-column: 1 / -1;
    justify-self: end;
  }

  .operation-actions {
    flex-direction: column-reverse;
  }
}
</style>
