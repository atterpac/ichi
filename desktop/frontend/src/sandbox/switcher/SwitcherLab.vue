<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { placeholderSvg } from '../../components/common/avatarPlaceholder'

type Repo = {
  id: string
  name: string
  profile: string
  path: string
  branch: string
  changed: number
  files: string[]
  pinned: boolean
}
const repos = ref<Repo[]>([
  {
    id: 'ichi',
    name: 'ichi',
    profile: 'Personal',
    path: '~/projects/ichi',
    branch: 'feat/cursor-review',
    changed: 8,
    files: ['DiffView.vue', 'useReviewCursor.ts', 'review.css'],
    pinned: true,
  },
  {
    id: 'dls',
    name: 'design-system',
    profile: 'Work',
    path: '~/work/galaxy/design-system',
    branch: 'feat/tokens',
    changed: 3,
    files: ['tokens.css', 'Button.vue', 'theme.ts'],
    pinned: true,
  },
  {
    id: 'relay',
    name: 'relay',
    profile: 'Personal',
    path: '~/projects/relay',
    branch: 'main',
    changed: 0,
    files: ['README.md', 'server.go'],
    pinned: false,
  },
  {
    id: 'console',
    name: 'console',
    profile: 'Work',
    path: '~/work/galaxy/console',
    branch: 'fix/navigation',
    changed: 12,
    files: ['Navigation.vue', 'routes.ts', 'layout.css'],
    pinned: false,
  },
  {
    id: 'garden',
    name: 'digital-garden',
    profile: 'Personal',
    path: '~/projects/digital-garden',
    branch: 'main',
    changed: 2,
    files: ['index.astro', 'notes.md'],
    pinned: false,
  },
])
const concepts = [
  {
    id: 'dropdown',
    name: '01 / Pocket',
    summary: 'A small switcher, right where the repository lives.',
    detail:
      'Minimal interruption. Profiles filter a compact list; your review stays visible underneath.',
  },
  {
    id: 'palette',
    name: '02 / Jump',
    summary: 'A keyboard-first jump with a landing preview.',
    detail:
      'Search across workspaces and see the branch, changes, and saved review position before switching.',
  },
  {
    id: 'rail',
    name: '03 / Spaces',
    summary: 'Your repositories become a persistent workspace.',
    detail:
      'Profiles live in a narrow rail, with pinned projects and recent work always one click away.',
  },
] as const
const concept = ref<(typeof concepts)[number]['id']>('dropdown')
const currentConcept = computed(() => concepts.find((c) => c.id === concept.value)!)
const activeId = ref('ichi')
const active = computed(() => repos.value.find((r) => r.id === activeId.value)!)
const profile = ref('All')
const query = ref('')
const open = ref(true)
const selected = ref(0)
const search = ref<HTMLInputElement>()
const positions = ref<Record<string, string>>({})
const currentFile = computed(() => positions.value[activeId.value] || active.value.files[0])
const filtered = computed(() =>
  repos.value
    .filter(
      (r) =>
        (profile.value === 'All' || r.profile === profile.value) &&
        `${r.name} ${r.path} ${r.branch}`.toLowerCase().includes(query.value.toLowerCase()),
    )
    .sort((a, b) => Number(b.pinned) - Number(a.pinned)),
)
const preview = computed(() => filtered.value[selected.value])
const announcement = ref('')
const adding = ref(false)
const newPath = ref('')
const newProfile = ref('Personal')
const pathError = ref('')
function avatar(r: Repo) {
  return `data:image/svg+xml,${encodeURIComponent(placeholderSvg(r.path, 'spore'))}`
}
async function focusSearch() {
  await nextTick()
  search.value?.focus()
}
function showSwitcher() {
  open.value = true
  void focusSearch()
}
function choose(r: Repo) {
  activeId.value = r.id
  announcement.value = `Opened ${r.name} · restored ${positions.value[r.id] || r.files[0]}`
  if (concept.value !== 'rail') open.value = false
}
function changeConcept(id: typeof concept.value) {
  concept.value = id
  open.value = true
  query.value = ''
  profile.value = 'All'
  adding.value = false
  void focusSearch()
}
function keydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
    e.preventDefault()
    showSwitcher()
    return
  }
  if (adding.value) return
  if (!open.value && concept.value !== 'rail') return
  if (e.key === 'Escape') {
    open.value = false
    return
  }
  const typing = e.target instanceof HTMLInputElement
  if (!typing && e.key === '/') {
    e.preventDefault()
    void focusSearch()
    return
  }
  if (e.key === 'ArrowDown' || (!typing && e.key === 'j')) {
    e.preventDefault()
    selected.value = Math.max(0, Math.min(selected.value + 1, filtered.value.length - 1))
  }
  if (e.key === 'ArrowUp' || (!typing && e.key === 'k')) {
    e.preventDefault()
    selected.value = Math.max(0, selected.value - 1)
  }
  if (typing && e.key === 'Enter' && preview.value) {
    e.preventDefault()
    choose(preview.value)
  }
}
function selectProfile(value: string) {
  profile.value = value
  open.value = true
}
function showAddFolder() {
  adding.value = true
  pathError.value = ''
}
function addRepo() {
  const path = newPath.value.trim().replace(/\/+$/, '')
  if (!path || !path.includes('/')) {
    pathError.value = 'Enter a sample folder path, like ~/projects/new-repo.'
    return
  }
  const existing = repos.value.find((r) => r.path === path)
  const repo: Repo = existing || {
    id: `sample-${Date.now()}`,
    name: path.split('/').pop()!,
    profile: newProfile.value,
    path,
    branch: 'main',
    changed: 0,
    files: ['README.md'],
    pinned: false,
  }
  if (!existing) repos.value.push(repo)
  profile.value = 'All'
  query.value = ''
  adding.value = false
  newPath.value = ''
  choose(repo)
}
watch([query, profile], () => {
  selected.value = 0
})
watch(selected, async () => {
  await nextTick()
  document.querySelector('.repo-row.highlighted')?.scrollIntoView({ block: 'nearest' })
})
onMounted(() => {
  window.addEventListener('keydown', keydown)
  void focusSearch()
})
onUnmounted(() => window.removeEventListener('keydown', keydown))
</script>

<template>
  <div class="lab">
    <header class="lab-heading">
      <div>
        <span class="eyebrow">ICHI / INTERACTION STUDIES</span>
        <h1>A place for every project.</h1>
        <p>Three ways to move between repositories and workspaces.</p>
      </div>
      <span class="demo-badge">Standalone demo · sample data</span>
    </header>
    <nav class="concepts" aria-label="Switcher designs">
      <button
        v-for="c in concepts"
        :key="c.id"
        :class="{ chosen: concept === c.id }"
        :aria-pressed="concept === c.id"
        @click="changeConcept(c.id)"
      >
        <strong>{{ c.name }}</strong
        ><span>{{ c.summary }}</span>
      </button>
    </nav>
    <div class="study-note">
      <p>{{ currentConcept.detail }}</p>
      <span>Try switching repos, selecting a file, then coming back.</span>
    </div>
    <section class="workstation" :class="concept" aria-label="Sample workstation">
      <header class="appbar">
        <span class="wordmark">ichi<span class="wordmark-dot">.</span></span
        ><span class="slash">/</span
        ><button
          class="repo-trigger"
          :aria-expanded="open"
          @click="open ? (open = false) : showSwitcher()"
        >
          <img :src="avatar(active)" alt="" /><span>{{ active.name }}</span
          ><span class="chevron">⌄</span></button
        ><span class="branch">⑂ {{ active.branch }}</span
        ><span class="appbar-end">{{ active.profile }} <kbd>Ctrl R</kbd></span>
      </header>
      <div class="work-area">
        <aside v-if="concept === 'rail'" class="space-rail" aria-label="Workspaces">
          <button
            v-for="p in ['All', 'Personal', 'Work']"
            :key="p"
            :class="{ chosen: profile === p }"
            :aria-label="p"
            :title="p"
            @click="selectProfile(p)"
          >
            <span>{{ p === 'All' ? '✳' : p === 'Personal' ? '⌂' : '▦' }}</span
            ><small>{{ p }}</small>
          </button>
          <div class="rail-bottom">spaces</div>
        </aside>
        <div v-if="open || concept === 'rail'" class="switch-layer">
          <button
            v-if="concept === 'palette'"
            class="backdrop"
            aria-label="Close switcher"
            @click="open = false"
          ></button>
          <section class="switcher" :aria-label="`${currentConcept.name} repository switcher`">
            <header class="switch-heading">
              <span>{{ concept === 'rail' ? 'Your workspace' : 'Switch repository' }}</span
              ><button
                v-if="concept !== 'rail'"
                class="quiet"
                aria-label="Close switcher"
                @click="open = false"
              >
                ×</button
              ><span v-else class="count">{{ filtered.length }}</span>
            </header>
            <label class="search"
              ><span aria-hidden="true">⌕</span
              ><input
                ref="search"
                v-model="query"
                aria-label="Find a repository"
                placeholder="Find a repository…"
                autocomplete="off"
              /><kbd>/</kbd></label
            >
            <nav v-if="concept !== 'rail'" class="profile-tabs" aria-label="Filter workspace">
              <button
                v-for="p in ['All', 'Personal', 'Work']"
                :key="p"
                :class="{ chosen: profile === p }"
                :aria-pressed="profile === p"
                @click="profile = p"
              >
                {{ p }}<span v-if="p !== 'All'" class="profile-dot" :class="p.toLowerCase()"></span>
              </button>
            </nav>
            <div class="picker-body">
              <div class="repo-list">
                <div class="list-label">
                  {{ query ? 'Matches' : 'Pinned & recent' }}<span>{{ filtered.length }}</span>
                </div>
                <div
                  v-for="(r, index) in filtered"
                  :key="r.id"
                  class="repo-row"
                  :class="{ highlighted: selected === index, active: activeId === r.id }"
                  @mouseenter="selected = index"
                >
                  <button class="repo-select" @focus="selected = index" @click="choose(r)">
                    <img :src="avatar(r)" alt="" /><span class="repo-copy"
                      ><strong
                        >{{ r.name
                        }}<span
                          v-if="r.id === activeId"
                          class="active-dot"
                          aria-label="Current repository"
                        ></span></strong
                      ><small>{{ r.path }}</small></span
                    ><span class="change-count" :class="{ clean: !r.changed }">{{
                      r.changed || '✓'
                    }}</span>
                  </button>
                  <button
                    class="pin"
                    :aria-label="`${r.pinned ? 'Unpin' : 'Pin'} ${r.name}`"
                    :aria-pressed="r.pinned"
                    @click="r.pinned = !r.pinned"
                  >
                    {{ r.pinned ? '★' : '☆' }}
                  </button>
                </div>
                <div v-if="!filtered.length" class="empty">
                  No repositories found.<small>Try another name or workspace.</small>
                </div>
              </div>
              <aside v-if="concept === 'palette' && preview" class="landing">
                <span class="eyebrow">YOUR NEXT STOP</span><img :src="avatar(preview)" alt="" />
                <h2>{{ preview.name }}</h2>
                <p>{{ preview.profile }} workspace</p>
                <dl>
                  <dt>Branch</dt>
                  <dd>⑂ {{ preview.branch }}</dd>
                  <dt>Working tree</dt>
                  <dd>
                    {{ preview.changed ? `${preview.changed} changed files` : 'All caught up' }}
                  </dd>
                  <dt>Resume review</dt>
                  <dd>{{ positions[preview.id] || preview.files[0] }}</dd>
                </dl>
                <button class="primary" @click="choose(preview)">
                  Open repository <span>↵</span>
                </button>
              </aside>
            </div>
            <footer class="switch-footer">
              <button @click="showAddFolder">＋ Add sample folder</button
              ><span>↑ ↓ <span class="footer-enter">move · ↵ open</span></span>
            </footer>
          </section>
        </div>
        <main class="review">
          <div class="review-header">
            <nav>
              <span class="selected-tab"
                >Changes <b>{{ active.changed }}</b></span
              ><span>History</span><span>Branches</span>
            </nav>
            <span class="review-label">REVIEW SESSION</span>
          </div>
          <div class="review-content">
            <aside class="files">
              <span class="list-label">WORKING TREE</span
              ><button
                v-for="(file, i) in active.files"
                :key="file"
                :class="{ selected: currentFile === file }"
                @click="positions[activeId] = file"
              >
                <span class="file-status">{{ active.changed ? (i === 1 ? 'A' : 'M') : '·' }}</span
                >{{ file }}
              </button>
              <div class="saved-note">
                <span class="save-dot"></span> Position saved per repository
              </div>
            </aside>
            <div class="diff">
              <header>{{ currentFile }}<span>+6 −2</span></header>
              <div class="code">
                <div class="muted-code">@@ review preview · illustrative code @@</div>
                <div><i>18</i> <em>export function</em> createWorkspace() {</div>
                <div><i>19</i> <em>const</em> current = ref(null)</div>
                <div class="removed"><i>20</i> − const position = ref(0)</div>
                <div class="added"><i>20</i> + const positions = new Map()</div>
                <div class="added"><i>21</i> + const restore = (repo) =&gt; {</div>
                <div class="added"><i>22</i> + return positions.get(repo.path)</div>
                <div class="added"><i>23</i> + }</div>
                <div><i>24</i> <em>return</em> { current, restore }</div>
                <div><i>25</i> }</div>
              </div>
              <div class="review-bottom">
                <span>● {{ active.branch }}</span
                ><span>{{ active.profile }} / {{ active.name }}</span>
              </div>
            </div>
          </div>
        </main>
      </div>
      <div class="statusbar" role="status">
        {{ announcement || 'Sample session ready. Open the repo switcher to explore.'
        }}<span>LOCAL DEMO</span>
      </div>
    </section>
    <footer class="lab-footer">
      <p>
        <strong>{{ currentConcept.name.split(' / ')[1] }}</strong>
        {{
          concept === 'dropdown'
            ? 'Best for keeping the interface quiet.'
            : concept === 'palette'
              ? 'Best for frequent keyboard-driven switching.'
              : 'Best for moving between several projects throughout the day.'
        }}
      </p>
      <span>Profiles here group repositories; Git identities are unchanged.</span>
    </footer>
    <div v-if="adding" class="add-overlay" @click.self="adding = false">
      <form class="add-form" @submit.prevent="addRepo">
        <span class="eyebrow">DEMO REPOSITORY</span>
        <h2>Add a sample folder</h2>
        <p>This adds a fictional repository to this preview only.</p>
        <label
          >Folder path<input v-model="newPath" placeholder="~/projects/my-repo" autofocus /></label
        ><label
          >Workspace<select v-model="newProfile">
            <option>Personal</option>
            <option>Work</option>
          </select></label
        >
        <p v-if="pathError" role="alert">{{ pathError }}</p>
        <div>
          <button type="button" @click="adding = false">Cancel</button
          ><button class="primary" type="submit">Add & switch</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style>
:root {
  font-family: 'Inter Variable', Inter, system-ui, sans-serif;
  color: #d9dedb;
  background: #101312;
  font-synthesis: none;
  color-scheme: dark;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
}
button,
input,
select {
  font: inherit;
}
button {
  cursor: pointer;
  color: inherit;
}
button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid #b8d89c;
  outline-offset: 3px;
}
button {
  border: 0;
  background: none;
}
button:disabled {
  cursor: default;
}
.lab {
  max-width: 1460px;
  margin: auto;
  padding: 46px 48px 24px;
}
.lab-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}
.eyebrow {
  font-size: 10px;
  letter-spacing: 2px;
  color: #9daa9f;
  font-weight: 650;
}
h1 {
  font-size: 32px;
  font-weight: 500;
  letter-spacing: -1.1px;
  margin: 12px 0 10px;
}
.lab-heading p {
  font-size: 13px;
  color: #939f97;
  margin: 0;
}
.demo-badge {
  font-size: 11px;
  color: #a0aaa3;
  border: 1px solid #354038;
  padding: 8px 12px;
  border-radius: 30px;
}
.concepts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.concepts button {
  text-align: left;
  padding: 18px 20px;
  border: 1px solid #303932;
  background: #171c19;
  border-radius: 10px;
}
.concepts button.chosen {
  background: #232d23;
  border-color: #819973;
}
.concepts strong {
  display: block;
  font-size: 14px;
  font-weight: 550;
  color: #d3e3c5;
  margin-bottom: 9px;
}
.concepts span {
  font-size: 12px;
  color: #95a196;
  line-height: 1.5;
}
.study-note {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  font-size: 11px;
  color: #9aa69e;
  padding: 20px 0;
  line-height: 1.6;
}
.study-note p {
  margin: 0;
  max-width: 660px;
}
.study-note > span {
  color: #6f7d73;
  text-align: right;
}
.workstation {
  position: relative;
  border: 1px solid #3a443d;
  border-radius: 12px;
  background: #181d1a;
  box-shadow: 0 24px 80px #0004;
  overflow: hidden;
}
.appbar {
  height: 62px;
  border-bottom: 1px solid #323c34;
  display: flex;
  align-items: center;
  padding: 0 22px;
  gap: 16px;
  background: #1d2420;
}
.wordmark {
  font-size: 23px;
  font-weight: 700;
  letter-spacing: -1px;
}
.wordmark-dot {
  color: #b8d89c;
}
.slash {
  color: #556056;
}
.repo-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: #2a342c;
  border: 1px solid #414e3f;
  border-radius: 7px;
  font-size: 13px;
}
.repo-trigger img {
  width: 25px;
  height: 25px;
}
.chevron {
  margin-left: 12px;
  color: #a1b299;
}
.branch {
  font:
    11px 'JetBrains Mono',
    monospace;
  color: #90a48e;
}
.appbar-end {
  margin-left: auto;
  font-size: 11px;
  color: #a8b4ab;
  display: flex;
  align-items: center;
  gap: 20px;
}
kbd {
  font:
    10px 'JetBrains Mono',
    monospace;
  color: #839287;
  border: 1px solid #455046;
  border-radius: 4px;
  padding: 3px 5px;
}
.work-area {
  display: flex;
  min-height: 510px;
  position: relative;
}
.review {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.review-header {
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid #2b342d;
  font-size: 12px;
}
.review-header nav {
  display: flex;
  gap: 28px;
  color: #7c8b80;
}
.selected-tab {
  color: #d1dfc7;
}
.selected-tab b {
  font-size: 10px;
  font-weight: 400;
  background: #354232;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 6px;
}
.review-label {
  font-size: 9px;
  letter-spacing: 1.8px;
  color: #657368;
}
.review-content {
  display: flex;
  flex: 1;
  min-width: 0;
}
.files {
  width: 215px;
  flex-shrink: 0;
  padding: 22px 12px;
  position: relative;
  border-right: 1px solid #2d362f;
}
.list-label {
  font-size: 9px;
  letter-spacing: 1.4px;
  color: #8d9c90;
  display: flex;
  justify-content: space-between;
  padding: 0 10px;
  margin-bottom: 12px;
}
.files button {
  display: flex;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 11px 8px;
  font-size: 11px;
  color: #9ba89f;
  border-radius: 4px;
}
.files button.selected {
  background: #28342a;
  color: #daead2;
}
.file-status {
  font-size: 10px;
  color: #b7ca90;
}
.saved-note {
  position: absolute;
  bottom: 20px;
  left: 20px;
  font-size: 9px;
  color: #76877a;
}
.save-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  background: #7c9971;
  border-radius: 50%;
  margin-right: 4px;
}
.diff {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.diff > header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 22px;
  font-size: 11px;
  border-bottom: 1px solid #2a342c;
  color: #b0bcb2;
}
.diff > header span {
  color: #99b38b;
  font: 10px monospace;
}
.code {
  padding: 20px 0;
  font:
    12px/2.25 'JetBrains Mono',
    monospace;
  overflow: auto;
  flex: 1;
  color: #abbab1;
}
.code > div {
  padding: 0 20px;
  white-space: pre;
  min-width: 440px;
}
.code i {
  font-style: normal;
  color: #617366;
  margin-right: 18px;
  font-size: 10px;
}
.code em {
  font-style: normal;
  color: #a5bfa4;
}
.code .muted-code {
  color: #657c70;
  font-size: 10px;
  margin-bottom: 12px;
}
.added {
  background: #263726;
  color: #bbd8a8;
}
.removed {
  background: #332925;
  color: #bb9890;
}
.review-bottom {
  display: flex;
  justify-content: space-between;
  padding: 20px;
  color: #657c69;
  font-size: 10px;
}
.statusbar {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-top: 1px solid #354036;
  background: #1c241e;
  font-size: 10px;
  color: #9eb292;
}
.statusbar > span {
  font-size: 8px;
  letter-spacing: 1.4px;
  color: #6d806f;
}
.switch-layer {
  z-index: 5;
}
.dropdown .switch-layer {
  position: absolute;
  top: 8px;
  left: 80px;
  width: 380px;
}
.switcher {
  border: 1px solid #4b584b;
  border-radius: 10px;
  background: #232b25;
  box-shadow: 0 20px 60px #0008;
  overflow: hidden;
}
.switch-heading {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  font-size: 11px;
  font-weight: 550;
  color: #c5d0c2;
}
.quiet {
  font-size: 22px;
  color: #889b88;
  padding: 0 5px;
}
.search {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 14px 12px;
  padding: 10px 12px;
  background: #19221b;
  border: 1px solid #4e6149;
  border-radius: 6px;
  color: #99b08c;
}
.search input {
  width: 100%;
  min-width: 0;
  background: none;
  border: 0;
  color: #dce5d7;
  font-size: 12px;
  outline: none;
}
.search input::placeholder {
  color: #84947e;
}
.search kbd {
  border: 0;
  padding: 0;
}
.profile-tabs {
  display: flex;
  gap: 4px;
  margin: 0 14px 18px;
  border-bottom: 1px solid #3b483c;
  padding-bottom: 8px;
}
.profile-tabs button {
  font-size: 11px;
  border-radius: 5px;
  padding: 7px 10px;
  color: #91a08e;
  display: flex;
  align-items: center;
  gap: 7px;
}
.profile-tabs .chosen {
  background: #3b4a36;
  color: #dcebd1;
}
.profile-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #c1bc89;
}
.profile-dot.work {
  background: #a7b5d3;
}
.repo-list {
  padding: 0 8px 12px;
  max-height: 320px;
  overflow: auto;
  flex: 1;
  min-width: 0;
}
.repo-row {
  display: flex;
  align-items: center;
  border-radius: 6px;
  margin: 3px 0;
  position: relative;
}
.repo-row.highlighted {
  background: #35432f;
}
.repo-select {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px;
  flex: 1;
  min-width: 0;
  text-align: left;
}
.repo-select img {
  width: 35px;
  height: 35px;
  flex-shrink: 0;
  background: #18211a;
  border-radius: 6px;
}
.repo-copy {
  flex: 1;
  min-width: 0;
}
.repo-copy strong {
  font-size: 12px;
  font-weight: 550;
  display: flex;
  align-items: center;
  gap: 8px;
}
.repo-copy small {
  display: block;
  color: #8b9e87;
  font-size: 10px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  margin-top: 5px;
}
.active-dot {
  width: 5px;
  height: 5px;
  background: #c9e5a2;
  border-radius: 50%;
}
.change-count {
  font: 10px monospace;
  color: #c9caa1;
  background: #414934;
  padding: 3px 5px;
  border-radius: 3px;
}
.change-count.clean {
  background: none;
  color: #87a181;
}
.pin {
  color: #91a27e;
  font-size: 14px;
  padding: 12px 9px 12px 0;
}
.pin[aria-pressed='true'] {
  color: #d0cd97;
}
.switch-footer {
  border-top: 1px solid #3c493c;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #8fa285;
  font-size: 10px;
  gap: 10px;
}
.switch-footer button {
  font-size: 11px;
  color: #c4d4b6;
  padding: 4px 0;
}
.switch-footer > span {
  font: 9px monospace;
}
.empty {
  padding: 35px 12px;
  font-size: 12px;
  color: #c4d4b6;
}
.empty small {
  display: block;
  margin-top: 10px;
  color: #8b9e87;
}
.palette .switch-layer {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.backdrop {
  position: absolute;
  inset: 0;
  background: #0b100c99;
  backdrop-filter: blur(3px);
  width: 100%;
  height: 100%;
  cursor: default;
}
.palette .switcher {
  position: relative;
  width: 750px;
  max-width: 100%;
}
.picker-body {
  display: flex;
}
.landing {
  width: 260px;
  background: #1b241d;
  border-left: 1px solid #3e4b3b;
  padding: 18px 24px;
  flex-shrink: 0;
}
.landing > .eyebrow {
  font-size: 8px;
  display: block;
}
.landing > img {
  width: 56px;
  height: 56px;
  margin-top: 12px;
}
.landing h2 {
  font-size: 19px;
  font-weight: 500;
  margin: 5px 0;
}
.landing p {
  font-size: 10px;
  color: #8ea285;
  margin: 6px 0 18px;
}
.landing dl {
  font-size: 10px;
  margin: 0;
}
.landing dt {
  color: #789071;
  margin-bottom: 5px;
}
.landing dd {
  margin: 0 0 12px;
  color: #becfb4;
  overflow-wrap: anywhere;
}
.primary {
  background: #b9d59a;
  color: #21311b;
  border-radius: 5px;
  font-size: 11px;
  padding: 10px 13px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.landing .primary {
  width: 100%;
  margin-top: 16px;
}
.palette .repo-list {
  max-height: 305px;
}
.palette .profile-tabs {
  margin-bottom: 12px;
}
.palette .switch-heading {
  height: 38px;
}
.rail .switch-layer {
  width: 268px;
  flex-shrink: 0;
  z-index: 1;
}
.rail .switcher {
  height: 100%;
  border: 0;
  border-right: 1px solid #3e4d3c;
  border-radius: 0;
  box-shadow: none;
  display: flex;
  flex-direction: column;
}
.rail .picker-body {
  flex: 1;
}
.rail .repo-list {
  max-height: none;
  padding: 8px;
}
.rail .switch-footer > span {
  display: none;
}
.rail .repo-select {
  gap: 7px;
  padding: 10px 7px;
}
.rail .repo-select img {
  width: 29px;
  height: 29px;
}
.rail .files {
  width: 175px;
}
.space-rail {
  width: 64px;
  flex-shrink: 0;
  background: #141d16;
  border-right: 1px solid #364531;
  display: flex;
  align-items: center;
  flex-direction: column;
  padding: 14px 6px;
  gap: 15px;
}
.space-rail button {
  width: 50px;
  padding: 8px 0;
  color: #7f967a;
  border-radius: 7px;
}
.space-rail button.chosen {
  background: #35472f;
  color: #d2e7bf;
}
.space-rail button > span {
  font-size: 24px;
  display: block;
}
.space-rail small {
  font-size: 8px;
}
.rail-bottom {
  margin-top: auto;
  font-size: 8px;
  letter-spacing: 1px;
  color: #687f63;
}
.count {
  font: 10px monospace;
  color: #9cb18b;
}
.lab-footer {
  display: flex;
  justify-content: space-between;
  gap: 25px;
  font-size: 11px;
  color: #8f9e91;
  margin-top: 22px;
  line-height: 1.8;
}
.lab-footer p {
  margin: 0;
}
.lab-footer strong {
  color: #c4d3b9;
  margin-right: 12px;
  font-weight: 500;
}
.lab-footer > span {
  font-size: 10px;
  color: #6f8073;
}
.add-overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  background: #080d0bcc;
  backdrop-filter: blur(6px);
  padding: 20px;
}
.add-form {
  width: 400px;
  max-width: 100%;
  padding: 28px;
  background: #232b25;
  border: 1px solid #4b584b;
  border-radius: 12px;
}
.add-form h2 {
  font-size: 22px;
  font-weight: 500;
}
.add-form p {
  font-size: 12px;
  color: #9bad96;
  line-height: 1.6;
}
.add-form label {
  display: block;
  font-size: 12px;
  margin-top: 20px;
  color: #b3c4aa;
}
.add-form input,
.add-form select {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid #506047;
  border-radius: 5px;
  background: #19221b;
  color: #dce5d7;
}
.add-form > div {
  display: flex;
  justify-content: flex-end;
  gap: 15px;
  margin-top: 25px;
  font-size: 12px;
}
@media (min-width: 1400px) {
  .work-area {
    min-height: 560px;
  }
  .palette .switcher {
    width: 790px;
  }
  .palette .repo-list {
    max-height: 350px;
  }
}
@media (max-width: 1000px) {
  .lab {
    padding: 28px 22px;
  }
  .lab-heading {
    align-items: flex-start;
    gap: 20px;
  }
  .demo-badge {
    white-space: nowrap;
  }
  .concepts button {
    padding: 14px;
  }
  .rail .files {
    display: none;
  }
  .branch {
    display: none;
  }
  .review-label {
    display: none;
  }
  .study-note > span {
    max-width: 210px;
  }
  .lab-footer > span {
    max-width: 230px;
  }
  .landing {
    width: 225px;
  }
  .rail .switch-layer {
    width: 245px;
  }
}
@media (max-width: 650px) {
  .lab {
    padding: 24px 12px;
  }
  .lab-heading {
    display: block;
  }
  .demo-badge {
    display: inline-block;
    margin-top: 18px;
  }
  h1 {
    font-size: 27px;
  }
  .concepts {
    gap: 6px;
  }
  .concepts button {
    padding: 13px 9px;
  }
  .concepts strong {
    font-size: 12px;
    margin: 0;
  }
  .concepts span {
    display: none;
  }
  .study-note {
    font-size: 11px;
    padding: 15px 0;
  }
  .study-note > span {
    display: none;
  }
  .appbar {
    padding: 0 10px;
    gap: 8px;
  }
  .appbar-end {
    font-size: 9px;
  }
  .appbar-end kbd {
    display: none;
  }
  .repo-trigger {
    font-size: 11px;
    padding: 5px;
    gap: 5px;
  }
  .repo-trigger img {
    width: 20px;
    height: 20px;
  }
  .chevron {
    margin-left: 3px;
  }
  .work-area {
    min-height: 490px;
  }
  .dropdown .switch-layer {
    left: 8px;
    right: 8px;
    width: auto;
  }
  .files {
    display: none;
  }
  .review-header {
    padding: 0 15px;
  }
  .review-header nav {
    gap: 20px;
  }
  .palette .switch-layer {
    padding: 10px;
  }
  .landing {
    display: none;
  }
  .review-bottom {
    font-size: 8px;
    gap: 8px;
  }
  .statusbar {
    font-size: 9px;
    height: 42px;
    line-height: 1.5;
    gap: 10px;
  }
  .statusbar > span {
    display: none;
  }
  .rail .switch-layer {
    width: calc(100% - 56px);
  }
  .rail .review {
    display: none;
  }
  .space-rail {
    width: 56px;
  }
  .lab-footer {
    display: block;
  }
  .lab-footer > span {
    display: block;
    margin-top: 12px;
  }
  .code {
    font-size: 10px;
  }
  .code > div {
    padding: 0 12px;
  }
}
</style>
