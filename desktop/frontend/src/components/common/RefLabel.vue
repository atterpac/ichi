<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { PhCheck } from '@phosphor-icons/vue'
import { usePreferences } from '../../customization/usePreferences'
import { refIcons, refPresentation, type RefLabelConfig } from '../../customization/refLabels'
import { formatRef, refPresetText } from '../../customization/refFormatter'

const props = defineProps<{
  name: string
  kind: string
  current?: boolean
  colorVar?: string
  expanded?: boolean
  config?: RefLabelConfig
}>()
const preferences = usePreferences()
const presentation = computed(() =>
  refPresentation(
    props.config ?? preferences.values.value['graph.refLabels'],
    props.name,
    props.kind,
    props.current,
    props.expanded,
  ),
)
const formatted = ref('')
watch(
  () => presentation.value.request,
  (request, _, cleanup) => {
    let active = true
    cleanup(() => {
      active = false
    })
    formatted.value = refPresetText(request) ?? request.Name
    if (refPresetText(request) !== undefined) return
    void formatRef(request).then((result) => {
      if (active) formatted.value = result.Text || request.Name
    })
  },
  { immediate: true },
)
const icon = computed(() => refIcons[presentation.value.icon].component)
</script>

<template>
  <span
    class="ref-label"
    :class="{ 'is-current': current, 'is-tag': kind === 'tag' }"
    :style="colorVar ? { '--ref-color': `var(${colorVar})` } : undefined"
    :title="`${name}${current ? ' · current branch' : ''}`"
  >
    <PhCheck v-if="current" class="ref-marker" :size="14" weight="bold" aria-hidden="true" />
    <component
      :is="icon"
      v-else-if="icon"
      class="ref-marker"
      :size="14"
      weight="bold"
      aria-hidden="true"
    />
    <span v-else-if="presentation.icon === 'dot'" class="ref-dot" aria-hidden="true" />
    <span class="ref-name" aria-hidden="true">{{ formatted }}</span>
    <span class="ref-sr">{{ name }}</span>
    <span v-if="current" class="ref-sr"> (current branch)</span>
  </span>
</template>

<style scoped>
.ref-label {
  --ref-color: var(--row-lane, var(--accent));
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  max-width: 100%;
  height: 22px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-xs);
  background: color-mix(in oklab, var(--text) 5%, transparent);
  color: var(--text);
  font: var(--weight-regular) var(--fs-xs)/1.5 var(--font-mono);
  vertical-align: middle;
}
.ref-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ref-marker {
  flex: none;
  color: var(--ref-color);
}
.ref-dot {
  flex: none;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ref-color);
}
.is-current {
  color: var(--head);
  font-weight: var(--weight-medium);
}
.is-tag .ref-marker {
  color: var(--text-mut);
}
.ref-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
