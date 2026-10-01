<script setup lang="ts" generic="T">
import { computed, ref } from 'vue'
import { useVirtualWindow } from '../../composables/useVirtualWindow'

const props = withDefaults(defineProps<{
  items: T[]
  rowHeight: number
  keyOf: (item: T) => string | number
  threshold?: number
}>(), { threshold: 200 })
const container = ref<HTMLElement | null>(null)
const { window, scrollToRow } = useVirtualWindow({
  count: () => props.items.length, rowHeight: () => props.rowHeight, container,
  offset: () => container.value ? Number.parseFloat(getComputedStyle(container.value).paddingTop) || 0 : 0,
})
const virtual = computed(() => props.items.length > props.threshold)
const visible = computed(() => virtual.value
  ? props.items.slice(window.value.start, window.value.end) : props.items)
function scrollToIndex(index: number) {
  if (virtual.value) scrollToRow(index)
  else container.value?.children[index]?.scrollIntoView?.({ block: 'nearest' })
}
defineExpose({ scrollToIndex })
</script>

<template>
  <div ref="container" class="windowed-list" :data-virtual="virtual" :style="{ '--windowed-row-height': `${rowHeight}px` }">
    <slot v-if="!items.length" name="empty" />
    <div v-else-if="virtual" :style="{ height: `${window.totalHeight}px`, position: 'relative' }">
      <div class="windowed-rows" :style="{ transform: `translateY(${window.offsetY}px)` }">
        <template v-for="(item, index) in visible" :key="keyOf(item)">
          <slot :item="item" :index="window.start + index" />
        </template>
      </div>
    </div>
    <template v-else v-for="(item, index) in visible" :key="keyOf(item)">
      <slot :item="item" :index="index" />
    </template>
  </div>
</template>

<style scoped>
.windowed-rows > :deep(*) {
  height: var(--windowed-row-height);
  min-height: var(--windowed-row-height);
  max-height: var(--windowed-row-height);
}
</style>
