<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RepoService } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import { useWorkspaces, type WorkspaceRepo } from '../../composables/useWorkspaces'
import { useRepoStatus, switchRepository } from '../../composables/useRepoStatus'
import { usePreferenceBindings } from '../../customization/usePreferences'
import { placeholderSvg } from '../common/avatarPlaceholder'
import { useGitProfiles } from '../../composables/useGitProfiles'
import { repoSwitchBlocker } from '../../composables/useRepoSwitchGuard'
import { PhCaretDown, PhMagnifyingGlass, PhStar, PhGearSix, PhPlus } from '@phosphor-icons/vue'
const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ settings: []; opened: [] }>()
const profiles = useGitProfiles()
const ws = useWorkspaces()
const status = useRepoStatus()
const settings = usePreferenceBindings()
const open = ref(false)
const query = ref('')
const filter = ref('')
const cursor = ref(0)
const error = ref('')
const host = ref<HTMLElement>()
const input = ref<HTMLInputElement>()
const trigger = ref<HTMLButtonElement>()
const active = computed(() => ws.state.repos.find((r) => r.path === status.info?.Path))
const rows = computed(() =>
  ws.state.repos
    .filter(
      (r) =>
        (!filter.value || r.workspace === filter.value) &&
        `${r.name} ${r.path}`.toLowerCase().includes(query.value.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.lastOpened - a.lastOpened ||
        a.name.localeCompare(b.name),
    ),
)
const currentWorkspace = computed(() =>
  ws.state.workspaces.find((w) => w.id === active.value?.workspace),
)
function image(path: string) {
  return `data:image/svg+xml,${encodeURIComponent(placeholderSvg(path, settings['appearance.avatarPlaceholder']))}`
}
function close() {
  if (status.switching) return
  open.value = false
  trigger.value?.focus()
}
async function show() {
  if (props.disabled || status.switching) return
  open.value = true
  emit('opened')
  error.value = ''
  await nextTick()
  input.value?.focus()
}
function toggle() {
  if (open.value) close()
  else void show()
}
function manage() {
  close()
  emit('settings')
}
async function choose(repo: WorkspaceRepo) {
  if (status.switching) return
  if (repo.path === status.info?.Path) {
    close()
    return
  }
  error.value = repoSwitchBlocker()
  if (error.value) return
  try {
    await profiles.ready()
    const info = await switchRepository(repo.path)
    void profiles.effective()
    ws.openedRepo(repo.path, info.Path, info.Name)
    close()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
function keys(e: KeyboardEvent) {
  if (
    (e.ctrlKey || e.metaKey) &&
    e.key.toLowerCase() === 'r' &&
    !props.disabled &&
    !document.querySelector('[aria-modal="true"]')
  ) {
    e.preventDefault()
    e.stopImmediatePropagation()
    toggle()
    return
  }
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopImmediatePropagation()
    close()
    return
  }
  if (!host.value?.contains(e.target as Node)) return
  if (
    e.key === 'ArrowDown' ||
    e.key === 'ArrowUp' ||
    (!(e.target instanceof HTMLInputElement) && ['j', 'k'].includes(e.key))
  ) {
    e.preventDefault()
    e.stopImmediatePropagation()
    const delta = e.key === 'ArrowUp' || e.key === 'k' ? -1 : 1
    cursor.value = Math.max(0, Math.min(rows.value.length - 1, cursor.value + delta))
    void nextTick(() =>
      host.value?.querySelector('.pocket-row.highlighted')?.scrollIntoView({ block: 'nearest' }),
    )
  } else if (e.key === 'Enter' && e.target === input.value) {
    e.preventDefault()
    e.stopImmediatePropagation()
    const row = rows.value[cursor.value]
    if (row) void choose(row)
  }
}
function outside(e: PointerEvent) {
  if (open.value && !host.value?.contains(e.target as Node)) open.value = false
}
function focusOutside(e: FocusEvent) {
  if (open.value && !host.value?.contains(e.target as Node)) open.value = false
}
watch([query, filter], () => {
  cursor.value = 0
})
watch(
  () => ws.state.workspaces.map((w) => w.id),
  (ids) => {
    if (!ids.includes(filter.value)) filter.value = ''
  },
)
watch(
  () => status.info,
  (info) => {
    if (info) ws.rememberRepo(info.Path, info.Name)
  },
  { immediate: true },
)
onMounted(async () => {
  window.addEventListener('keydown', keys, true)
  window.addEventListener('pointerdown', outside)
  window.addEventListener('focusin', focusOutside)
  try {
    const saved = await RepoService.ListSavedRepos()
    for (const r of saved || [])
      if (!ws.state.repos.some((existing) => existing.path === r.Path))
        ws.rememberRepo(r.Path, r.Name)
  } catch {
    /* Existing desktop workspaces remain usable when importing TUI bookmarks fails. */
  }
})
onUnmounted(() => {
  window.removeEventListener('keydown', keys, true)
  window.removeEventListener('pointerdown', outside)
  window.removeEventListener('focusin', focusOutside)
})
</script>
<template>
  <div ref="host" class="pocket" @keydown.stop>
    <button
      ref="trigger"
      class="pocket-trigger"
      :disabled="disabled || status.switching"
      aria-label="Switch repository"
      :aria-expanded="open"
      aria-controls="pocket-panel"
      title="Switch repository (Ctrl+R)"
      @click="toggle"
    >
      <img v-if="status.info" :src="image(status.info.Path)" alt="" /><span>{{
        active?.name || status.info?.Name || 'Open repository'
      }}</span
      ><i
        v-if="currentWorkspace"
        :style="{ background: currentWorkspace.color }"
        :title="currentWorkspace.name"
      ></i
      ><PhCaretDown :size="12" />
    </button>
    <section
      v-if="open"
      id="pocket-panel"
      class="pocket-panel"
      aria-label="Repository switcher"
      :aria-busy="status.switching"
    >
      <header><strong>Switch repository</strong><kbd>Ctrl R</kbd></header>
      <label class="pocket-search"
        ><PhMagnifyingGlass :size="16" /><input
          ref="input"
          v-model="query"
          :disabled="status.switching"
          aria-label="Find repository"
          placeholder="Find a repository…"
          autocomplete="off"
          :aria-activedescendant="rows[cursor] ? `pocket-row-${cursor}` : undefined"
      /></label>
      <nav class="pocket-tabs" aria-label="Filter workspace">
        <button :aria-pressed="!filter" @click="filter = ''">All</button
        ><button
          v-for="w in ws.state.workspaces"
          :key="w.id"
          :aria-pressed="filter === w.id"
          @click="filter = w.id"
        >
          <i :style="{ background: w.color }"></i>{{ w.name }}
        </button>
      </nav>
      <div class="pocket-caption">
        {{ query ? 'Matches' : 'Pinned & recent' }}<span>{{ rows.length }}</span>
      </div>
      <div class="pocket-list">
        <div
          v-for="(r, index) in rows"
          :id="`pocket-row-${index}`"
          :key="r.path"
          class="pocket-row"
          :class="{ highlighted: index === cursor }"
          @mouseenter="cursor = index"
        >
          <button
            class="pocket-select"
            :disabled="status.switching"
            :aria-current="r.path === status.info?.Path ? 'true' : undefined"
            @focus="cursor = index"
            @click="choose(r)"
          >
            <img :src="image(r.path)" alt="" /><span
              ><strong
                >{{ r.name
                }}<i v-if="r.path === status.info?.Path" class="pocket-current"></i></strong
              ><small>{{ r.path }}</small></span
            ></button
          ><button
            class="pocket-pin"
            :aria-label="`${r.pinned ? 'Unpin' : 'Pin'} ${r.name}`"
            :aria-pressed="r.pinned"
            @click="r.pinned = !r.pinned"
          >
            <PhStar :size="14" :weight="r.pinned ? 'fill' : 'regular'" />
          </button>
        </div>
        <p v-if="!rows.length" class="pocket-empty">
          {{ query ? 'No matching repositories.' : 'No repositories in this workspace yet.' }}
        </p>
      </div>
      <p v-if="status.switching" class="pocket-message" role="status">Opening repository…</p>
      <p v-if="error || ws.persistence.error" class="pocket-message" role="alert">
        {{ error || ws.persistence.error }}
      </p>
      <footer>
        <button :disabled="status.switching" @click="manage">
          <PhPlus :size="14" /> Add repository</button
        ><button :disabled="status.switching" @click="manage">
          <PhGearSix :size="14" /> Workspaces
        </button>
      </footer>
    </section>
  </div>
</template>
<style scoped>
.pocket {
  --wails-draggable: no-drag;
  white-space: normal;
  position: relative;
  min-width: 0;
}
.pocket-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-raised);
  height: 26px;
  padding: 2px 8px;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  max-width: 270px;
}
.pocket-trigger > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pocket-trigger img {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.pocket-trigger i,
.pocket-tabs i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.pocket-panel {
  position: absolute;
  top: calc(100% + 12px);
  left: 0;
  z-index: 100;
  width: min(380px, calc(100vw - 32px));
  border: 1px solid var(--border-2);
  border-radius: 10px;
  background: var(--surface-overlay);
  color: var(--text);
  box-shadow: 0 18px 55px #0006;
  overflow: hidden;
  max-height: calc(100dvh - 90px);
  overflow-y: auto;
}
.pocket-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  font-size: 12px;
}
.pocket-panel header strong {
  font-weight: 500;
}
.pocket-panel kbd {
  font-size: 10px;
  color: var(--text-mut);
}
.pocket-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface-panel);
  border: 1px solid var(--border-2);
  border-radius: 5px;
  margin: 0 12px 12px;
  padding: 10px;
  color: var(--text-mut);
}
.pocket-search input {
  background: none;
  border: 0;
  outline: none;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  min-width: 0;
  width: 100%;
}
.pocket-search:focus-within {
  border-color: var(--accent);
}
.pocket-tabs {
  display: flex;
  gap: 4px;
  padding: 0 12px 12px;
  overflow: auto;
}
.pocket-tabs button {
  display: flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
  border: 0;
  background: none;
  color: var(--text-mut);
  font-size: 11px;
  padding: 6px 9px;
  border-radius: 5px;
  cursor: pointer;
}
.pocket-tabs button[aria-pressed='true'] {
  color: var(--accent-text);
  background: var(--selected);
}
.pocket-caption {
  display: flex;
  justify-content: space-between;
  padding: 0 20px 8px;
  font-size: 10px;
  color: var(--text-mut);
}
.pocket-list {
  max-height: 300px;
  overflow: auto;
  padding: 0 8px 10px;
}
.pocket-row {
  display: flex;
  border-radius: 6px;
}
.pocket-row.highlighted {
  background: var(--selected);
}
.pocket-select {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  background: none;
  flex: 1;
  min-width: 0;
  text-align: left;
  color: var(--text);
  padding: 10px;
  cursor: pointer;
}
.pocket-select > span {
  min-width: 0;
  flex: 1;
}
.pocket-select img {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}
.pocket-select strong {
  font-weight: 500;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.pocket-select small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-mut);
  font-size: 10px;
  margin-top: 4px;
}
.pocket-current {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent-text);
}
.pocket-pin {
  background: none;
  border: 0;
  color: var(--text-mut);
  padding: 10px;
  cursor: pointer;
}
.pocket-pin[aria-pressed='true'] {
  color: var(--accent-text);
}
.pocket-panel footer {
  display: flex;
  justify-content: space-between;
  border-top: 1px solid var(--border);
  padding: 12px;
}
.pocket-panel footer button {
  display: flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: none;
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
}
.pocket-empty,
.pocket-message {
  font-size: 12px;
  line-height: 1.5;
  padding: 12px;
  color: var(--text-mut);
  margin: 0;
}
.pocket-message[role='alert'] {
  color: var(--danger, #df8b83);
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
