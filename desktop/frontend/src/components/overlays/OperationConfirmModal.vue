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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PhCheck, PhWarningCircle, PhX } from '@phosphor-icons/vue'

const props = defineProps<{
  request: OperationConfirmRequest
}>()

const emit = defineEmits<{
  close: []
}>()

const busy = ref(false)
const error = ref('')
const values = ref<OperationInputValues>({})

const tone = computed(() => props.request.tone ?? 'default')
const Icon = computed(() => props.request.icon ?? PhWarningCircle)
const inputError = computed(() => {
  for (const input of props.request.inputs ?? []) {
    const value = values.value[input.id]?.trim() ?? ''
    if (input.required && !value) return `${input.label} is required.`
    if (input.pattern && value && !new RegExp(input.pattern).test(value)) return `${input.label} is not valid.`
  }
  return ''
})
const canConfirm = computed(() => !busy.value && !inputError.value)

watch(
  () => props.request,
  (request) => {
    values.value = Object.fromEntries((request.inputs ?? []).map((input) => [input.id, input.value ?? '']))
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
          <button class="operation-close" type="button" aria-label="Close confirmation" @click="emit('close')">
            <kbd>esc</kbd>
            <PhX :size="13" weight="bold" />
          </button>
        </header>

        <div class="operation-body">
          <p v-if="props.request.target" class="operation-target">{{ props.request.target }}</p>
          <div v-if="props.request.inputs?.length" class="operation-inputs">
            <label v-for="input in props.request.inputs" :key="input.id">
              <span>{{ input.label }}</span>
              <input
                v-model="values[input.id]"
                :placeholder="input.placeholder"
                :required="input.required"
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
          <button class="operation-secondary" type="button" :disabled="busy" @click="emit('close')">Cancel</button>
          <button class="operation-primary" type="button" :disabled="!canConfirm" @click="confirm">
            <PhCheck :size="14" weight="bold" />
            {{ busy ? 'Running...' : props.request.confirmLabel }}
          </button>
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
  padding: 20px 20px 42px;
  background: rgba(0, 0, 0, .24);
  backdrop-filter: blur(1px);
}

.operation-confirm {
  width: min(calc(100vw - 32px), 620px);
  overflow: hidden;
  border: 1px solid var(--border-2);
  border-radius: 14px;
  background: color-mix(in oklab, var(--surface) 96%, transparent);
  box-shadow: 0 30px 80px rgba(0, 0, 0, .58), var(--top-hi);
}

.operation-head {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--border);
}

.operation-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--accent-line);
  border-radius: 9px;
  background: var(--accent-soft);
  color: var(--accent);
}

.operation-confirm.tone-warning .operation-icon {
  border-color: color-mix(in oklab, var(--orange) 42%, transparent);
  background: color-mix(in oklab, var(--orange) 16%, transparent);
  color: var(--orange);
}

.operation-confirm.tone-danger .operation-icon {
  border-color: color-mix(in oklab, var(--red) 42%, transparent);
  background: color-mix(in oklab, var(--red) 14%, transparent);
  color: var(--red);
}

.operation-head h2,
.operation-head p {
  margin: 0;
}

.operation-head h2 {
  color: var(--head);
  font: 650 17px/1.2 "Hanken Grotesk", Inter, sans-serif;
}

.operation-head p {
  margin-top: 4px;
  color: var(--text-dim);
  font-size: 13px;
  line-height: 1.45;
}

.operation-close,
.operation-secondary,
.operation-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--border-2);
  border-radius: 8px;
  background: transparent;
  color: var(--text-dim);
  font: 12px "JetBrains Mono", ui-monospace, monospace;
}

.operation-close {
  min-height: 30px;
  padding: 0 8px;
}

.operation-close:hover,
.operation-secondary:hover,
.operation-close:focus-visible,
.operation-secondary:focus-visible {
  outline: 0;
  border-color: var(--accent-line);
  color: var(--accent);
}

.operation-close kbd {
  color: var(--text-mut);
  font: 10px "JetBrains Mono", ui-monospace, monospace;
}

.operation-body {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
}

.operation-target {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
  color: var(--text);
  font: 12px "JetBrains Mono", ui-monospace, monospace;
  overflow-wrap: anywhere;
}

.operation-inputs {
  display: grid;
  gap: 9px;
}

.operation-inputs label {
  display: grid;
  gap: 7px;
}

.operation-inputs span {
  color: var(--text-mut);
  font: 11px "JetBrains Mono", ui-monospace, monospace;
}

.operation-inputs input {
  min-width: 0;
  height: 38px;
  border: 1px solid var(--border-2);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text);
  padding: 0 11px;
  outline: 0;
  font: 12px "JetBrains Mono", ui-monospace, monospace;
}

.operation-inputs input:focus {
  border-color: var(--accent-line);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.operation-details {
  display: grid;
  gap: 7px;
  margin: 0;
}

.operation-details div {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 10px;
}

.operation-details dt {
  color: var(--text-mut);
  font: 11px "JetBrains Mono", ui-monospace, monospace;
}

.operation-details dd {
  min-width: 0;
  margin: 0;
  color: var(--text-dim);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.operation-error {
  margin: 0;
  padding: 9px 10px;
  border: 1px solid color-mix(in oklab, var(--red) 36%, transparent);
  border-radius: 8px;
  background: color-mix(in oklab, var(--red) 10%, transparent);
  color: var(--red);
  font-size: 12px;
  line-height: 1.45;
}

.operation-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px 14px;
}

.operation-secondary,
.operation-primary {
  min-height: 34px;
  padding: 0 12px;
}

.operation-primary {
  border-color: var(--accent-line);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
}

.operation-confirm.tone-warning .operation-primary {
  border-color: color-mix(in oklab, var(--orange) 44%, transparent);
  background: color-mix(in oklab, var(--orange) 16%, transparent);
  color: var(--orange);
}

.operation-confirm.tone-danger .operation-primary {
  border-color: color-mix(in oklab, var(--red) 44%, transparent);
  background: color-mix(in oklab, var(--red) 16%, transparent);
  color: var(--red);
}

.operation-primary:disabled,
.operation-secondary:disabled {
  opacity: .62;
  cursor: wait;
}

@media (max-width: 560px) {
  .operation-backdrop {
    padding: 12px 12px 34px;
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
