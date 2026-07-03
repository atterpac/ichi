// Primary view navigation: one key per view, grouped for the which-key panel.
// Keys must be unique across all groups — the leader chord is <space> then key.

export interface NavItem {
  id: string
  label: string
  key: string
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Worktree',
    items: [
      { id: 'graph', label: 'Graph', key: 'g' },
      { id: 'status', label: 'Changes', key: 's' },
      { id: 'commit', label: 'Commit', key: 'c' },
      { id: 'conflicts', label: 'Conflicts', key: 'x' },
    ],
  },
  {
    title: 'Refs',
    items: [
      { id: 'branches', label: 'Branches', key: 'b' },
      { id: 'tags', label: 'Tags', key: 't' },
      { id: 'stashes', label: 'Stash', key: 'z' },
    ],
  },
  {
    title: 'Remote',
    items: [
      { id: 'sync', label: 'Sync', key: 'u' },
      { id: 'prs', label: 'Pull Requests', key: 'p' },
      { id: 'remotes', label: 'Remotes', key: 'r' },
    ],
  },
  {
    title: 'Inspect',
    items: [
      { id: 'diff', label: 'Diff', key: 'd' },
      { id: 'blame', label: 'Blame', key: 'a' },
      { id: 'file-log', label: 'File Log', key: 'l' },
      { id: 'finder', label: 'Finder', key: 'f' },
    ],
  },
]

export const NAV_KEY_MAP = new Map<string, string>(
  NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.key, item.id])),
)

if (NAV_KEY_MAP.size !== NAV_GROUPS.reduce((n, g) => n + g.items.length, 0)) {
  throw new Error('nav keys must be unique')
}
