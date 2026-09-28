<script setup lang="ts">
import { PhArrowRight, PhCheck } from '@phosphor-icons/vue'
import type { Conflict } from './fixtures'
defineProps<{ file: Conflict; canStage: boolean }>()
const emit = defineEmits<{ edit: [value: string]; clear: []; stage: [] }>()
</script>
<template>
  <section class="variant-result">
    <header>
      <div>
        <span class="source-label">YOUR RESOLUTION</span>
        <h3>
          Result
          <span :class="{ green: file.staged }">{{
            file.staged ? 'Staged' : file.choice ? 'Edited · unstaged' : 'Awaiting a decision'
          }}</span>
        </h3>
      </div>
      <button v-if="file.choice" @click="emit('clear')">Reset result</button>
    </header>
    <div
      v-if="file.kind === 'deleted' && file.choice === 'delete'"
      class="variant-deleted resolved"
    >
      <PhCheck :size="24" /> This file will remain deleted.
    </div>
    <textarea
      v-else
      :value="file.result"
      aria-label="Resolved file contents"
      spellcheck="false"
      placeholder="Choose a source version or write your resolution here…"
      @input="emit('edit', ($event.target as HTMLTextAreaElement).value)"
    />
    <footer>
      <span>{{
        file.staged
          ? 'Editing this result will unstage the file.'
          : 'Review your result, then stage it to move on.'
      }}</span
      ><button class="primary" :disabled="!canStage" @click="emit('stage')">
        <PhCheck :size="14" /> Save and stage <PhArrowRight :size="14" />
      </button>
    </footer>
  </section>
</template>
