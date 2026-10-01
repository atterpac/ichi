<script setup lang="ts">
import type { ChangedFile } from '../../bindings/github.com/atterpac/ichi/internal/git'
import FileStatusIcon from '../common/FileStatusIcon.vue'
import DiffBar from '../common/DiffBar.vue'

defineProps<{ file: ChangedFile; index: number; selected: boolean; showDirectory?: boolean }>()
const emit = defineEmits<{ review: [path: string] }>()
</script>

<template>
  <button
    class="detail-file-row"
    :id="`commit-heat-file-${index}`"
    :class="{ 'heat-selected': selected }"
    type="button"
    :title="`View commit diff: ${file.Path}`"
    :tabindex="selected ? 0 : -1"
    @click="emit('review', file.Path)"
  >
    <FileStatusIcon class="file-status" :status="file.Status" />
    <span class="file-path"
      ><span class="file-name">{{ file.Path.split('/').pop() }}</span
      ><small v-if="file.OldPath">from {{ file.OldPath }}</small
      ><small v-else-if="showDirectory && file.Path.includes('/')"
        >{{ file.Path.slice(0, file.Path.lastIndexOf('/')) }}/</small
      ></span>
    <span class="file-change-stats">
      <span class="file-delta"
        ><template v-if="file.Binary">binary</template
        ><template v-else>
          <span class="delta-add">+{{ file.Insertions }}</span
          ><span class="delta-del">−{{ file.Deletions }}</span>
        </template></span
      >
      <DiffBar v-if="!file.Binary" :additions="file.Insertions" :deletions="file.Deletions" />
    </span>
  </button>
</template>
