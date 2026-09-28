<script setup lang="ts">
import type { Conflict } from './fixtures'
defineProps<{ file: Conflict; side: 'main' | 'commit' | 'base' }>()
const emit = defineEmits<{ choose: [choice: string] }>()
</script>
<template>
  <section class="variant-source" :class="side">
    <header>
      <div>
        <span class="source-label">{{
          side === 'main'
            ? 'TARGET BRANCH'
            : side === 'commit'
              ? 'REPLAYED COMMIT'
              : 'COMMON ANCESTOR'
        }}</span>
        <h4>
          {{
            side === 'main'
              ? 'main'
              : side === 'commit'
                ? 'c72f8a6 · Persist sessions'
                : 'Before either change'
          }}
        </h4>
      </div>
      <button
        v-if="side !== 'base'"
        :aria-pressed="file.choice === side || (side === 'main' && file.choice === 'delete')"
        @click="emit('choose', side === 'main' && file.kind === 'deleted' ? 'delete' : side)"
      >
        {{
          side === 'main'
            ? file.kind === 'deleted'
              ? 'Keep deletion'
              : 'Use main'
            : file.kind === 'deleted'
              ? 'Keep file'
              : 'Use commit'
        }}
      </button>
    </header>
    <div v-if="side === 'main' && file.kind === 'deleted'" class="variant-deleted">
      File removed on main.<small>The storage adapter replaces this module.</small>
    </div>
    <pre
      v-else
    ><code v-for="(line,index) in (side === 'main' ? file.target : side === 'commit' ? file.incoming : file.base).split('\n')" :key="index"><span>{{ index + 1 }}</span>{{ line }}
</code></pre>
  </section>
</template>
