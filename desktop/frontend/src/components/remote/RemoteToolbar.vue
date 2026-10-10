<script setup lang="ts">
import UiButton from '../common/UiButton.vue'
defineProps<{
  title: string
  repo?: string
  remotes: string[]
  remote: string
  selected: boolean
  listVisible: boolean
  busy: boolean
}>()
const emit = defineEmits<{ 'update:remote': [value: string]; toggle: []; back: []; refresh: [] }>()
function changeRemote(event: Event) {
  const select = event.target as HTMLSelectElement
  emit('update:remote', select.value)
  const menu = select.closest('details')
  if (menu) menu.open = false
}
function closeMenu(event: KeyboardEvent) {
  const menu = (event.currentTarget as HTMLElement).closest('details')
  if (menu) menu.open = false
}
</script>
<template>
  <header class="remote-toolbar">
    <UiButton
      v-if="selected"
      size="sm"
      :aria-expanded="listVisible"
      aria-label="Toggle item list"
      @click="$emit('toggle')"
      >☰</UiButton
    >
    <details class="repository-menu" @keydown.esc.stop="closeMenu">
      <summary>{{ repo || 'Repository' }} <span aria-hidden="true">⌄</span></summary>
      <div class="repository-options">
        <label
          >Remote<select :value="remote" aria-label="GitHub remote" @change="changeRemote">
            <option v-for="name in remotes" :key="name">{{ name }}</option>
          </select></label
        >
      </div>
    </details>
    <span class="divider">/</span
    ><button v-if="selected" class="back" @click="$emit('back')">{{ title }}</button
    ><strong v-else>{{ title }}</strong>
    <UiButton class="refresh" size="sm" :disabled="busy" @click="$emit('refresh')"
      >Refresh</UiButton
    >
  </header>
</template>
<style scoped>
.remote-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 54px;
  background: var(--surface-panel);
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  box-sizing: border-box;
  flex-shrink: 0;
}
.repository-menu {
  position: relative;
  min-width: 0;
}
summary {
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 550;
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
summary span,
.divider {
  color: var(--text-mut);
}
.repository-options {
  position: absolute;
  top: calc(100% + 12px);
  left: 0;
  z-index: 40;
  padding: 16px;
  min-width: 220px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-overlay);
  box-shadow: 0 8px 24px #0004;
}
label {
  display: grid;
  gap: 8px;
  color: var(--text-mut);
  font-size: var(--fs-sm);
}
select {
  background: var(--surface-input);
  color: var(--text);
  border: 1px solid var(--border);
  padding: 6px;
  border-radius: 5px;
}
.back {
  border: 0;
  background: none;
  color: var(--text-mut);
  cursor: pointer;
  font: inherit;
  padding: 0;
  white-space: nowrap;
}
.back:hover {
  color: var(--text);
}
.refresh {
  margin-left: auto;
}
strong {
  white-space: nowrap;
  font-size: var(--fs-sm);
}
</style>
