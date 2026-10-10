<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  loadMaintainerNote,
  maintainerNoteKey,
  retryMaintainerNote,
  saveMaintainerNote,
} from './maintainerNotes'
const props = defineProps<{ repository: string; number: number; host?: string }>()
const key = computed(() => maintainerNoteKey(props.repository, props.number, props.host))
const note = computed(() => loadMaintainerNote(key.value))
const expanded = ref(false)
const text = computed({
  get: () => note.value.text,
  set: (value) => saveMaintainerNote(key.value, value),
})
const excerpt = computed(
  () =>
    note.value.text
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? '',
)
</script>
<template>
  <section class="maintainer-notes" aria-label="Maintainer notes">
    <details :open="expanded" @toggle="expanded = ($event.target as HTMLDetailsElement).open">
      <summary>
        <span class="notes-heading"
          ><strong>Maintainer notes</strong
          ><span class="notes-badge" :class="{ unsaved: !!note.error }">{{
            note.error ? 'Not saved' : 'Local only'
          }}</span
          ><span aria-hidden="true">{{ expanded ? '▾' : '▸' }}</span></span
        >
        <span v-if="!expanded && excerpt" class="notes-excerpt">{{ excerpt }}</span>
      </summary>
      <p class="notes-help">Only in Ichi on this device. Never posted to GitHub.</p>
      <textarea
        v-model="text"
        aria-label="Private maintainer notes"
        :disabled="!note.loaded"
        placeholder="Decisions, follow-ups, release considerations…"
        rows="6"
        spellcheck="true"
      />
      <div v-if="note.error" class="notes-error" role="alert">
        <p>{{ note.error }}</p>
        <button @click="retryMaintainerNote(key)">
          {{ note.loaded ? 'Retry saving' : 'Retry loading' }}
        </button>
      </div>
      <p v-else class="notes-status" role="status">
        {{ text ? 'Saved on this device' : 'Autosaves as you type' }}
      </p>
    </details>
  </section>
</template>
<style scoped>
.maintainer-notes {
  padding: 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-size: 12px;
}
summary {
  list-style: none;
  cursor: pointer;
}
summary::-webkit-details-marker {
  display: none;
}
.notes-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}
.notes-heading strong {
  flex: 1;
}
.notes-badge {
  color: var(--text-mut);
  font-size: 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 5px;
}
.notes-excerpt {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-mut);
  font-size: 11px;
  margin-top: 6px;
}
.notes-help,
.notes-status {
  color: var(--text-mut);
  font-size: 11px;
  line-height: 1.5;
}
.notes-help {
  margin: 12px 0 8px;
}
.notes-status {
  margin: 8px 0 0;
}
textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 130px;
  max-height: 500px;
  resize: vertical;
  padding: 10px;
  border: 1px solid var(--comment-border);
  border-radius: 6px;
  color: var(--text);
  background: var(--surface-input);
  font: 12px/1.65 var(--font-mono);
}
.notes-error,
.unsaved {
  color: var(--negative-text);
}
.notes-error p {
  font-size: 11px;
  line-height: 1.5;
}
button {
  font: inherit;
  color: var(--text);
  background: var(--surface-input);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 5px 8px;
  cursor: pointer;
}
</style>
