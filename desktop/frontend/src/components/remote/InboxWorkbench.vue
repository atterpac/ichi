<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { InboxItem } from './inbox'
import { activityTime } from './activityTime'
import MarkdownBody from '../pr/MarkdownBody.vue'
import ActivityIdentity from './ActivityIdentity.vue'
import UiButton from '../common/UiButton.vue'
const props = defineProps<{
  items: InboxItem[]
  kind: 'pr' | 'issue'
  modelValue: number
  repoUrl?: string
  scroll?: number
}>()
const emit = defineEmits<{
  'update:modelValue': [number: number]
  open: [number: number]
  scroll: [top: number]
  link: [url: string]
}>()
const rows = ref<HTMLElement>()
const current = computed(
  () => props.items.find((i) => i.number === props.modelValue) ?? props.items[0],
)
watch(
  () => props.items,
  () => {
    if (current.value && current.value.number !== props.modelValue)
      emit('update:modelValue', current.value.number)
  },
  { immediate: true },
)
onMounted(() => {
  if (rows.value) rows.value.scrollTop = props.scroll ?? 0
})
function key(event: KeyboardEvent, index: number) {
  const target =
    event.key === 'ArrowDown'
      ? index + 1
      : event.key === 'ArrowUp'
        ? index - 1
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? props.items.length - 1
            : -1
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const item = props.items[Math.max(0, Math.min(props.items.length - 1, target))]
  if (item) {
    emit('update:modelValue', item.number)
    void nextTick(() =>
      rows.value?.querySelector<HTMLButtonElement>(`[data-number="${item.number}"]`)?.focus(),
    )
  }
}
function focus() {
  rows.value
    ?.querySelector<HTMLButtonElement>(`[data-number="${current.value?.number}"]`)
    ?.focus({ preventScroll: true })
}
defineExpose({ focus })
</script>
<template>
  <div class="inbox-workbench">
    <section class="inbox-results" aria-label="Search results">
      <header class="inbox-caption">
        <span>{{ items.length }} {{ kind === 'pr' ? 'pull requests' : 'issues' }} loaded</span
        ><span>↑ ↓ to select · Enter to open</span>
      </header>
      <div
        ref="rows"
        class="inbox-rows"
        @scroll="emit('scroll', ($event.target as HTMLElement).scrollTop)"
      >
        <button
          v-for="(item, index) in items"
          :key="item.number"
          :class="[
            'inbox-row',
            kind === 'pr' ? 'pr-row' : 'issue-row',
            { active: current?.number === item.number },
          ]"
          :data-number="item.number"
          :data-pr="kind === 'pr' ? item.number : undefined"
          :data-issue="kind === 'issue' ? item.number : undefined"
          :tabindex="current?.number === item.number ? 0 : -1"
          :aria-pressed="current?.number === item.number"
          @click="emit('update:modelValue', item.number)"
          @dblclick="emit('open', item.number)"
          @keydown="key($event, index)"
          @keydown.enter.prevent="emit('open', item.number)"
        >
          <span
            class="row-state"
            :class="item.state"
            :title="item.state"
            :aria-label="item.state"
            >{{ item.state === 'open' ? '◉' : item.state === 'draft' ? '◌' : '✓' }}</span
          >
          <span class="row-copy"
            ><strong>{{ item.title }}</strong
            ><small
              >#{{ item.number }} · {{ item.author
              }}<span v-for="label in item.labels.slice(0, 2)" :key="label" class="row-label">{{
                label
              }}</span
              ><span v-if="item.labels.length > 2" :title="item.labels.slice(2).join(', ')"
                >+{{ item.labels.length - 2 }}</span
              ></small
            ></span
          >
          <span class="row-signal" :class="{ attention: item.danger }"
            ><span>{{ item.signal }}</span
            ><small v-if="item.checks">{{ item.checks }}</small
            ><small
              v-if="kind === 'pr' && item.triage?.ThreadsKnown && item.triage.UnresolvedThreads"
              >{{ item.triage.UnresolvedThreads }} unresolved</small
            ></span
          >
          <span class="row-activity"
            ><time :title="item.updated">{{ activityTime(item.updated) }}</time
            ><small>{{
              item.triage?.Known ? `${item.triage.CommentCount} comments` : 'Activity unavailable'
            }}</small></span
          >
        </button>
        <div v-if="!items.length" class="empty-inbox">
          <strong>No matching {{ kind === 'pr' ? 'pull requests' : 'issues' }}</strong>
          <p>Try All, another state, or a broader search.</p>
        </div>
        <slot />
      </div>
    </section>
    <aside v-if="current" class="inbox-preview" aria-label="Selection preview">
      <header>
        <span class="preview-eyebrow">{{ current.state }} · #{{ current.number }}</span>
        <h2>{{ current.title }}</h2>
        <ActivityIdentity :author="current.author" />
        <p v-if="current.context" class="preview-context">{{ current.context }}</p>
        <UiButton class="inbox-open" @click="emit('open', current.number)"
          >{{ kind === 'pr' ? 'Review files' : 'Open conversation' }} →</UiButton
        >
      </header>
      <div class="preview-body" :key="current.number">
        <div class="preview-summary">
          <span :class="{ attention: current.danger }">{{ current.signal }}</span
          ><span v-if="current.checks">{{ current.checks }}</span
          ><span v-if="kind === 'pr'">{{
            current.triage?.ThreadsKnown
              ? `${current.triage.UnresolvedThreads} unresolved threads`
              : 'Thread status unavailable'
          }}</span>
        </div>
        <h3>Description</h3>
        <MarkdownBody
          v-if="current.body"
          :body="current.body"
          :repo-url="repoUrl"
          :base-url="repoUrl ? `${repoUrl}/blob/HEAD/` : undefined"
          @open="emit('link', $event)"
        />
        <p v-else class="muted">No description provided.</p>
        <h3>
          Recent conversation
          <span v-if="current.triage?.Known">· {{ current.triage.CommentCount }}</span>
        </h3>
        <template v-if="current.triage?.Known"
          ><article
            v-for="comment in current.triage.RecentComments"
            :key="comment.ID"
            class="preview-comment"
          >
            <ActivityIdentity :author="comment.Author" :avatar-url="comment.AvatarURL" /><time>{{
              activityTime(comment.CreatedAt)
            }}</time
            ><MarkdownBody :body="comment.Body" :repo-url="repoUrl" @open="emit('link', $event)" />
          </article>
          <p v-if="!current.triage.RecentComments.length" class="muted">
            No comments yet.
          </p></template
        >
        <p v-else class="muted">
          Activity couldn't be loaded. Open the {{ kind === 'pr' ? 'pull request' : 'issue' }} to
          retry.
        </p>
      </div>
    </aside>
  </div>
</template>
<style scoped>
.inbox-workbench {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(290px, 34%);
  flex: 1;
  min-height: 0;
  overflow: hidden;
  color: var(--text);
}
.inbox-results {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--surface-panel);
}
.inbox-caption {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  font-size: 11px;
  color: var(--text-mut);
  border-bottom: 1px solid var(--border);
}
.inbox-rows {
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.inbox-row {
  width: 100%;
  display: grid;
  grid-template-columns: 18px minmax(140px, 1fr) minmax(100px, 150px) 100px;
  gap: 12px;
  align-items: center;
  text-align: left;
  padding: 12px 20px;
  border: 0;
  border-radius: 0;
  border-bottom: 1px solid var(--border);
  border-left: 3px solid transparent;
  background: transparent;
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.inbox-row:hover {
  background: var(--hover);
}
.inbox-row.active {
  background: var(--selected);
  border-left-color: var(--accent);
}
.row-copy {
  min-width: 0;
}
.row-copy strong {
  display: block;
  font-size: 13px;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.row-copy small {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 5px;
}
small,
.row-activity,
.preview-context,
.muted {
  color: var(--text-mut);
  font-size: 11px;
}
.row-label {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0 5px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-signal,
.row-activity {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.row-activity {
  text-align: right;
}
.row-state {
  color: var(--text-mut);
}
.row-state.open {
  color: var(--accent);
}
.attention {
  color: var(--negative-text);
}
.inbox-preview {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--border);
  background: var(--surface-sidebar);
}
.inbox-preview > header {
  padding: 20px;
  border-bottom: 1px solid var(--border);
}
.preview-eyebrow {
  color: var(--text-mut);
  font-size: 11px;
  text-transform: capitalize;
}
h2 {
  font-size: 17px;
  line-height: 1.45;
  margin: 8px 0 14px;
  overflow-wrap: anywhere;
}
.preview-context {
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.inbox-open {
  margin-top: 12px;
}
.preview-body {
  overflow: auto;
  padding: 20px;
  flex: 1;
  min-height: 0;
}
.preview-summary {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  margin-bottom: 24px;
}
.preview-summary span + span:before {
  content: '·';
  margin-right: 8px;
  color: var(--text-mut);
}
h3 {
  font-size: 12px;
  margin: 24px 0 12px;
}
h3:first-of-type {
  margin-top: 0;
}
.preview-comment {
  padding: 14px;
  background: var(--surface-card);
  border: 1px solid var(--comment-border);
  border-radius: 8px;
  margin-bottom: 12px;
}
.preview-comment time {
  display: block;
  color: var(--text-mut);
  font-size: 11px;
  margin: 6px 0 12px;
}
.preview-body :deep(.markdown-body) {
  font-size: 12px;
}
.empty-inbox {
  padding: 40px 20px;
  color: var(--text-mut);
}
@media (max-width: 1150px) {
  .inbox-row {
    grid-template-columns: 16px minmax(100px, 1fr) 95px;
    padding: 14px 12px;
    gap: 8px;
  }
  .row-activity {
    grid-column: 2 / -1;
    flex-direction: row;
    text-align: left;
  }
  .inbox-caption > span:last-child {
    display: none;
  }
}
@media (max-width: 760px) {
  .inbox-workbench {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(180px, 45%) minmax(0, 1fr);
  }
  .inbox-preview {
    display: block;
    overflow: auto;
    border-left: 0;
    border-top: 1px solid var(--border);
  }
  .inbox-preview > header {
    padding: 12px 16px;
  }
  .preview-body {
    overflow: visible;
    padding: 16px;
  }
}
</style>
