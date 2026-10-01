import { effectScope, reactive, watch, type EffectScope } from 'vue'

export type Workspace = { id: string; name: string; color: string; profileId?: string }
export type WorkspaceRepo = {
  path: string
  name: string
  workspace: string
  pinned: boolean
  lastOpened: number
}
type WorkspaceData = { workspaces: Workspace[]; repos: WorkspaceRepo[]; profileFiles: string[] }
const KEY = 'ichi.desktop.workspaces.v1'
const defaults = (): WorkspaceData => ({
  workspaces: [{ id: 'personal', name: 'Personal', color: '#a9bf87' }],
  repos: [],
  profileFiles: [],
})
function load(): WorkspaceData {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!raw || !Array.isArray(raw.workspaces) || !Array.isArray(raw.repos)) return defaults()
    const workspaces: Workspace[] = raw.workspaces.filter(
      (w: Workspace) =>
        w &&
        typeof w.id === 'string' &&
        w.id &&
        typeof w.name === 'string' &&
        w.name.trim() &&
        /^#[\da-f]{6}$/i.test(w.color),
    )
    if (!workspaces.length) return defaults()
    const repos: WorkspaceRepo[] = raw.repos
      .filter(
        (r: WorkspaceRepo) =>
          r &&
          typeof r.path === 'string' &&
          r.path &&
          typeof r.name === 'string' &&
          workspaces.some((w) => w.id === r.workspace),
      )
      .map((r: WorkspaceRepo) => ({
        ...r,
        pinned: Boolean(r.pinned),
        lastOpened: Number(r.lastOpened) || 0,
      }))
    return {
      workspaces,
      repos,
      profileFiles: Array.isArray(raw.profileFiles)
        ? raw.profileFiles.filter((p: unknown) => typeof p === 'string')
        : [],
    }
  } catch {
    return defaults()
  }
}
// Window-wide saved data. Loading and persistence begin with the app scope,
// never during module evaluation or within a component's effect lifetime.
const state = reactive(defaults())
const persistence = reactive({ error: '' })
let scope: EffectScope | undefined
export function startWorkspaces() {
  if (scope) return
  Object.assign(state, load())
  scope = effectScope(true)
  scope.run(() =>
    watch(
      state,
      () => {
        try {
          localStorage.setItem(KEY, JSON.stringify(state))
          persistence.error = ''
        } catch {
          persistence.error = 'Workspace changes could not be saved on this device.'
        }
      },
      { deep: true, flush: 'sync' },
    ),
  )
}
export function disposeWorkspaces() {
  scope?.stop()
  scope = undefined
  Object.assign(state, defaults())
  persistence.error = ''
}
function addWorkspace(name: string, color: string) {
  name = name.trim()
  if (!name) throw new Error('Enter a workspace name.')
  if (state.workspaces.some((w) => w.name.toLowerCase() === name.toLowerCase()))
    throw new Error('A workspace with that name already exists.')
  const workspace = { id: crypto.randomUUID(), name, color }
  state.workspaces.push(workspace)
  return workspace
}
function updateWorkspace(id: string, name: string, color: string) {
  name = name.trim()
  if (!name) throw new Error('Enter a workspace name.')
  if (state.workspaces.some((w) => w.id !== id && w.name.toLowerCase() === name.toLowerCase()))
    throw new Error('A workspace with that name already exists.')
  const workspace = state.workspaces.find((w) => w.id === id)
  if (workspace) Object.assign(workspace, { name, color })
}
function removeWorkspace(id: string) {
  if (state.workspaces.length === 1) throw new Error('Keep at least one workspace.')
  const remaining = state.workspaces.filter((w) => w.id !== id)
  for (const repo of state.repos) if (repo.workspace === id) repo.workspace = remaining[0]!.id
  state.workspaces = remaining
}
function saveRepo(path: string, name: string, workspace: string, oldPath?: string) {
  path = path.trim().replace(/\/+$/, '') || '/'
  name = name.trim() || path.split('/').pop() || path
  if (!path.startsWith('/') && !path.startsWith('~/'))
    throw new Error('Use an absolute folder path or a path starting with ~/.')
  if (!state.workspaces.some((w) => w.id === workspace)) throw new Error('Choose a workspace.')
  const duplicate = state.repos.find((r) => r.path === path && r.path !== oldPath)
  if (duplicate) throw new Error('That repository is already saved. Edit its workspace below.')
  const existing = state.repos.find((r) => r.path === oldPath)
  if (existing) Object.assign(existing, { path, name, workspace })
  else state.repos.push({ path, name, workspace, pinned: false, lastOpened: 0 })
}
function rememberRepo(path: string, name: string) {
  let repo = state.repos.find((r) => r.path === path)
  if (!repo) {
    repo = { path, name, workspace: state.workspaces[0]!.id, pinned: false, lastOpened: 0 }
    state.repos.push(repo)
  }
  return repo
}
function openedRepo(oldPath: string, path: string, name: string) {
  const saved = state.repos.find((r) => r.path === oldPath)
  const canonical = state.repos.find((r) => r.path === path)
  if (saved && !canonical) saved.path = path
  else if (saved && canonical && saved !== canonical)
    state.repos.splice(state.repos.indexOf(saved), 1)
  const repo = state.repos.find((r) => r.path === path) || rememberRepo(path, name)
  repo.lastOpened = Date.now()
}
export function useWorkspaces() {
  startWorkspaces()
  return {
    state,
    persistence,
    addWorkspace,
    updateWorkspace,
    removeWorkspace,
    saveRepo,
    rememberRepo,
    openedRepo,
  }
}
