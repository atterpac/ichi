<script setup lang="ts">
import PersonName from '../people/PersonName.vue'
import { provideProfileRemote } from '../people/profile'
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { Browser } from '@wailsio/runtime'
import { PRService, RepoService } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import type { PRProviderStatus } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import {
  PRState,
  type PullRequest,
  type Discussion,
  type Check,
  type ReviewThread as Thread,
} from '../../bindings/github.com/atterpac/ichi/internal/remote'
import { LineType, type FileDiff } from '../../bindings/github.com/atterpac/ichi/internal/git'
import { setModeline, resetModeline } from '../../composables/useModeline'
import { countLabel } from '../../composables/countLabel'
import { notify } from '../../composables/useToasts'
import { isEditable } from '../../composables/keyboard'
import UiButton from '../common/UiButton.vue'
import UiInput from '../common/UiInput.vue'
import SurfaceState from '../common/SurfaceState.vue'
import PaneSplitter from '../common/PaneSplitter.vue'
import DiffView from '../diff/DiffView.vue'
import ReviewThread from './ReviewThread.vue'
import ReviewDraftPanel from './ReviewDraftPanel.vue'
import MaintainerNotes from './MaintainerNotes.vue'
import MarkdownBody from './MarkdownBody.vue'

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
import { prItem } from '../remote/inbox'

let openedInitial = false
const props = defineProps<{
  focusBranch?: string
  initialAuthor?: string
  initialReviewer?: string
  initialRemote?: string
  initialNumber?: number
}>()
const remotes = ref<string[]>([])
const remoteName = ref('')
provideProfileRemote(() => remoteName.value)
const connection = shallowRef<PRProviderStatus | null>(null)
const list = shallowRef<PullRequest[]>([])
const listBusy = ref(true)
const listError = ref('')
const query = ref(
  props.initialReviewer ? `reviewed-by:${props.initialReviewer}` : (props.focusBranch ?? ''),
)
const state = ref(props.initialAuthor || props.initialReviewer ? PRState.PRAll : PRState.PROpen)
const limit = ref(50)
const scope = ref('all')
const sort = ref('updated-desc')
const previewNumber = ref(0)
const inbox = ref<InstanceType<typeof InboxWorkbench>>()
const inboxScroll = ref(0)
const inboxItems = computed(() => list.value.map(prItem))
const selected = shallowRef<PullRequest | null>(null)
const discussion = shallowRef<Discussion | null>(null)
const checks = shallowRef<Check[]>([])
const patches = shallowRef<(FileDiff | null)[]>([])
const detailBusy = ref(false)
const discussionError = ref('')
const checksError = ref('')
const checksBusy = ref(false)
const checksExpanded = ref(false)
const detailError = ref('')
const patchError = ref('')
const patchBusy = ref(false)
const patchesLoaded = ref(false)
const metadataReady = ref(false)
const tab = ref<'conversation' | 'files'>('files')
const threadFilter = ref('all')
const filePath = ref('')
const fileQuery = ref('')
const width = ref(320)
const listVisible = ref(false)
const authorFilter = ref(props.initialAuthor || '')
const labelFilter = ref('')
const conversation = provideConversation(
  () => ({
    remote: remoteName.value,
    repo: connection.value?.Repo || '',
    number: selected.value?.Number || 0,
    kind: 'pr',
    login: connection.value?.Login || '',
  }),
  refreshConversation,
)
async function refreshConversation() {
  const number = selected.value?.Number,
    remote = remoteName.value
  if (!number) return
  try {
    const value = await PRService.GetDiscussion(remote, number)
    if (selected.value?.Number === number && remoteName.value === remote) {
      discussion.value = value
      discussionError.value = ''
    }
  } catch (e) {
    if (selected.value?.Number === number && remoteName.value === remote) {
      discussionError.value = message(e)
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
const commentTarget = ref<{ path: string; line: number; side: string } | null>(null)
function startInlineComment(target: { path: string; line: number; side: string }) {
  commentTarget.value = target
  void nextTick(() =>
    inspector.value?.querySelector<HTMLElement>('.review-draft-panel textarea')?.focus(),
  )
}
const railItems = computed(() =>
  visible.value.map((pr) => ({
    number: pr.Number,
    title: pr.Title,
    author: pr.Author.Login,
    state: pr.Draft ? 'draft' : pr.State,
  })),
)
function selectFromList(number: number) {
  const pr = list.value.find((p) => p.Number === number)
  if (pr) void selectPR(pr)
  if (window.matchMedia?.('(max-width:1100px)').matches) listVisible.value = false
}
function applyFilters(value: { author: string; label: string }) {
  authorFilter.value = value.author
  labelFilter.value = value.label
  search()
}
const reviewSummary = computed(() => {
  const latest = new Map<string, string>()
  for (const r of [...(discussion.value?.Reviews ?? [])].sort((a, b) =>
    a.CreatedAt.localeCompare(b.CreatedAt),
  )) {
    if (r.State !== 'COMMENTED' && r.State !== 'PENDING') latest.set(r.Author, r.State)
  }
  const states = [...latest.values()]
  return states.includes('CHANGES_REQUESTED')
    ? 'Changes requested'
    : states.includes('APPROVED')
      ? 'Approved'
      : 'Awaiting review'
})
function fileThreadCount(path: string) {
  return discussion.value?.Threads.filter((t) => t.Path === path && !t.Resolved).length ?? 0
}
function showFileThreads(path: string) {
  threadFilter.value = 'unresolved'
  selectFile(path)
  void nextTick(() =>
    inspector.value
      ?.querySelector<HTMLElement>('.file-review-threads')
      ?.scrollIntoView({ block: 'start' }),
  )
}
const diffView = ref<InstanceType<typeof DiffView>>()
const main = ref<HTMLElement>()
const inspector = ref<HTMLElement>()
let alive = true
let listVersion = 0
let detailVersion = 0
let patchVersion = 0
const pending = new Set<{ cancel?: () => void }>()
function track<T>(promise: Promise<T> & { cancel?: () => void }): Promise<T> {
  pending.add(promise)
  return promise.finally(() => pending.delete(promise))
}
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : String(error)
}
const checkSummary = computed(() => {
  const total = checks.value.length
  const completed = checks.value.filter(
    (check) => check.Status === 'completed' || !!check.Conclusion,
  ).length
  const passed = checks.value.filter((check) => check.Conclusion === 'success').length
  const failed = checks.value.filter((check) =>
    ['failure', 'timed_out', 'action_required', 'startup_failure'].includes(check.Conclusion),
  ).length
  const skipped = checks.value.filter((check) => check.Conclusion === 'skipped').length
  const cancelled = checks.value.filter((check) => check.Conclusion === 'cancelled').length
  const other = completed - passed - failed - skipped - cancelled
  const pending = total - completed
  const outcomes = [
    [passed, 'passed'],
    [failed, 'failed'],
    [pending, 'pending'],
    [skipped, 'skipped'],
    [cancelled, 'cancelled'],
    [other, 'other outcomes'],
  ]
    .filter(([count]) => Number(count) > 0)
    .map(([count, label]) => `${count} ${label}`)
    .join(' · ')
  return {
    total,
    completed,
    failed,
    percent: total ? Math.round((completed / total) * 100) : 0,
    outcomes,
  }
})
const repoUrl = computed(() =>
  connection.value?.Repo ? `https://github.com/${connection.value.Repo}` : undefined,
)
const markdownBase = computed(() =>
  repoUrl.value ? `${repoUrl.value}/blob/${selected.value?.HeadSHA || 'HEAD'}/` : undefined,
)
const visible = computed(() => list.value)
const searchQuery = computed(() =>
  [
    query.value,
    authorFilter.value && `author:${authorFilter.value}`,
    labelFilter.value && `label:${JSON.stringify(labelFilter.value)}`,
    scope.value === 'mine' && `author:${connection.value?.Login || '@me'}`,
    scope.value === 'attention' && `review-requested:${connection.value?.Login || '@me'}`,
    `sort:${sort.value}`,
  ]
    .filter(Boolean)
    .join(' '),
)
function search() {
  limit.value = 50
  inboxScroll.value = 0
  void loadList()
}
const files = computed(() =>
  patches.value
    .filter((f): f is FileDiff => !!f)
    .map((file) => ({
      ...file,
      Added: file.Hunks.reduce(
        (n, h) => n + (h?.Lines.filter((l) => l?.Type === LineType.LineAdded).length ?? 0),
        0,
      ),
      Removed: file.Hunks.reduce(
        (n, h) => n + (h?.Lines.filter((l) => l?.Type === LineType.LineRemoved).length ?? 0),
        0,
      ),
    })),
)
const visibleFiles = computed(() =>
  files.value.filter((f) => f.Path.toLowerCase().includes(fileQuery.value.toLowerCase())),
)
const diff = computed(() => files.value.find((f) => f.Path === filePath.value) ?? null)
const threads = computed(() =>
  (discussion.value?.Threads ?? []).filter(
    (t) => threadFilter.value !== 'unresolved' || !t.Resolved,
  ),
)
const fileThreads = computed(() => threads.value.filter((t) => t.Path === filePath.value))
const unresolved = computed(() => discussion.value?.Threads.filter((t) => !t.Resolved).length ?? 0)
const timeline = computed(() =>
  [
    ...(discussion.value?.Comments ?? []).map((c) => ({
      ...c,
      key: `comment-${c.ID}`,
      State: 'COMMENT',
    })),
    ...(discussion.value?.Reviews ?? []).map((r) => ({ ...r, key: `review-${r.ID}` })),
  ].sort((a, b) => new Date(a.CreatedAt).getTime() - new Date(b.CreatedAt).getTime()),
)
function date(value: string) {
  const d = new Date(value)
  return Number.isFinite(d.getTime()) && d.getFullYear() > 1 ? d.toLocaleString() : ''
}
function reviewLabel(value: string) {
  return (
    (
      {
        APPROVED: 'Approved',
        CHANGES_REQUESTED: 'Requested changes',
        COMMENTED: 'Reviewed',
        DISMISSED: 'Review dismissed',
        PENDING: 'Pending review',
        COMMENT: 'Commented',
      } as Record<string, string>
    )[value] ?? value
  )
}
async function openURL(url: string) {
  try {
    const target = new URL(url)
    if (target.protocol !== 'https:') throw new Error('Only HTTPS links can be opened.')
    await Browser.OpenURL(url)
  } catch (error) {
    notify({ tone: 'danger', title: 'Unable to open link', message: message(error) })
  }
}
function cancelReads() {
  for (const task of pending) task.cancel?.()
  pending.clear()
}
function back() {
  if (selected.value) {
    previewNumber.value = selected.value.Number
    void nextTick(() => inbox.value?.focus())
  }
  detailVersion++
  patchVersion++
  cancelReads()
  selected.value = null
  detailBusy.value = false
}
function loadMore() {
  limit.value = Math.min(500, limit.value + 50)
  void loadList()
}
async function loadList() {
  const version = ++listVersion
  back()
  listBusy.value = true
  listError.value = ''
  connection.value = null
  list.value = []
  const remote = remoteName.value
  if (!remote) {
    listBusy.value = false
    return
  }
  try {
    const status = await track(PRService.ProviderStatus(remote))
    if (!alive || version !== listVersion) return
    connection.value = status
    if (!status?.Ready) return
    const result = await track(
      PRService.ListPRs(remote, {
        State: state.value,
        Author: '',
        Search: searchQuery.value,
        Limit: limit.value,
      }),
    )
    if (!alive || version !== listVersion) return
    list.value = result
    if (props.initialNumber && !openedInitial) {
      openedInitial = true
      const target = result.find((pr) => pr.Number === props.initialNumber)
      if (target) void selectPR(target)
    }
  } catch (error) {
    if (alive && version === listVersion) listError.value = message(error)
  } finally {
    if (alive && version === listVersion) listBusy.value = false
  }
}
async function selectPR(pr: PullRequest, refresh = false) {
  const version = ++detailVersion
  patchVersion++
  cancelReads()
  const remote = remoteName.value
  commentTarget.value = null
  selected.value = pr
  metadataReady.value = false
  detailBusy.value = true
  discussion.value = null
  checks.value = []
  checksBusy.value = true
  patches.value = []
  patchesLoaded.value = false
  patchBusy.value = false
  discussionError.value = ''
  checksError.value = ''
  detailError.value = ''
  patchError.value = ''
  if (!refresh) {
    tab.value = 'files'
    checksExpanded.value = false
    filePath.value = ''
    fileQuery.value = ''
    threadFilter.value = 'all'
  }
  const valid = () => alive && version === detailVersion
  const tasks = [
    track(PRService.GetPR(remote, pr.Number)).then(
      (value) => {
        if (valid() && value) {
          selected.value = value
          metadataReady.value = true
          if (tab.value === 'files') void loadPatches()
        }
      },
      (error) => {
        if (valid()) detailError.value = message(error)
      },
    ),
    track(PRService.GetDiscussion(remote, pr.Number)).then(
      (value) => {
        if (valid()) discussion.value = value
      },
      (error) => {
        if (valid()) discussionError.value = message(error)
      },
    ),
    track(PRService.GetChecks(remote, pr.Number)).then(
      (value) => {
        if (valid()) {
          checks.value = value
          checksBusy.value = false
        }
      },
      (error) => {
        if (valid()) {
          checksError.value = message(error)
          checksBusy.value = false
        }
      },
    ),
  ]
  await nextTick()
  if (valid() && !refresh) main.value?.focus()
  if (tab.value === 'files') void loadPatches()
  await Promise.all(tasks)
  if (valid()) detailBusy.value = false
}
async function loadPatches() {
  if (!selected.value || !metadataReady.value || patchBusy.value || patchesLoaded.value) return
  const version = ++patchVersion
  const selectionVersion = detailVersion
  patchBusy.value = true
  patchError.value = ''
  try {
    const result = await track(
      PRService.GetPRPatches(remoteName.value, selected.value.Number, selected.value.HeadSHA),
    )
    if (!alive || version !== patchVersion || selectionVersion !== detailVersion) return
    patches.value = result
    patchesLoaded.value = true
    if (!files.value.some((f) => f.Path === filePath.value))
      filePath.value = files.value[0]?.Path ?? ''
  } catch (error) {
    if (alive && version === patchVersion) patchError.value = message(error)
  } finally {
    if (alive && version === patchVersion) patchBusy.value = false
  }
}
function selectFile(path: string) {
  filePath.value = path
  tab.value = 'files'
}
async function showThread(thread: Thread) {
  const version = detailVersion
  filePath.value = thread.Path
  tab.value = 'files'
  await loadPatches()
  if (!alive || version !== detailVersion) return
  filePath.value = thread.Path
  await nextTick()
  if (!thread.Outdated && thread.Line && diff.value) {
    const index = diff.value.Hunks.findIndex((h) =>
      h?.Lines.some(
        (l) => l && (thread.Side === 'LEFT' ? l.OldLineNo : l.NewLineNo) === thread.Line,
      ),
    )
    if (index >= 0) await diffView.value?.revealHunk(index)
  }
}
watch(tab, (value) => {
  if (value === 'files') void loadPatches()
})
watch([remoteName, state, scope, sort], () => {
  limit.value = 50
  previewNumber.value = 0
  inboxScroll.value = 0
  void loadList()
})
function onKey(event: KeyboardEvent) {
  if (event.key === 'F6' && selected.value) {
    event.preventDefault()
    if (main.value?.contains(document.activeElement)) inspector.value?.focus()
    else main.value?.focus()
  }
  if (event.key === 'Escape' && selected.value && !isEditable(event.target)) {
    event.preventDefault()
    back()
  }
}
async function initialize() {
  listBusy.value = true
  listError.value = ''
  setModeline({ mode: 'PULL REQUESTS', hints: 'Esc PR list · F6 switch pane' })
  try {
    const names = await track(RepoService.ListRemotes())
    if (!alive) return
    remotes.value = names
    remoteName.value =
      props.initialRemote && names.includes(props.initialRemote)
        ? props.initialRemote
        : names.includes('origin')
          ? 'origin'
          : (names[0] ?? '')
  } catch (error) {
    if (alive) listError.value = message(error)
  } finally {
    if (alive && !remoteName.value) listBusy.value = false
  }
}
onMounted(() => {
  listVisible.value = window.matchMedia?.('(min-width:1101px)').matches ?? false
  void initialize()
})
onUnmounted(() => {
  alive = false
  listVersion++
  detailVersion++
  patchVersion++
  for (const task of pending) task.cancel?.()
  resetModeline()
})
</script>

<template>
  <section class="pr-view" @keydown="onKey">
    <RemoteToolbar
      title="Pull requests"
      :repo="connection?.Repo"
      :remotes="remotes"
      v-model:remote="remoteName"
      :selected="!!selected"
      :list-visible="listVisible"
      :busy="listBusy || detailBusy || patchBusy"
      @toggle="listVisible = !listVisible"
      @back="back"
      @refresh="selected ? selectPR(selected, true) : loadList()"
    />
    <SurfaceState
      v-if="listError"
      tone="error"
      title="Could not load GitHub"
      :message="listError"
      action-label="Retry"
      @action="remotes.length ? loadList() : initialize()"
    />
    <SurfaceState
      v-else-if="!listBusy && !remotes.length"
      title="No remote configured"
      message="Add a GitHub remote to this repository to browse its pull requests."
    />
    <div v-else-if="connection && !connection.Ready" class="pr-connect">
      <SurfaceState tone="error" title="Connect GitHub CLI" :message="connection.Message" />
      <p>Ichi uses your existing GitHub CLI account. In a terminal, sign in with:</p>
      <code>gh auth login --hostname github.com</code>
      <p>Your credentials stay with GitHub CLI.</p>
      <UiButton @click="loadList">Check connection</UiButton>
    </div>
    <main v-else-if="!selected" ref="main" class="pr-browser" tabindex="-1">
      <InboxControls v-model:scope="scope" v-model:sort="sort" kind="pr">
        <form class="inbox-search pr-filters" @submit.prevent="search">
          <UiInput
            v-model="query"
            placeholder="Search pull requests…"
            aria-label="Filter pull requests"
          />
          <UiButton type="submit" size="sm">Search</UiButton>
        </form>
        <StateFilters
          compact
          v-model="state"
          :states="[PRState.PROpen, PRState.PRClosed, PRState.PRMerged, PRState.PRAll]"
          :count="visible.length"
          label="Pull request state"
          :author="authorFilter"
          :label-filter="labelFilter"
          @filter="applyFilters"
        />
      </InboxControls>
      <SurfaceState v-if="listBusy" tone="loading" title="Loading pull requests…" />
      <InboxWorkbench
        v-else
        ref="inbox"
        v-model="previewNumber"
        :items="inboxItems"
        kind="pr"
        :repo-url="repoUrl"
        :scroll="inboxScroll"
        @scroll="inboxScroll = $event"
        @open="selectFromList"
        @link="openURL"
      >
        <UiButton v-if="list.length >= limit && limit < 500" @click="loadMore"
          >Load more pull requests</UiButton
        >
        <p v-if="list.length >= 500" class="pr-muted">
          Showing up to 500 results. Narrow your search to find more.
        </p>
      </InboxWorkbench>
    </main>
    <div v-else class="pr-detail-layout">
      <ItemRail
        v-if="listVisible"
        title="Pull requests"
        :items="railItems"
        :selected="selected.Number"
        @select="selectFromList"
        @close="listVisible = false"
        @back="back"
      />
      <div class="pr-workspace" :style="{ '--pr-inspector-width': `${width}px` }">
        <main ref="main" class="pr-main" tabindex="-1">
          <header class="pr-heading">
            <span class="pr-number"
              >#{{ selected.Number }} · {{ selected.Draft ? 'Draft' : selected.State }}</span
            >
            <h2>{{ selected.Title }}</h2>
            <p>
              <PersonName :name="selected.Author.Login" :login="selected.Author.Login" /> ·
              {{ selected.HeadBranch }} → {{ selected.BaseBranch }}
            </p>
          </header>
          <nav class="pr-tabs" aria-label="Pull request content">
            <button :aria-current="tab === 'files' ? 'page' : undefined" @click="tab = 'files'">
              Files changed · {{ selected.ChangedFiles }}
            </button>
            <button
              :aria-current="tab === 'conversation' ? 'page' : undefined"
              @click="tab = 'conversation'"
            >
              Conversation<span v-if="unresolved" class="thread-count">
                · {{ unresolved }} unresolved</span
              >
            </button>
            <details class="pr-actions">
              <summary aria-label="Pull request actions">•••</summary>
              <button @click="openURL(selected.URL)">Open on GitHub ↗</button>
            </details>
          </nav>
          <div v-if="tab === 'conversation'" class="pr-conversation">
            <p v-if="detailError" class="pr-error" role="alert">Details: {{ detailError }}</p>
            <TimelineItem first kind="OPENED" :last="!timeline.length"
              ><article class="pr-post">
                <header>
                  <ActivityIdentity
                    :author="selected.Author.Login"
                    :avatar-url="selected.Author.AvatarURL"
                  /><span>opened this pull request</span>
                </header>
                <MarkdownBody
                  class="pr-body"
                  :body="
                    selected.Body ||
                    (detailBusy ? 'Loading description…' : 'No description provided.')
                  "
                  :base-url="markdownBase"
                  :repo-url="repoUrl"
                  @open="openURL"
                />
                <CommentActions
                  v-if="discussion?.SubjectID"
                  :comment="{
                    ID: discussion.SubjectID,
                    Body: selected.Body,
                    URL: selected.URL,
                    CanUpdate: false,
                    CanDelete: false,
                    CanReact: discussion.CanReact,
                    Reactions: discussion.Reactions,
                  }"
                  :repo-url="repoUrl"
                  quote
                  @quote="quoteReply"
                  @open="openURL"
                /></article
            ></TimelineItem>
            <SurfaceState
              v-if="detailBusy && !discussion"
              tone="loading"
              title="Loading discussion…"
              compact
            />
            <SurfaceState
              v-if="discussionError"
              tone="error"
              title="Could not load discussion"
              :message="discussionError"
              action-label="Retry"
              compact
              @action="selectPR(selected, true)"
            />
            <TimelineItem
              v-for="(entry, index) in timeline"
              :key="entry.key"
              :kind="entry.State"
              :last="index === timeline.length - 1"
              ><article class="pr-post">
                <header>
                  <ActivityIdentity :author="entry.Author" :avatar-url="entry.AvatarURL" /><span
                    class="review-decision"
                    :class="entry.State.toLowerCase()"
                    >{{ reviewLabel(entry.State) }}</span
                  ><time :datetime="entry.CreatedAt" :title="date(entry.CreatedAt)">{{
                    activityTime(entry.CreatedAt)
                  }}</time
                  ><button v-if="entry.URL" class="pr-link" @click="openURL(entry.URL)">
                    GitHub ↗
                  </button>
                </header>
                <MarkdownBody
                  v-if="entry.Body"
                  class="pr-body"
                  :body="entry.Body"
                  :base-url="markdownBase"
                  :repo-url="repoUrl"
                  @open="openURL"
                />
                <CommentActions
                  :comment="entry"
                  :repo-url="repoUrl"
                  quote
                  @quote="quoteReply"
                  @open="openURL"
                /></article
            ></TimelineItem>
            <CommentComposer
              v-if="discussion"
              class="general-composer"
              :draft-key="conversation.key.value + ':comment'"
              :submit="(Body) => conversation.act({ Action: 'comment', Body })"
              label="Post comment"
              :disabled="conversation.busy.value"
              :repo-url="repoUrl"
              @open="openURL"
            />
            <section v-if="discussion" class="pr-threads" aria-label="Code review threads">
              <header class="threads-heading">
                <h3>
                  Code review threads <small>{{ unresolved }} unresolved</small>
                </h3>
                <select v-model="threadFilter" aria-label="Filter review threads">
                  <option value="all">All threads</option>
                  <option value="unresolved">Unresolved</option>
                </select>
              </header>
              <ReviewThread
                v-for="thread in threads"
                :key="thread.ID"
                :thread="thread"
                :base-url="markdownBase"
                :repo-url="repoUrl"
                @file="showThread"
                @open="openURL"
              />
              <p v-if="!threads.length" class="pr-muted">
                {{
                  threadFilter === 'unresolved'
                    ? 'No unresolved review threads.'
                    : 'No code review threads yet.'
                }}
              </p>
              <p v-if="!timeline.length && !discussion.Threads.length" class="pr-muted">
                No comments or reviews yet.
              </p>
            </section>
          </div>
          <template v-else>
            <SurfaceState v-if="patchBusy" tone="loading" title="Loading diff…" />
            <SurfaceState
              v-else-if="patchError"
              tone="error"
              title="Diff unavailable"
              :message="patchError"
              action-label="Retry"
              @action="selectPR(selected, true)"
            />
            <DiffView
              v-else-if="diff"
              ref="diffView"
              :diff="diff"
              read-only
              files-on-right
              :review-comments="selected.State === PRState.PROpen"
              @comment="startInlineComment"
              @exit="inspector?.focus()"
            />
            <SurfaceState
              v-else
              title="No diff to display"
              message="Choose a file on the right. Older review threads may refer to files no longer in this pull request."
            />
          </template>
        </main>
        <aside
          ref="inspector"
          class="pr-inspector"
          tabindex="0"
          aria-label="Pull request inspector"
        >
          <PaneSplitter
            v-model="width"
            side="left"
            :min="300"
            :max="650"
            label="Pull request inspector width"
          />
          <div class="pr-inspector-scroll">
            <section>
              <h3>
                Changed files <small>{{ files.length }}</small>
              </h3>
              <UiInput
                v-model="fileQuery"
                aria-label="Filter changed files"
                placeholder="Filter files…"
              />
              <div class="pr-files">
                <div v-for="file in visibleFiles" :key="file.Path" class="file-entry">
                  <button
                    class="pr-file"
                    :aria-current="filePath === file.Path ? 'true' : undefined"
                    @click="selectFile(file.Path)"
                  >
                    <span>{{ file.Path }}</span
                    ><small>+{{ file.Added }} −{{ file.Removed }}</small></button
                  ><button
                    v-if="fileThreadCount(file.Path)"
                    class="file-thread-count"
                    :aria-label="`${fileThreadCount(file.Path)} unresolved threads in ${file.Path}`"
                    @click="showFileThreads(file.Path)"
                  >
                    {{ fileThreadCount(file.Path) }} ◌
                  </button>
                </div>
              </div>
              <p v-if="patchError" class="pr-error">{{ patchError }}</p>
            </section>
            <section class="pr-ci">
              <details
                :open="checksExpanded"
                @toggle="checksExpanded = ($event.target as HTMLDetailsElement).open"
              >
                <summary class="ci-summary">
                  <span class="ci-heading"
                    ><strong>CI checks</strong><span v-if="checksBusy">Loading…</span
                    ><span v-else-if="checksError" class="pr-error">Unavailable</span
                    ><span v-else-if="checkSummary.total">{{ checkSummary.percent }}% complete</span
                    ><span v-else>No checks reported</span></span
                  >
                  <template v-if="!checksBusy && !checksError && checkSummary.total">
                    <progress
                      :value="checkSummary.completed"
                      :max="checkSummary.total"
                      aria-label="Completed CI checks"
                      :class="{ 'has-failures': checkSummary.failed }"
                    />
                    <span class="ci-outcomes" :class="{ 'pr-error': checkSummary.failed }">{{
                      checkSummary.outcomes
                    }}</span>
                  </template>
                </summary>
                <p v-if="checksError" class="pr-error" role="alert">{{ checksError }}</p>
                <p v-else-if="!checks.length" class="pr-muted">
                  {{ checksBusy ? 'Loading checks…' : 'No checks reported.' }}
                </p>
                <button
                  v-for="check in checks"
                  :key="check.Name + check.URL"
                  class="check-row"
                  :disabled="!check.URL"
                  @click="openURL(check.URL)"
                >
                  <span>{{ check.Name }}</span
                  ><small :class="check.Conclusion">{{
                    (check.Conclusion || check.Status).replace(/_/g, ' ')
                  }}</small>
                </button>
              </details>
            </section>
            <section class="review-summary">
              <button @click="tab = 'conversation'">
                <strong>Review</strong
                ><span>{{
                  discussionError ? 'Unavailable' : detailBusy ? 'Loading…' : reviewSummary
                }}</span></button
              ><small v-if="discussion">{{ countLabel(unresolved, 'unresolved thread') }}</small>
            </section>
            <MaintainerNotes
              v-if="connection?.Repo"
              :key="`${connection.Repo}:${selected.Number}`"
              :repository="connection.Repo"
              :number="selected.Number"
            />
            <ReviewDraftPanel
              :key="conversation.key.value"
              :head="selected.HeadSHA"
              :author="selected.Author.Login"
              :login="connection?.Login || ''"
              :open="selected.State === PRState.PROpen"
              :target="commentTarget"
              :repo-url="repoUrl"
              @clear-target="commentTarget = null"
              @open="openURL"
            />
            <template v-if="tab === 'files'">
              <section
                v-if="fileThreads.length || discussionError"
                class="file-review-threads"
                tabindex="-1"
              >
                <h3>
                  Threads in this file <small>{{ fileThreads.length }}</small>
                </h3>
                <p v-if="discussionError" class="pr-error">{{ discussionError }}</p>
                <ReviewThread
                  v-for="thread in fileThreads"
                  :key="thread.ID"
                  :thread="thread"
                  :base-url="markdownBase"
                  :repo-url="repoUrl"
                  compact
                  @file="showThread"
                  @open="openURL"
                />
                <p v-if="!fileThreads.length" class="pr-muted">
                  {{ detailBusy ? 'Loading threads…' : 'No matching threads for this file.' }}
                </p>
              </section>
            </template>
          </div>
        </aside>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pr-view {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  color: var(--text);
  background: var(--surface-panel);
}
.pr-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
}
.pr-connection,
.remote-label {
  color: var(--text-mut);
  font-size: var(--fs-sm);
}
.remote-label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.toolbar-space {
  flex: 1;
}
select {
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 5px 8px;
  color: var(--text);
  background: var(--surface-input);
  font: inherit;
}
.pr-browser {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.pr-filters {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}
.pr-filters > :first-child {
  flex: 1;
}
.pr-filters > span {
  color: var(--text-mut);
  font-size: var(--fs-sm);
}
.pr-list {
  padding: 8px 16px;
}
.pr-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 10px;
  text-align: left;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.pr-row:hover,
.pr-file:hover {
  background: var(--surface-sidebar);
}
.pr-row-copy {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 6px;
}
.pr-row-copy strong {
  color: var(--head);
  font-size: var(--fs-md);
  overflow-wrap: anywhere;
}
.pr-row-copy small,
.pr-number,
.pr-stats {
  color: var(--text-mut);
  font-size: var(--fs-sm);
}
.pr-badge {
  border: 1px solid var(--border);
  padding: 3px 7px;
  border-radius: 5px;
  font-size: var(--fs-xs);
  text-transform: capitalize;
}
.pr-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) min(var(--pr-inspector-width), 48%);
  flex: 1;
  min-height: 0;
}
.pr-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pr-heading {
  padding: 16px 20px 10px;
}
.pr-heading h2 {
  margin: 6px 0;
  font-size: var(--fs-lg);
  color: var(--head);
  overflow-wrap: anywhere;
}
.pr-heading p {
  margin: 0;
  color: var(--text-mut);
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}
.pr-tabs {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 20px 10px;
  border-bottom: 1px solid var(--border);
}
.pr-tabs > button:not(.ui-button) {
  border: 0;
  background: none;
  color: var(--text-dim);
  padding: 8px 0;
  cursor: pointer;
}
.pr-tabs > button[aria-current] {
  color: var(--accent-text);
  box-shadow: 0 2px var(--accent);
}
.pr-tabs > :last-child {
  margin-left: auto;
}
.pr-conversation {
  overflow: auto;
  flex: 1;
  min-height: 0;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.pr-post {
}
.pr-post header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  font-size: var(--fs-sm);
}
.pr-post header > span,
time {
  color: var(--text-mut);
}
.pr-post time {
  font-size: var(--fs-xs);
}
.pr-body {
  overflow-wrap: anywhere;
  margin: 12px 0 0;
  line-height: 1.65;
  font-size: var(--fs-md);
}
.pr-link {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--accent-text);
  cursor: pointer;
}
.pr-post .approved,
.check-row .success {
  color: var(--positive-text);
}
.pr-post .changes_requested,
.check-row .failure,
.pr-error {
  color: var(--negative-text);
}
.pr-error {
  overflow-wrap: anywhere;
  font-size: var(--fs-sm);
}
.pr-threads {
  display: grid;
  gap: 12px;
}
.threads-heading {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
}
h3 {
  font-size: var(--fs-md);
  color: var(--head);
  margin: 0 0 12px;
}
h3 small {
  font-weight: normal;
  color: var(--text-mut);
  font-size: var(--fs-xs);
  margin-left: 8px;
}
.pr-inspector {
  position: relative;
  border-left: 1px solid var(--border);
  min-width: 0;
  min-height: 0;
  background: var(--surface-sidebar);
}
.pr-inspector-scroll {
  height: 100%;
  overflow: auto;
}
.pr-inspector section {
  padding: 16px;
  border-bottom: 1px solid var(--border);
}
.pr-inspector section > .review-thread {
  margin-top: 12px;
}
.ci-summary {
  cursor: pointer;
  list-style: none;
  display: grid;
  gap: 8px;
}
.ci-summary::-webkit-details-marker {
  display: none;
}
.ci-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-sm);
}
.ci-heading::before {
  content: '▸';
  color: var(--text-mut);
}
.pr-ci details[open] .ci-heading::before {
  content: '▾';
}
.ci-heading > span {
  margin-left: auto;
  color: var(--text-mut);
  font-size: var(--fs-xs);
}
.ci-heading > .pr-error {
  color: var(--negative-text);
}
.ci-outcomes {
  color: var(--text-mut);
  font-size: var(--fs-xs);
}
.ci-outcomes.pr-error {
  color: var(--negative-text);
}
.ci-summary progress {
  width: 100%;
  height: 5px;
  border: 0;
  border-radius: 3px;
  overflow: hidden;
  appearance: none;
  background: var(--border);
}
.ci-summary progress::-webkit-progress-bar {
  background: var(--border);
}
.ci-summary progress::-webkit-progress-value {
  background: var(--accent);
}
.ci-summary progress.has-failures::-webkit-progress-value {
  background: var(--negative-text);
}
.ci-summary progress::-moz-progress-bar {
  background: var(--accent);
}
.ci-summary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}
.pr-ci details[open] .ci-summary {
  margin-bottom: 12px;
}
.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
  width: 100%;
  padding: 8px 0;
  background: none;
  border: 0;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.check-row span {
  overflow-wrap: anywhere;
  min-width: 0;
}
.check-row small {
  color: var(--text-mut);
  text-align: right;
}
.pr-files {
  display: grid;
  margin-top: 8px;
}
.pr-file {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 6px;
  border: 0;
  background: none;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.pr-file span {
  overflow-wrap: anywhere;
  font: var(--fs-xs) var(--font-mono);
}
.pr-file small {
  flex-shrink: 0;
  color: var(--text-mut);
  font-size: var(--fs-xs);
}
.pr-file[aria-current] {
  background: var(--accent-soft);
  color: var(--accent-text);
}
.pr-muted {
  color: var(--text-mut);
  line-height: 1.6;
  font-size: var(--fs-sm);
}
.pr-connect {
  padding: 30px;
}
.pr-connect code {
  display: block;
  padding: 16px;
  background: var(--surface-sidebar);
  border: 1px solid var(--border);
  border-radius: 6px;
}
@media (max-width: 850px) {
  .pr-workspace {
    display: flex;
    flex-direction: column;
    overflow: auto;
  }
  .pr-main {
    min-height: 500px;
    flex-shrink: 0;
  }
  .pr-inspector {
    border-left: 0;
    border-top: 1px solid var(--border);
  }
  .pr-inspector-scroll {
    overflow: visible;
  }
  .pr-inspector :deep(.pane-splitter) {
    display: none;
  }
  .pr-repo,
  .pr-stats {
    display: none;
  }
}

.pr-detail-layout {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.pr-workspace {
  min-width: 0;
}
.pr-post {
  width: 100%;
  max-width: 780px;
  margin: 0 auto;
  box-sizing: border-box;
}
.pr-post:first-of-type {
}
.pr-post header {
  align-items: center;
}
.pr-threads {
  width: 100%;
  max-width: 780px;
  margin: 0 auto;
}
.row-labels {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.row-labels:empty {
  display: none;
}
.pr-row {
  align-items: flex-start;
}
.pr-filters {
  padding-top: 10px;
}
.pr-actions {
  margin-left: auto;
  position: relative;
}
.pr-actions summary {
  list-style: none;
  cursor: pointer;
  padding: 8px;
  color: var(--text-mut);
}
.pr-actions summary::-webkit-details-marker {
  display: none;
}
.pr-actions button {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 30;
  min-width: 160px;
  color: var(--text);
  background: var(--surface-sidebar);
  border: 1px solid var(--border);
  padding: 12px;
  border-radius: 6px;
  cursor: pointer;
}
.file-entry {
  display: flex;
  align-items: center;
}
.file-entry .pr-file {
  flex: 1;
  min-width: 0;
}
.file-thread-count {
  flex-shrink: 0;
  border: 1px solid var(--border);
  background: var(--surface-panel);
  color: var(--accent-text);
  border-radius: 5px;
  padding: 4px 6px;
  cursor: pointer;
  font: inherit;
  font-size: var(--fs-xs);
}
.review-summary button {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: var(--fs-sm);
  cursor: pointer;
  padding: 0 0 8px;
  text-align: left;
}
.review-summary small {
  color: var(--text-mut);
}
.thread-count {
  font-size: var(--fs-xs);
  color: var(--text-mut);
}

.pr-post,
.pr-post:first-of-type {
  background: var(--surface-card);
  border: 1px solid var(--comment-border);
  border-radius: var(--radius-lg);
  padding: 0 20px 20px;
  overflow: hidden;
  box-shadow: 0 2px 5px rgb(0 0 0 / 5%);
  flex-shrink: 0;
}
.pr-post > header {
  background: var(--comment-header);
  border-bottom: 1px solid var(--border);
  padding: 12px 20px;
  margin: 0 -20px 18px;
  align-items: center;
  min-height: 50px;
}
.pr-conversation {
  gap: 24px;
}
.pr-threads {
  margin-top: 12px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}
</style>
