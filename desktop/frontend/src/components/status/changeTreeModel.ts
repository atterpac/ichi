import { FileStatus, type StatusEntry } from '../../bindings/github.com/atterpac/ichi/internal/git'
import { fileStatusPresentation } from '../common/fileStatusPresentation'

export type ChangeRow = {
  key: string
  path: string
  oldPath: string
  name: string
  dir: string
  staged: boolean
  untracked: boolean
  conflict: boolean
  status: FileStatus
  label: string
}

function toRow(entry: StatusEntry, staged: boolean, conflict = false): ChangeRow {
  const name = entry.Path.split('/').pop() ?? entry.Path
  const status = conflict ? FileStatus.FileConflict : staged ? entry.IndexStatus : entry.IsUntracked ? FileStatus.FileUntracked : entry.WorkStatus
  return {
    key: `${conflict ? 'c' : staged ? 's' : 'u'}:${entry.Path}`,
    path: entry.Path,
    oldPath: entry.OldPath,
    name,
    dir: entry.Path.slice(0, entry.Path.length - name.length).replace(/\/$/, ''),
    staged,
    untracked: entry.IsUntracked,
    conflict,
    status,
    label: fileStatusPresentation(status).code,
  }
}

export function changeRows(entries: StatusEntry[]) {
  return {
    conflicts: entries.filter(entry => entry.IsConflict).map(entry => toRow(entry, false, true)),
    unstaged: entries.filter(entry => !entry.IsConflict && (entry.IsUntracked || entry.WorkStatus !== FileStatus.FileUnchanged)).map(entry => toRow(entry, false)),
    staged: entries.filter(entry => !entry.IsConflict && !entry.IsUntracked && entry.IndexStatus !== FileStatus.FileUnchanged).map(entry => toRow(entry, true)),
  }
}
export type SectionId = 'conflicts' | 'unstaged' | 'staged'
type FileItem = { row: ChangeRow; index: number }
type TreeItem =
  | { kind: 'dir'; dir: string; label: string; key: string; collapsed: boolean; count: number; depth: number; parentKey: string }
  | (FileItem & { kind: 'file'; key: string; depth: number; parentKey: string })
type DirectoryNode = { path: string; name: string; children: Map<string, DirectoryNode>; files: ChangeRow[]; count: number }
export type SectionVM = {
  id: SectionId
  label: string
  count: number
  collapsed: boolean
  bulk: 'stage' | 'unstage' | null
  groups: TreeItem[] | null
  flat: FileItem[] | null
}

export function buildChangeList(groups: ReturnType<typeof changeRows>, options: {
  grouped: boolean; collapsedSections: ReadonlySet<SectionId>; collapsedDirs: ReadonlySet<string>
}) {
  const sections: SectionVM[] = []
  const visible: ChangeRow[] = []

  const buildSection = (
    id: SectionId,
    label: string,
    sectionRows: ChangeRow[],
    bulk: SectionVM['bulk'],
  ) => {
    if (!sectionRows.length && id === 'conflicts') return
    const collapsed = options.collapsedSections.has(id)
    const vm: SectionVM = {
      id,
      label,
      count: sectionRows.length,
      collapsed,
      bulk,
      groups: null,
      flat: null,
    }
    if (!collapsed) {
      if (options.grouped && id !== 'conflicts') {
        const root: DirectoryNode = { path: '', name: '.', children: new Map(), files: [], count: 0 }
        for (const row of sectionRows) {
          let node = root
          node.count++
          for (const name of row.dir.split('/').filter(Boolean)) {
            if (!node.children.has(name)) node.children.set(name, {
              path: node.path ? `${node.path}/${name}` : name,
              name, children: new Map(), files: [], count: 0,
            })
            node = node.children.get(name)!
            node.count++
          }
          node.files.push(row)
        }
        const tree: TreeItem[] = []
        const appendDirectory = (initial: DirectoryNode, depth: number, parentKey: string) => {
          let node = initial
          let label = node.name
          // Compact directory-only chains without hiding a branch or direct file.
          while (!node.files.length && node.children.size === 1) {
            node = [...node.children.values()][0]!
            label += `/${node.name}`
          }
          const dir = node.path || '.'
          const key = `${id}:${dir}`
          const collapsed = options.collapsedDirs.has(key)
          tree.push({ kind: 'dir', dir, label, key, collapsed, count: node.count, depth, parentKey })
          if (collapsed) return
          for (const child of [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
            appendDirectory(child, depth + 1, `dir:${key}`)
          }
          for (const row of [...node.files].sort((a, b) => a.name.localeCompare(b.name))) {
            tree.push({ kind: 'file', row, index: visible.length, key: row.key, depth: depth + 1, parentKey: `dir:${key}` })
            visible.push(row)
          }
        }
        for (const child of [...root.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
          appendDirectory(child, 0, `section:${id}`)
        }
        // Repository-root files follow every directory, in their own fold.
        if (root.files.length) appendDirectory({ ...root, children: new Map(), count: root.files.length }, 0, `section:${id}`)
        vm.groups = tree
      } else {
        vm.flat = sectionRows.map((row) => {
          const item = { row, index: visible.length }
          visible.push(row)
          return item
        })
      }
    }
    sections.push(vm)
  }

  buildSection('conflicts', 'Conflicts', groups.conflicts, null)
  buildSection('unstaged', 'Unstaged', groups.unstaged, 'stage')
  buildSection('staged', 'Staged', groups.staged, 'unstage')
  return { sections, visible }
}

export function indexPaths(rows: ChangeRow[]) {
  return [...new Set(rows.flatMap(row => row.status === FileStatus.FileRenamed && row.oldPath
    ? [row.oldPath, row.path] : [row.path]))]
}


export function changeTreeScope(key: string | null, groups: ReturnType<typeof changeRows>) {
  const match = /^(section|dir):(conflicts|unstaged|staged)(?::(.*))?$/.exec(key ?? '')
  if (!match) return null
  const section = match[2] as SectionId
  const dir = match[3]
  const source = section === 'conflicts' ? groups.conflicts : section === 'staged' ? groups.staged : groups.unstaged
  const targets = source.filter(row => match[1] === 'section' || (dir === '.' ? !row.dir : row.path.startsWith(`${dir}/`)))
  return { section, dir, targets, path: dir === '.' ? 'Repository root' : dir ?? (section === 'staged' ? 'Staged' : section === 'unstaged' ? 'Unstaged' : 'Conflicts') }
}


/** Prefer the same section and nearest surviving neighbour after a mutation. */
export function fallbackChangeKey(previous: ChangeRow[], current: ChangeRow[], key?: string) {
  const oldIndex = previous.findIndex(row => row.key === key)
  const oldRow = previous[oldIndex]
  const candidates = oldRow ? [...previous.slice(oldIndex + 1), ...previous.slice(0, oldIndex).reverse()]
    .filter(row => row.staged === oldRow.staged && row.conflict === oldRow.conflict).map(row => row.key) : []
  const surviving = new Set(current.map(row => row.key))
  return [key, ...candidates].find(candidate => candidate !== undefined && surviving.has(candidate))
}
