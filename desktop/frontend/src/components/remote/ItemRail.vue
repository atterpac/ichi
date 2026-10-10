<script setup lang="ts">
import { computed, ref } from 'vue'
defineEmits<{ select: [number: number]; close: []; back: [] }>()
const props = defineProps<{
  title: string
  items: { number: number; title: string; author: string; state: string }[]
  selected: number
}>()
const query = ref('')
const visible = computed(() =>
  props.items.filter((i) =>
    `${i.number} ${i.title} ${i.author}`.toLowerCase().includes(query.value.toLowerCase()),
  ),
)
</script>
<template>
  <nav class="item-rail" :aria-label="title + ' list'">
    <header>
      <button @click="$emit('back')">
        {{ title }} <span>{{ items.length }}</span></button
      ><button aria-label="Collapse item list" @click="$emit('close')">‹</button>
    </header>
    <input
      v-model="query"
      :aria-label="'Find in loaded ' + title.toLowerCase()"
      placeholder="Find in list…"
    />
    <div class="rail-rows">
      <button
        v-for="item in visible"
        :key="item.number"
        :aria-current="selected === item.number ? 'true' : undefined"
        @click="$emit('select', item.number)"
      >
        <strong>{{ item.title }}</strong
        ><small>#{{ item.number }} · {{ item.author }}</small
        ><small>{{ item.state }}</small>
      </button>
      <p v-if="!visible.length">No matches in this list.</p>
    </div>
  </nav>
</template>
<style scoped>
.item-rail {
  flex: 0 0 224px;
  width: 224px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface-sidebar);
  border-right: 1px solid var(--border);
  z-index: 20;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 10px;
}
button {
  font: inherit;
  color: var(--text);
  border: 0;
  background: none;
  cursor: pointer;
}
header button {
  font-size: var(--fs-sm);
}
header span {
  color: var(--text-mut);
  margin-left: 4px;
}
input {
  margin: 0 12px 10px;
  min-width: 0;
  padding: 7px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface-input);
  color: var(--text);
  font: inherit;
  font-size: var(--fs-sm);
}
.rail-rows {
  overflow: auto;
  flex: 1;
}
.rail-rows button {
  width: 100%;
  display: grid;
  text-align: left;
  gap: 7px;
  padding: 14px;
  border-left: 2px solid transparent;
  border-bottom: 1px solid var(--border);
}
.rail-rows button:hover {
  background: var(--hover);
}
.rail-rows button[aria-current] {
  background: var(--selected);
  border-left-color: var(--accent);
}
strong {
  font-size: var(--fs-sm);
  font-weight: 550;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
small,
p {
  color: var(--text-mut);
  font-size: var(--fs-xs);
}
p {
  padding: 12px;
}
@media (max-width: 1100px) {
  .item-rail {
    position: absolute;
    inset: 0 auto 0 0;
    box-shadow: 8px 0 24px #0005;
  }
}
input::placeholder { color: var(--text-mut); opacity: .85; }
</style>
