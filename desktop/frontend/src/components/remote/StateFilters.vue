<script setup lang="ts">
import { ref } from 'vue'
const props = defineProps<{
  compact?: boolean
  modelValue: string
  states: string[]
  count: number
  label: string
  author: string
  labelFilter: string
  assignee?: string
  busy?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  filter: [value: { author: string; label: string; assignee: string }]
}>()
const expanded = ref(false)
const authorDraft = ref(props.author)
const labelDraft = ref(props.labelFilter)
const assigneeDraft = ref(props.assignee ?? '')
function apply() {
  emit('filter', {
    author: authorDraft.value.trim(),
    label: labelDraft.value.trim(),
    assignee: assigneeDraft.value.trim(),
  })
  expanded.value = false
}
function clear() {
  authorDraft.value = ''
  labelDraft.value = ''
  assigneeDraft.value = ''
  apply()
}
</script>
<template>
  <div class="browse-controls" :class="{ compact }">
    <select
      v-if="compact"
      :aria-label="label"
      :value="modelValue"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="state in states" :key="state" :value="state">
        {{ state === 'all' ? 'Any state' : state[0]!.toUpperCase() + state.slice(1) }}
      </option>
    </select>
    <div v-else class="state-options" role="group" :aria-label="label">
      <button
        v-for="state in states"
        :key="state"
        :aria-pressed="modelValue === state"
        @click="emit('update:modelValue', state)"
      >
        {{ state }}
        <span v-if="state === modelValue && !busy" title="Matching items loaded">{{ count }}</span>
      </button>
    </div>
    <div class="filter-menu">
      <button class="filter-toggle" :aria-expanded="expanded" @click="expanded = !expanded">
        Filter<span v-if="author || labelFilter || assignee">
          · {{ [author, labelFilter, assignee].filter(Boolean).length }}</span
        >
      </button>
      <form
        v-if="expanded"
        class="filter-popover"
        @submit.prevent="apply"
        @keydown.esc.stop="expanded = false"
      >
        <label>Author<input v-model="authorDraft" placeholder="GitHub username" /></label>
        <label v-if="assignee !== undefined"
          >Assignee<input v-model="assigneeDraft" placeholder="GitHub username"
        /></label>
        <label>Label<input v-model="labelDraft" placeholder="e.g. bug" /></label>
        <div>
          <button type="button" @click="clear">Clear</button
          ><button type="submit">Apply filters</button>
        </div>
      </form>
    </div>
    <span v-if="!compact" class="loaded-note">Counts reflect loaded results</span>
  </div>
</template>
<style scoped>
.browse-controls.compact {
  padding: 0;
  gap: 6px;
  flex-wrap: nowrap;
}
.compact select {
  height: 30px;
  font: inherit;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 8px;
  color: var(--text);
  background: var(--surface-input);
}
.compact .filter-toggle {
  height: 30px;
  padding: 0 8px;
}
.compact .filter-popover {
  left: auto;
  right: 0;
}
.browse-controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  padding: 12px 16px 0;
}
.state-options {
  display: flex;
  gap: 4px;
}
button {
  font: inherit;
  font-size: var(--fs-sm);
  cursor: pointer;
  color: var(--text-mut);
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 7px 10px;
}
.state-options button {
  text-transform: capitalize;
}
button[aria-pressed='true'] {
  color: var(--text);
  background: var(--surface-overlay);
  border-color: var(--border);
}
.state-options span {
  font-size: var(--fs-xs);
  padding-left: 5px;
  color: var(--text-mut);
}
.filter-menu {
  position: relative;
}
.filter-toggle {
  border-color: var(--border);
}
.filter-popover {
  position: absolute;
  z-index: 30;
  top: calc(100% + 8px);
  left: 0;
  width: 240px;
  padding: 16px;
  display: grid;
  gap: 12px;
  background: var(--surface-overlay);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px #0004;
}
label {
  display: grid;
  gap: 5px;
  font-size: var(--fs-sm);
  color: var(--text-mut);
}
input {
  width: 100%;
  box-sizing: border-box;
  background: var(--surface-input);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  padding: 7px;
  font: inherit;
}
.filter-popover > div {
  display: flex;
  justify-content: space-between;
}
.filter-popover button {
  border-color: var(--border);
  color: var(--text);
}
.loaded-note {
  color: var(--text-mut);
  font-size: var(--fs-xs);
  margin-left: auto;
}
@media (max-width: 650px) {
  .loaded-note {
    display: none;
  }
  .filter-popover {
    left: auto;
    right: 0;
  }
}
</style>
