<script setup lang="ts">
import { ref } from 'vue'
import { PhCheck, PhWarningCircle, PhArrowRight, PhFileCode } from '@phosphor-icons/vue'
import type { Conflict } from './fixtures'
import ConflictSource from './ConflictSource.vue'
import ConflictResult from './ConflictResult.vue'
defineProps<{
  design: 'focus' | 'inline' | 'board'
  file: Conflict
  files: Conflict[]
  selected: number
  canStage: boolean
}>()
const emit = defineEmits<{
  choose: [choice: string]
  edit: [value: string]
  clear: []
  stage: []
  select: [index: number]
}>()
const reference = ref<'main' | 'commit' | 'base'>('main')
const baseVisible = ref(false)
</script>
<template>
  <section class="conflict-alternative" :class="`variant-${design}`">
    <div v-if="design === 'board'" class="resolution-board" aria-label="Resolution board">
      <button
        v-for="(f, index) in files"
        :key="f.path"
        class="resolution-card"
        :class="{ staged: f.staged }"
        :aria-current="selected === index ? 'true' : undefined"
        @click="emit('select', index)"
      >
        <div class="board-status">
          <span>{{ f.staged ? 'STAGED' : f.choice ? 'READY FOR REVIEW' : 'NEEDS A DECISION' }}</span
          ><PhCheck v-if="f.staged" :size="18" /><PhWarningCircle v-else :size="18" />
        </div>
        <h3>{{ f.path.split('/').pop() }}</h3>
        <p>
          {{
            f.kind === 'deleted'
              ? 'Deleted on main · modified in commit'
              : 'Both versions changed this file'
          }}
        </p>
        <div class="board-action">
          {{ f.staged ? 'Review resolution' : 'Open conflict' }} <PhArrowRight :size="14" />
        </div>
      </button>
    </div>
    <header class="variant-file-heading">
      <div>
        <span class="source-label">{{
          design === 'focus'
            ? 'WRITE THE VERSION YOU WANT TO KEEP'
            : design === 'inline'
              ? 'ONE DECISION, IN CONTEXT'
              : `FILE ${selected + 1} OF ${files.length}`
        }}</span>
        <h3><PhFileCode :size="16" /> {{ file.path }}</h3>
        <p>{{ file.note }}</p>
      </div>
      <button v-if="file.kind === 'text'" @click="emit('choose', 'combined')">
        {{ selected === 0 ? 'Combine changes' : 'Keep both tests' }}
      </button>
    </header>
    <div v-if="design === 'focus'" class="focus-layout">
      <ConflictResult
        :file="file"
        :can-stage="canStage"
        @edit="emit('edit', $event)"
        @clear="emit('clear')"
        @stage="emit('stage')"
      />
      <aside class="reference-column">
        <div class="reference-heading">
          <h4>Reference versions</h4>
          <span>Read → choose → refine</span>
        </div>
        <nav aria-label="Reference version">
          <button
            v-for="side in ['main', 'commit', 'base'] as const"
            :key="side"
            :aria-pressed="reference === side"
            @click="reference = side"
          >
            {{ side === 'main' ? 'main' : side === 'commit' ? 'Replayed commit' : 'Base' }}
          </button>
        </nav>
        <ConflictSource :file="file" :side="reference" @choose="emit('choose', $event)" />
        <div class="reference-explanation">
          <span class="source-label">RESOLUTION NOTE</span>
          <p>
            {{
              file.kind === 'deleted'
                ? 'Decide whether the legacy module still belongs in this branch. You can preserve its changes or keep the deletion.'
                : 'Selecting a version replaces the result. You can then edit it directly, or combine the sample changes.'
            }}
          </p>
          <span class="reference-key">{{
            file.staged ? '✓ Staged for this rebase' : '○ This file still needs staging'
          }}</span>
        </div>
      </aside>
    </div>
    <div v-else-if="design === 'inline'" class="inline-document">
      <div class="document-context">
        <span>CONFLICT 1 / 1</span>
        <p>
          {{
            file.kind === 'deleted'
              ? 'A deletion and an edit compete for the same file.'
              : 'Two changes meet at the same point. Compare their intent before choosing.'
          }}
        </p>
        <button :aria-expanded="baseVisible" @click="baseVisible = !baseVisible">
          {{ baseVisible ? 'Hide common ancestor' : 'Show common ancestor' }}
        </button>
      </div>
      <ConflictSource
        v-if="baseVisible"
        :file="file"
        side="base"
        @choose="emit('choose', $event)"
      />
      <div class="inline-choice">
        <span class="inline-letter">A</span
        ><ConflictSource :file="file" side="main" @choose="emit('choose', $event)" />
      </div>
      <div class="inline-choice">
        <span class="inline-letter">B</span
        ><ConflictSource :file="file" side="commit" @choose="emit('choose', $event)" />
      </div>
      <div class="inline-result-divider"><span /><b>RESOLVED VERSION</b><span /></div>
      <ConflictResult
        :file="file"
        :can-stage="canStage"
        @edit="emit('edit', $event)"
        @clear="emit('clear')"
        @stage="emit('stage')"
      />
    </div>
    <div v-else class="board-detail">
      <div class="board-sources">
        <ConflictSource :file="file" side="main" @choose="emit('choose', $event)" /><ConflictSource
          :file="file"
          side="commit"
          @choose="emit('choose', $event)"
        />
        <details>
          <summary>Common ancestor</summary>
          <pre>{{ file.base }}</pre>
        </details>
      </div>
      <ConflictResult
        :file="file"
        :can-stage="canStage"
        @edit="emit('edit', $event)"
        @clear="emit('clear')"
        @stage="emit('stage')"
      />
    </div>
  </section>
</template>
