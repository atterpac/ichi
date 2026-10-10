<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import AuthorAvatar from '../common/AuthorAvatar.vue'
import { Browser } from '@wailsio/runtime'
import {
  GraphService,
  PRService,
  RepoService,
} from '../../bindings/github.com/atterpac/ichi/desktop/services'
import { PRState, type PullRequest } from '../../bindings/github.com/atterpac/ichi/internal/remote'
import { useDialogFocus } from '../../composables/useDialogFocus'
import { cachedContributions, githubLogin, profile, type Person } from './profile'
const PullRequestsView = defineAsyncComponent(() => import('../pr/PullRequestsView.vue'))
const IssuesView = defineAsyncComponent(() => import('../issues/IssuesView.vue'))
const CommitDiffView = defineAsyncComponent(() => import('../diff/CommitDiffView.vue'))
const props = defineProps<{ person: Person }>()
const dialog = ref<HTMLElement | null>(null)
useDialogFocus(dialog, () => {
  if (view.value !== 'summary') view.value = 'summary'
  else profile.value = null
})
const login = ref(props.person.login || '')
const email = ref(props.person.email || '')
const remote = ref(props.person.remote || '')
const repository = ref('')
const viewer = ref('')
const busy = ref(true)
const error = ref('')
const commitError = ref('')
const prs = ref<PullRequest[]>([])
const commits = ref<{ Hash: string; Message: string; Date: string; URL?: string }[]>([])
const view = ref('summary')
watch(view, async () => {
  await nextTick()
  if (alive) dialog.value?.querySelector<HTMLButtonElement>('header button')?.focus()
})
const focusNumber = ref(0)
const focusHash = ref('')
const limit = ref(30)
let alive = true
onUnmounted(() => {
  alive = false
})
const local = computed(() => !!email.value)
async function loadCommits() {
  commitError.value = ''
  try {
    const values = local.value
      ? await GraphService.AuthorHistory(email.value, limit.value)
      : login.value && remote.value
        ? await cachedContributions(
            JSON.stringify([repository.value, viewer.value, login.value, 'commits', limit.value]),
            () =>
              PRService.ContributorCommits(remote.value, login.value, Math.min(limit.value, 100)),
          )
        : []
    if (alive) commits.value = values.filter((v) => v !== null)
  } catch (e) {
    if (alive) commitError.value = String(e)
  }
}
async function initialize() {
  try {
    if (props.person.commit && !email.value) {
      const detail = await GraphService.LoadCommit(props.person.commit)
      if (!alive) return
      email.value = detail?.AuthorEmail || ''
    }
    login.value ||= githubLogin(email.value)
    if (!remote.value) {
      const names = await RepoService.ListRemotes()
      if (!alive) return
      remote.value = names.includes('origin') ? 'origin' : names[0] || ''
    }
    if (!login.value && props.person.commit && remote.value) {
      try {
        login.value = await PRService.ContributorLogin(remote.value, props.person.commit)
      } catch {
        /* Local history remains available offline or for unpushed commits. */
      }
      if (!alive) return
    }
    const localRead = local.value ? loadCommits() : Promise.resolve()
    await Promise.all([
      localRead,
      (async () => {
        if (!login.value || !remote.value) return
        const status = await PRService.ProviderStatus(remote.value)
        if (!alive) return
        repository.value = status?.Repo || ''
        if (!status?.Ready) throw new Error(status?.Message || 'GitHub is unavailable')
        viewer.value = status.Login
        if (!local.value) await loadCommits()
        const results = await cachedContributions(
          JSON.stringify([status.Repo, status.Login, login.value, 'prs']),
          () =>
            PRService.ListPRs(remote.value, {
              State: PRState.PRAll,
              Author: '',
              Search: `author:${login.value} sort:updated-desc`,
              Limit: 3,
            }),
        )
        if (alive) prs.value = results
      })(),
    ])
  } catch (e) {
    if (alive) error.value = String(e)
  } finally {
    if (alive) busy.value = false
  }
}
function loadMore() {
  limit.value = Math.min(limit.value + 30, local.value ? 500 : 100)
  void loadCommits()
}
function browse(target: string, number = 0) {
  focusNumber.value = number
  view.value = target
}
async function openURL(url: string) {
  try {
    if (new URL(url).protocol === 'https:') await Browser.OpenURL(url)
  } catch (e) {
    error.value = String(e)
  }
}
function openCommit(commit: { Hash: string; URL?: string }) {
  if (local.value) {
    focusHash.value = commit.Hash
    view.value = 'commit'
  } else if (commit.URL) void openURL(commit.URL)
}
onMounted(initialize)
</script>
<template>
  <Teleport to="body">
    <div class="contributor-backdrop" @click.self="profile = null">
      <section
        ref="dialog"
        class="contributor-dialog"
        :class="{ wide: !['summary', 'commits'].includes(view) }"
        role="dialog"
        aria-modal="true"
        :aria-label="`${person.name} contributions`"
        tabindex="-1"
        @keydown.stop
      >
        <header>
          <AuthorAvatar
            :name="person.name"
            :avatar-url="person.avatarUrl"
            :email="email"
            :interactive="false"
            :size="32"
          />
          <button v-if="view !== 'summary'" @click="view = 'summary'">← Profile</button>
          <div>
            <strong>{{ person.name }}</strong
            ><small
              >{{ login ? `@${login}` : 'Local Git author'
              }}<template v-if="repository"> · {{ repository }}</template></small
            >
          </div>
          <button aria-label="Close contributor profile" @click="profile = null">×</button>
        </header>
        <template v-if="view === 'summary' || view === 'commits'">
          <div class="contributor-content">
            <p v-if="busy" role="status">Loading contributions…</p>
            <p v-if="error" role="alert">{{ error }}</p>
            <p v-if="!login && !busy" class="muted">
              No GitHub identity is available for this author. Showing exact author-email matches
              only.
            </p>
            <nav v-if="view === 'summary'" aria-label="Contribution actions">
              <button @click="view = 'commits'">View commits</button
              ><button v-if="login && remote" @click="browse('prs')">View pull requests</button
              ><button v-if="login && remote" @click="browse('issues')">View issues</button
              ><button v-if="login && remote" @click="browse('reviews')">View reviews</button
              ><button
                v-if="login"
                @click="openURL(`https://github.com/${encodeURIComponent(login)}`)"
              >
                GitHub profile ↗
              </button>
            </nav>
            <template v-if="view === 'summary' && login"
              ><h3>Recent pull requests</h3>
              <button
                v-for="pr in prs"
                :key="pr.Number"
                class="contribution-row"
                @click="browse('prs', pr.Number)"
              >
                <strong>{{ pr.Title }}</strong
                ><small>#{{ pr.Number }} · {{ pr.State }}</small>
              </button>
              <p v-if="!busy && !error && !prs.length" class="muted">
                No pull requests found in this repository.
              </p></template
            >
            <h3>{{ view === 'commits' ? 'Commits' : 'Recent commits' }}</h3>
            <p class="muted">
              {{
                local
                  ? 'Exact author email · all local refs'
                  : 'GitHub default branch · opens on GitHub'
              }}
            </p>
            <p v-if="commitError" role="alert">
              {{ commitError }} <button @click="loadCommits">Retry</button>
            </p>
            <button
              v-for="commit in view === 'commits' ? commits : commits.slice(0, 3)"
              :key="commit.Hash"
              class="contribution-row"
              @click="openCommit(commit)"
            >
              <strong>{{ commit.Message.split('\n')[0] }}</strong
              ><small
                >{{ commit.Hash.slice(0, 8) }} ·
                {{ new Date(commit.Date).toLocaleDateString() }}</small
              >
            </button>
            <p v-if="!busy && !commitError && !commits.length" class="muted">
              No matching commits found.
            </p>
            <button
              v-if="view === 'commits' && commits.length >= limit && limit < (local ? 500 : 100)"
              @click="loadMore"
            >
              Load more
            </button>
          </div></template
        >
        <PullRequestsView
          v-else-if="view === 'prs' || view === 'reviews'"
          :key="view"
          :initial-remote="remote"
          :initial-author="view === 'prs' ? login : ''"
          :initial-reviewer="view === 'reviews' ? login : ''"
          :initial-number="focusNumber"
        />
        <IssuesView
          v-else-if="view === 'issues'"
          :initial-remote="remote"
          :initial-author="login"
        />
        <CommitDiffView
          v-else-if="view === 'commit'"
          :focus-hash="focusHash"
          @back="view = 'commits'"
        />
      </section></div
  ></Teleport>
</template>
<style scoped>
.contributor-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1600;
  background: #0006;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.contributor-dialog {
  width: 520px;
  max-width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--surface-panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 20px 80px #0005;
  overflow: hidden;
}
.contributor-dialog.wide {
  width: 1400px;
  height: 90vh;
}
header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}
header div {
  flex: 1;
  min-width: 0;
}
small {
  display: block;
  color: var(--text-mut);
  margin-top: 4px;
  font-size: 11px;
}
.contributor-content {
  overflow: auto;
  padding: 16px;
}
nav {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 12px 0 20px;
}
button {
  font: inherit;
  font-size: 12px;
  color: var(--text);
  background: var(--surface-input);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 7px 10px;
  cursor: pointer;
}
button:hover {
  background: var(--surface-2);
}
button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
h3 {
  font-size: 12px;
  margin: 18px 0 8px;
}
.muted {
  color: var(--text-mut);
  font-size: 12px;
}
.contribution-row {
  display: block;
  width: 100%;
  text-align: left;
  margin: 6px 0;
  padding: 10px;
}
.contribution-row strong {
  font-weight: 500;
  overflow-wrap: anywhere;
}
.contributor-dialog > :deep(.pr-view),
.contributor-dialog > :deep(.issues-view) {
  min-height: 0;
  flex: 1;
}
</style>
