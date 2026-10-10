<script setup lang="ts">
import PersonName from '../people/PersonName.vue'
import { provideProfileRemote } from '../people/profile'
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { Browser } from '@wailsio/runtime'
import {
  IssueService,
  RepoService,
  type PRProviderStatus,
} from '../../bindings/github.com/atterpac/ichi/desktop/services'
import type { Issue } from '../../bindings/github.com/atterpac/ichi/internal/remote'
import { setModeline, resetModeline } from '../../composables/useModeline'
import { notify } from '../../composables/useToasts'
import { isEditable } from '../../composables/keyboard'
import UiButton from '../common/UiButton.vue'
import UiInput from '../common/UiInput.vue'
import SurfaceState from '../common/SurfaceState.vue'
import PaneSplitter from '../common/PaneSplitter.vue'
import MarkdownBody from '../pr/MarkdownBody.vue'

import RemoteToolbar from '../remote/RemoteToolbar.vue'
import StateFilters from '../remote/StateFilters.vue'
import ItemRail from '../remote/ItemRail.vue'
import TimelineItem from '../remote/TimelineItem.vue'
import ActivityIdentity from '../remote/ActivityIdentity.vue'
import { activityTime } from '../remote/activityTime'
import CommentActions from '../remote/CommentActions.vue'
import CommentComposer from '../remote/CommentComposer.vue'
import { provideConversation } from '../remote/conversationContext'
import { readDraft, writeDraft } from '../remote/conversationDrafts'
import InboxControls from '../remote/InboxControls.vue'
import InboxWorkbench from '../remote/InboxWorkbench.vue'
import { issueItem } from '../remote/inbox'

const props = defineProps<{ initialAuthor?: string; initialRemote?: string }>()
const remotes = ref<string[]>([])
const remoteName = ref('')
provideProfileRemote(() => remoteName.value)
const connection = shallowRef<PRProviderStatus | null>(null)
const issues = shallowRef<Issue[]>([])
const selected = shallowRef<Issue | null>(null)
const query = ref('')
const state = ref(props.initialAuthor ? 'all' : 'open')
const limit = ref(50)
const scope = ref('all')
const sort = ref('updated-desc')
const previewNumber = ref(0)
const inbox = ref<InstanceType<typeof InboxWorkbench>>()
const inboxScroll = ref(0)
const inboxItems = computed(() => issues.value.map(issueItem))
const busy = ref(true)
const error = ref('')
const detailBusy = ref(false)
const detailError = ref('')
const width = ref(280)
const listVisible = ref(false)
const authorFilter = ref(props.initialAuthor || '')
const labelFilter = ref('')
const assigneeFilter = ref('')
const conversation = provideConversation(
  () => ({
    remote: remoteName.value,
    repo: connection.value?.Repo || '',
    number: selected.value?.Number || 0,
    kind: 'issue',
    login: connection.value?.Login || '',
  }),
  refreshConversation,
)
async function refreshConversation() {
  const number = selected.value?.Number,
    remote = remoteName.value
  if (!number) return
  try {
    const value = await IssueService.Get(remote, number)
    if (selected.value?.Number === number && remoteName.value === remote) {
      if (value) selected.value = value
      detailError.value = ''
    }
  } catch (e) {
    if (selected.value?.Number === number && remoteName.value === remote) {
      detailError.value = message(e)
      notify({ tone: 'danger', title: 'Saved on GitHub; refresh failed', message: message(e) })
    }
  }
}
function quoteReply(body: string) {
  const key = conversation.key.value + ':comment'
  writeDraft(
    key,
    [
      readDraft(key),
      body
        .split('\n')
        .map((line) => '> ' + line)
        .join('\n'),
      '',
    ]
      .filter(Boolean)
      .join('\n\n') + '\n\n',
  )
  void nextTick(() => main.value?.querySelector<HTMLElement>('.general-composer textarea')?.focus())
}
const railItems = computed(() =>
  issues.value.map((i) => ({ number: i.Number, title: i.Title, author: i.Author, state: i.State })),
)
function selectFromList(number: number) {
  const issue = issues.value.find((i) => i.Number === number)
  if (issue) void selectIssue(issue)
  if (window.matchMedia?.('(max-width:1100px)').matches) listVisible.value = false
}
function applyFilters(value: { author: string; label: string; assignee: string }) {
  authorFilter.value = value.author
  labelFilter.value = value.label
  assigneeFilter.value = value.assignee
  search()
}
const searchQuery = computed(() =>
  [
    query.value,
    scope.value === 'mine' && `author:${connection.value?.Login || '@me'}`,
    scope.value === 'attention' && `assignee:${connection.value?.Login || '@me'}`,
    `sort:${sort.value}`,
    authorFilter.value && `author:${authorFilter.value}`,
    labelFilter.value && `label:${JSON.stringify(labelFilter.value)}`,
    assigneeFilter.value && `assignee:${assigneeFilter.value}`,
  ]
    .filter(Boolean)
    .join(' '),
)
const main = ref<HTMLElement>()
const inspector = ref<HTMLElement>()
let alive = true
let generation = 0
let detailGeneration = 0
const pending = new Set<{ cancel?: () => void }>()
function track<T>(promise: Promise<T> & { cancel?: () => void }): Promise<T> {
  pending.add(promise)
  return promise.finally(() => pending.delete(promise))
}
function cancelReads() {
  for (const task of pending) task.cancel?.()
  pending.clear()
}
function message(e: unknown) {
  return e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e)
}
const repoUrl = computed(() =>
  connection.value?.Repo ? `https://github.com/${connection.value.Repo}` : '',
)
const markdownBase = computed(() => `${repoUrl.value}/blob/HEAD/`)
function date(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
async function openURL(value: string) {
  try {
    if (new URL(value).protocol === 'https:') await Browser.OpenURL(value)
  } catch (e) {
    notify({ tone: 'danger', title: 'Unable to open link', message: message(e) })
  }
}
function back() {
  if (selected.value) {
    previewNumber.value = selected.value.Number
    void nextTick(() => inbox.value?.focus())
  }
  detailGeneration++
  selected.value = null
  detailBusy.value = false
  detailError.value = ''
}
async function loadList() {
  const version = ++generation
  back()
  cancelReads()
  busy.value = true
  error.value = ''
  issues.value = []
  try {
    if (!remoteName.value) return
    const status = await track(IssueService.ProviderStatus(remoteName.value))
    if (!alive || version !== generation) return
    connection.value = status
    if (!status) throw new Error('GitHub connection unavailable')
    if (status.Provider !== 'github')
      throw new Error('Issues are currently supported for GitHub remotes.')
    if (!status.Ready) return
    const result = await track(
      IssueService.List(remoteName.value, state.value, searchQuery.value, limit.value),
    )
    if (alive && version === generation) issues.value = result
  } catch (e) {
    if (alive && version === generation) error.value = message(e)
  } finally {
    if (alive && version === generation) busy.value = false
  }
}
async function selectIssue(issue: Issue) {
  const version = ++detailGeneration
  selected.value = issue
  void nextTick(() => {
    if (main.value) {
      main.value.scrollTop = 0
      main.value.focus()
    }
  })
  detailBusy.value = true
  detailError.value = ''
  try {
    const result = await track(IssueService.Get(remoteName.value, issue.Number))
    if (!alive || version !== detailGeneration) return
    if (!result) throw new Error('Issue unavailable or inaccessible')
    selected.value = result
  } catch (e) {
    if (alive && version === detailGeneration) detailError.value = message(e)
  } finally {
    if (alive && version === detailGeneration) detailBusy.value = false
  }
}
function search() {
  inboxScroll.value = 0
  previewNumber.value = 0
  limit.value = 50
  void loadList()
}
function more() {
  limit.value = Math.min(500, limit.value + 50)
  void loadList()
}
function refresh() {
  if (selected.value) void selectIssue(selected.value)
  else if (!remotes.value.length) void initialize()
  else void loadList()
}
function onKey(event: KeyboardEvent) {
  if (isEditable(event.target)) return
  if (event.key === 'Escape' && selected.value) {
    event.preventDefault()
    event.stopPropagation()
    back()
  }
  if (event.key === 'F6' && selected.value) {
    event.preventDefault()
    ;(inspector.value?.contains(document.activeElement) ? main.value : inspector.value)?.focus()
  }
}
async function initialize() {
  busy.value = true
  error.value = ''
  try {
    const names = await track(RepoService.ListRemotes())
    if (!alive) return
    remotes.value = names
    const preferred =
      props.initialRemote && names.includes(props.initialRemote)
        ? props.initialRemote
        : names.includes('origin')
          ? 'origin'
          : (names[0] ?? '')
    if (remoteName.value !== preferred) remoteName.value = preferred
    else await loadList()
  } catch (e) {
    if (alive) {
      error.value = message(e)
      busy.value = false
    }
  }
}
watch(remoteName, () => {
  inboxScroll.value = 0
  previewNumber.value = 0
  connection.value = null
  limit.value = 50
  void loadList()
})
watch([state, scope, sort], search)
onMounted(() => {
  listVisible.value = window.matchMedia?.('(min-width:1101px)').matches ?? false
  setModeline({ mode: 'ISSUES', hints: 'Esc issue list · F6 switch pane' })
  void initialize()
})
onUnmounted(() => {
  alive = false
  generation++
  detailGeneration++
  cancelReads()
  resetModeline()
})
</script>

<template>
  <section class="issues-view" @keydown="onKey">
    <RemoteToolbar
      title="Issues"
      :repo="connection?.Repo"
      :remotes="remotes"
      v-model:remote="remoteName"
      :selected="!!selected"
      :list-visible="listVisible"
      :busy="busy || detailBusy"
      @toggle="listVisible = !listVisible"
      @back="back"
      @refresh="refresh"
    />
    <SurfaceState
      v-if="error"
      tone="error"
      title="Could not load issues"
      :message="error"
      action-label="Retry"
      @action="refresh"
    />
    <SurfaceState
      v-else-if="!busy && !remotes.length"
      title="No remote configured"
      message="Add a GitHub remote to browse issues for this repository."
    />
    <div v-else-if="connection && !connection.Ready" class="connect">
      <SurfaceState title="Connect GitHub CLI" :message="connection.Message" />
      <p>Ichi uses your existing GitHub CLI account. Sign in from a terminal:</p>
      <code>gh auth login --hostname github.com</code>
      <p><UiButton @click="loadList">Check connection</UiButton></p>
    </div>
    <template v-else-if="!selected">
      <InboxControls v-model:scope="scope" v-model:sort="sort" kind="issue">
        <form class="inbox-search issue-filters" @submit.prevent="search">
          <UiInput v-model="query" aria-label="Search issues" placeholder="Search issues…" />
          <UiButton type="submit" size="sm" :disabled="busy">Search</UiButton>
        </form>
        <StateFilters
          compact
          v-model="state"
          :states="['open', 'closed', 'all']"
          :count="issues.length"
          label="Issue state"
          :author="authorFilter"
          :label-filter="labelFilter"
          :assignee="assigneeFilter"
          :busy="busy"
          @filter="applyFilters"
        />
      </InboxControls>
      <SurfaceState v-if="busy" tone="loading" title="Loading issues…" />
      <InboxWorkbench
        v-else
        ref="inbox"
        v-model="previewNumber"
        :items="inboxItems"
        kind="issue"
        :repo-url="repoUrl"
        :scroll="inboxScroll"
        @scroll="inboxScroll = $event"
        @open="selectFromList"
        @link="openURL"
      >
        <UiButton v-if="issues.length >= limit && limit < 500" class="load-more" @click="more"
          >Load more</UiButton
        >
        <p v-if="issues.length >= 500" class="muted result-count">
          Showing up to 500 issues. Narrow your search to find more.
        </p>
      </InboxWorkbench>
    </template>
    <div v-else class="issue-detail">
      <ItemRail
        v-if="listVisible"
        title="Issues"
        :items="railItems"
        :selected="selected.Number"
        @select="selectFromList"
        @close="listVisible = false"
        @back="back"
      />
      <main ref="main" class="conversation" tabindex="-1" aria-label="Issue conversation">
        <div class="issue-heading">
          <span class="badge" :class="selected.State">{{ selected.State }}</span>
          <span class="muted">#{{ selected.Number }}</span>
          <h1>{{ selected.Title }}</h1>
          <p class="muted">
            <PersonName :name="selected.Author" :login="selected.Author" /> opened this issue on
            {{ date(selected.CreatedAt) }}
          </p>
        </div>
        <article class="comment issue-description">
          <header>
            <ActivityIdentity :author="selected.Author" /><span class="muted">Description</span>
          </header>
          <MarkdownBody
            v-if="selected.Body"
            :body="selected.Body"
            :repo-url="repoUrl"
            :base-url="markdownBase"
            @open="openURL"
          />
          <p v-else class="muted">No description provided.</p>
          <CommentActions
            v-if="selected.NodeID"
            :comment="{
              ID: selected.NodeID,
              Body: selected.Body,
              URL: selected.URL,
              CanUpdate: false,
              CanDelete: false,
              CanReact: selected.CanReact,
              Reactions: selected.Reactions,
            }"
            :repo-url="repoUrl"
            quote
            @quote="quoteReply"
            @open="openURL"
          />
        </article>
        <h2>
          Conversation
          <span v-if="!detailBusy && !detailError" class="muted"
            >· {{ selected.Comments.length }}</span
          >
        </h2>
        <SurfaceState v-if="detailBusy" tone="loading" title="Loading conversation…" />
        <SurfaceState
          v-else-if="detailError"
          tone="error"
          title="Could not load conversation"
          :message="detailError"
          action-label="Retry"
          @action="selectIssue(selected)"
        />
        <template v-else
          ><TimelineItem
            v-for="(comment, index) in selected.Comments"
            :key="comment.ID"
            :first="index === 0"
            :last="index === selected.Comments.length - 1"
            class="issue-timeline-entry"
            ><article class="comment">
              <header>
                <ActivityIdentity :author="comment.Author" :avatar-url="comment.AvatarURL" /><button
                  class="comment-link"
                  :title="date(comment.CreatedAt)"
                  @click="openURL(comment.URL)"
                >
                  {{ activityTime(comment.CreatedAt) }} ↗
                </button>
              </header>
              <MarkdownBody
                :body="comment.Body"
                :repo-url="repoUrl"
                :base-url="markdownBase"
                @open="openURL"
              />
              <CommentActions
                :comment="comment"
                :repo-url="repoUrl"
                quote
                @quote="quoteReply"
                @open="openURL"
              /></article
          ></TimelineItem>
          <p v-if="!selected.Comments.length" class="muted">No comments yet.</p></template
        >
        <CommentComposer
          v-if="!detailBusy && !detailError"
          class="general-composer"
          :draft-key="conversation.key.value + ':comment'"
          :submit="(Body) => conversation.act({ Action: 'comment', Body })"
          label="Post comment"
          :disabled="conversation.busy.value"
          :repo-url="repoUrl"
          @open="openURL"
        />
      </main>
      <aside
        ref="inspector"
        :style="{ width: `${width}px` }"
        tabindex="-1"
        aria-label="Issue details"
      >
        <PaneSplitter
          v-model="width"
          side="left"
          :min="260"
          :max="500"
          label="Resize issue details"
        />
        <div class="metadata">
          <span class="badge" :class="selected.State">{{ selected.State }}</span
          ><span v-if="selected.StateReason" class="muted">
            {{ selected.StateReason.toLowerCase().replace(/_/g, ' ') }}</span
          >
          <section v-if="selected.Assignees.length">
            <h3>Assignees</h3>
            <p>{{ selected.Assignees.join(', ') || 'Unassigned' }}</p>
          </section>
          <section v-if="selected.Labels.length">
            <h3>Labels</h3>
            <div v-if="selected.Labels.length" class="labels">
              <span v-for="label in selected.Labels" :key="label" class="badge">{{ label }}</span>
            </div>
            <p v-else class="muted">None</p>
          </section>
          <section v-if="selected.Milestone">
            <h3>Milestone</h3>
            <p>{{ selected.Milestone || 'No milestone' }}</p>
          </section>
          <details class="secondary-details">
            <summary>Details</summary>
            <p v-if="!selected.Assignees.length">Unassigned</p>
            <p v-if="!selected.Labels.length">No labels</p>
            <p v-if="!selected.Milestone">No milestone</p>
            <p>Updated {{ date(selected.UpdatedAt) }}</p>
          </details>
          <UiButton @click="openURL(selected.URL)">Open on GitHub ↗</UiButton>
          <p class="muted">Reply and manage this issue on GitHub. Refresh to load new comments.</p>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.issues-view {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface-panel);
  color: var(--text);
}
.issue-toolbar,
.issue-filters {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.issue-toolbar label {
  font-size: var(--fs-sm);
  color: var(--text-mut);
}
.refresh {
  margin-left: auto;
}
select {
  color: var(--text);
  background: var(--surface-input);
  border: 1px solid var(--border);
  padding: 6px 8px;
  border-radius: 5px;
  font: inherit;
}
.issue-filters > :first-child {
  flex: 1;
  min-width: 160px;
}
.muted,
small {
  color: var(--text-mut);
}
.connection {
  font-size: var(--fs-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.issue-list {
  overflow: auto;
  min-height: 0;
  flex: 1;
}
.result-count {
  padding: 0 20px;
  font-size: var(--fs-sm);
}
.issue-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  width: 100%;
  padding: 16px 20px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.issue-row:hover {
  background: var(--surface-sidebar);
}
.issue-copy {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 7px;
  overflow-wrap: anywhere;
}
.issue-copy strong {
  font-weight: 550;
}
.issue-indicator {
  padding-top: 2px;
}
.open {
  color: var(--green, #87bb8a);
}
.closed {
  color: var(--accent);
}
.labels {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.badge {
  display: inline-block;
  border: 1px solid var(--border);
  background: var(--surface-sidebar);
  border-radius: 5px;
  padding: 2px 7px;
  font-size: var(--fs-xs);
  overflow-wrap: anywhere;
}
.load-more {
  margin: 16px;
}
.issue-detail {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.conversation {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 24px;
}
h1 {
  font-size: 22px;
  line-height: 1.4;
  margin: 6px 0;
  overflow-wrap: anywhere;
}
h2 {
  font-size: 16px;
  margin: 28px 0 16px;
}
h3 {
  font-size: var(--fs-sm);
  color: var(--text-mut);
  font-weight: 500;
  margin: 0 0 8px;
}
.comment {
  margin: 16px 0;
  overflow: hidden;
}
.comment header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  font-size: var(--fs-sm);
}
.comment-link {
  color: var(--text-mut);
  background: none;
  border: 0;
  cursor: pointer;
  font: inherit;
}
aside {
  position: relative;
  flex-shrink: 0;
  background: var(--surface-sidebar);
  border-left: 1px solid var(--border);
}
.metadata {
  padding: 20px;
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  overflow-wrap: anywhere;
}
.metadata section {
  padding: 18px 0;
  border-bottom: 1px solid var(--border);
}
.metadata p {
  font-size: var(--fs-sm);
  line-height: 1.6;
}
.metadata > button {
  margin-top: 20px;
}
.connect {
  padding: 24px;
}
@media (max-width: 800px) {
  .issue-detail {
    overflow: auto;
    flex-direction: column;
  }
  .conversation {
    overflow: visible;
    flex: none;
    padding: 16px;
  }
  aside {
    width: 100% !important;
    border-left: 0;
    border-top: 1px solid var(--border);
  }
  aside :deep(.pane-splitter) {
    display: none;
  }
  .metadata {
    overflow: visible;
  }
  .connection {
    display: none;
  }
}

.issue-detail {
  position: relative;
}
.conversation > * {
  max-width: 780px;
  margin-left: auto;
  margin-right: auto;
}
.comment {
  margin-top: 8px;
  margin-bottom: 8px;
}
.issue-description {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  margin-top: 24px;
  margin-bottom: 32px;
}
.comment header {
  justify-content: flex-start;
}
.comment-link {
  margin-left: auto;
}
.issue-heading {
  margin-bottom: 24px;
}
.metadata section {
  border: 0;
  padding: 14px 0;
}
.secondary-details {
  margin: 18px 0;
  color: var(--text-mut);
  font-size: var(--fs-sm);
}
.secondary-details summary {
  cursor: pointer;
}
.issue-filters {
  padding-top: 10px;
}

.comment,
.comment:first-of-type {
  background: var(--surface-card);
  border: 1px solid var(--comment-border);
  border-radius: var(--radius-lg);
  padding: 0 20px 20px;
  overflow: hidden;
  box-shadow: 0 2px 5px rgb(0 0 0 / 5%);
  flex-shrink: 0;
}
.comment > header {
  background: var(--comment-header);
  border-bottom: 1px solid var(--border);
  padding: 12px 20px;
  margin: 0 -20px 18px;
  align-items: center;
  min-height: 50px;
}
.comment {
  margin-top: 0;
  margin-bottom: 24px;
}
.issue-description {
  margin-top: 24px;
  margin-bottom: 32px;
}
.issue-timeline-entry {
  margin-bottom: 24px;
  max-width: 812px;
}
</style>
