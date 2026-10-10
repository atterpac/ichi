<script setup lang="ts">
defineProps<{ kind: 'pr' | 'issue'; scope: string; sort: string }>()
defineEmits<{ 'update:scope': [value: string]; 'update:sort': [value: string] }>()
</script>
<template>
  <div class="inbox-controls">
    <select
      class="inbox-scope"
      aria-label="Inbox scope"
      :value="scope"
      @change="$emit('update:scope', ($event.target as HTMLSelectElement).value)"
    >
      <option value="all">{{ kind === 'pr' ? 'All pull requests' : 'All issues' }}</option>
      <option value="attention">{{ kind === 'pr' ? 'Needs my review' : 'Assigned to me' }}</option>
      <option value="mine">{{ kind === 'pr' ? 'Mine' : 'Created by me' }}</option>
    </select>
    <slot />
    <select
      aria-label="Sort results"
      title="Sort results"
      :value="sort"
      @change="$emit('update:sort', ($event.target as HTMLSelectElement).value)"
    >
      <option value="updated-desc">Updated</option>
      <option value="created-desc">Newest</option>
      <option value="created-asc">Oldest</option>
    </select>
  </div>
</template>
<style scoped>
.inbox-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
select {
  font: inherit;
  font-size: 12px;
  height: 30px;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface-input);
  padding: 0 8px;
  min-width: 0;
}
.inbox-scope {
  max-width: 165px;
  font-weight: 600;
}
.inbox-controls :deep(form.inbox-search) {
  display: flex;
  flex: 1;
  min-width: 150px;
  margin: 0;
  gap: 6px;
  padding: 0;
  border: 0;
  flex-wrap: nowrap;
}
.inbox-controls :deep(.inbox-search input) {
  width: 100%;
  min-width: 0;
  flex: 1;
  height: 30px;
}
.inbox-controls :deep(.inbox-search button) {
  height: 30px;
}
@media (max-width: 760px) {
  .inbox-controls {
    flex-wrap: wrap;
  }
  .inbox-controls :deep(form.inbox-search) {
    flex-basis: 100%;
    order: -1;
  }
}
</style>
