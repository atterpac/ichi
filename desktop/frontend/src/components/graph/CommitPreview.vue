<script setup lang="ts">
import { computed, shallowRef, ref, watch } from 'vue'
import { DiffService } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import { LineType, type ChangedFile, type FileDiff } from '../../bindings/github.com/atterpac/ichi/internal/git'

const props = defineProps<{ hash: string; parent?: string; file: ChangedFile }>()
const emit = defineEmits<{ review: [path: string] }>()
const patch = shallowRef<FileDiff | null>(null)
const loading = ref(false)
const unavailable = ref(false)
const lines = computed(() => (patch.value?.Hunks[0]?.Lines ?? []).filter(line => line !== null).slice(0, 12))
watch(() => [props.hash, props.parent, props.file] as const, async (_, __, onCleanup) => {
  let current = true
  let request: { cancel?: () => void } | undefined
  onCleanup(() => { current = false; request?.cancel?.() })
  patch.value = null
  unavailable.value = false
  loading.value = false
  if (props.file.Binary) return
  loading.value = true
  try {
    if (props.parent) {
      const read = DiffService.DiffBetweenFile(props.parent, props.hash, props.file.Path, props.file.OldPath || '')
      request = read
      const result = await read
      if (current) patch.value = result
    } else {
      const read = DiffService.FileDiff(props.hash, props.file.Path)
      request = read
      const result = await read
      if (current) patch.value = result.find(file => file?.Path === props.file.Path) ?? null
    }
  } catch {
    if (current) unavailable.value = true
  } finally {
    if (current) loading.value = false
  }
}, { immediate: true })
</script>

<template>
  <section class="commit-preview" aria-label="Change preview">
    <header>
      <span>Change preview</span>
      <button type="button" @click="emit('review', file.Path)">Open full diff →</button>
    </header>
    <p v-if="loading" role="status">Loading preview…</p>
    <p v-else-if="file.Binary || patch?.Binary">Binary file · open the full diff for details.</p>
    <p v-else-if="unavailable">Preview unavailable. Open the full diff to review this file.</p>
    <template v-else-if="lines.length">
      <div class="commit-preview-code" tabindex="0" aria-label="First hunk preview">
        <div v-for="(line, index) in lines" :key="index" class="commit-preview-line"
          :class="{ added: line.Type === LineType.LineAdded, removed: line.Type === LineType.LineRemoved }">
          <span class="preview-line-number">{{ line.NewLineNo || line.OldLineNo || '' }}</span>
          <span class="preview-line-sign">{{ line.Type === LineType.LineAdded ? '+' : line.Type === LineType.LineRemoved ? '−' : ' ' }}</span>
          <code>{{ line.Content.slice(0, 500) }}</code>
        </div>
      </div>
      <p class="preview-caption">First hunk · up to 12 lines</p>
    </template>
    <p v-else>No text changes to preview.</p>
  </section>
</template>
