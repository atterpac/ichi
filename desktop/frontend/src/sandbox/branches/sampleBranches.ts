export type SampleCommit = {
  id: string
  parent?: string
  message: string
  author: string
  when: string
  x: number
  y: number
}
export type SampleBranch = {
  name: string
  tip: string
  remote?: boolean
  color: string
  pinned: boolean
  activity: string
  files: Record<string, string[]>
}
const base = {
  'src/review/cursor.ts': [
    'export function moveCursor(line: number) {',
    '  return Math.max(0, line)',
    '}',
  ],
  'src/theme/review.css': [
    '.review-row {',
    '  padding: 6px 12px;',
    '  background: transparent;',
    '}',
  ],
  'src/search/index.ts': [
    'export function search(query: string) {',
    '  return files.filter(file => file.includes(query))',
    '}',
  ],
  'src/shell/Workspace.vue': [
    '<template>',
    '  <main class="workspace">',
    '    <slot />',
    '  </main>',
    '</template>',
  ],
}
export const commits: SampleCommit[] = [
  {
    id: 'a10',
    message: 'Introduce the review workspace',
    author: 'Sam',
    when: '3 days ago',
    x: 50,
    y: 95,
  },
  {
    id: 'a11',
    parent: 'a10',
    message: 'Share theme tokens',
    author: 'Mika',
    when: '2 days ago',
    x: 145,
    y: 95,
  },
  {
    id: 'a12',
    parent: 'a11',
    message: 'Simplify pane navigation',
    author: 'You',
    when: 'yesterday',
    x: 245,
    y: 95,
  },
  {
    id: 'm13',
    parent: 'a12',
    message: 'Refine the top bar',
    author: 'Sam',
    when: '5 hours ago',
    x: 345,
    y: 95,
  },
  {
    id: 'm14',
    parent: 'm13',
    message: 'Prepare the next preview',
    author: 'Mika',
    when: '2 hours ago',
    x: 445,
    y: 95,
  },
  {
    id: 'c13',
    parent: 'a12',
    message: 'Add a line-by-line review cursor',
    author: 'You',
    when: '4 hours ago',
    x: 345,
    y: 35,
  },
  {
    id: 'c14',
    parent: 'c13',
    message: 'Keep the selected line in view',
    author: 'You',
    when: '1 hour ago',
    x: 445,
    y: 35,
  },
  {
    id: 'c15',
    parent: 'c14',
    message: 'Quiet the review chrome',
    author: 'You',
    when: '12 minutes ago',
    x: 545,
    y: 35,
  },
  {
    id: 's12',
    parent: 'a11',
    message: 'Index filenames for fuzzy matching',
    author: 'Mika',
    when: 'yesterday',
    x: 245,
    y: 155,
  },
  {
    id: 's13',
    parent: 's12',
    message: 'Rank prefix matches first',
    author: 'Mika',
    when: '3 hours ago',
    x: 345,
    y: 155,
  },
  {
    id: 'f14',
    parent: 'm13',
    message: 'Restore focus after closing a dialog',
    author: 'Sam',
    when: '48 minutes ago',
    x: 445,
    y: 215,
  },
  {
    id: 'r15',
    parent: 'm14',
    message: 'Tag the preview candidate',
    author: 'Sam',
    when: '90 minutes ago',
    x: 545,
    y: 275,
  },
]
export function sampleBranches(): SampleBranch[] {
  return [
    {
      name: 'main',
      tip: 'm14',
      color: '#a5b8e0',
      pinned: true,
      activity: '2h',
      files: { ...base },
    },
    {
      name: 'feature/cursor-review',
      tip: 'c15',
      color: '#c8dc98',
      pinned: true,
      activity: '12m',
      files: {
        ...base,
        'src/review/cursor.ts': [
          'export function moveCursor(line: number, total: number) {',
          '  const next = Math.max(0, Math.min(line, total - 1))',
          '  scrollIntoView(next)',
          '  return next',
          '}',
        ],
        'src/theme/review.css': [
          '.review-row {',
          '  padding: 4px 12px;',
          '  background: var(--review-surface);',
          '  scroll-margin: 24px;',
          '}',
        ],
      },
    },
    {
      name: 'feature/quick-search',
      tip: 's13',
      color: '#c4a4d9',
      pinned: false,
      activity: '3h',
      files: {
        ...base,
        'src/search/index.ts': [
          'export function search(query: string) {',
          '  const matches = fuzzyMatch(files, query)',
          '  return rankByPrefix(matches, query)',
          '}',
        ],
      },
    },
    {
      name: 'fix/pane-focus',
      tip: 'f14',
      color: '#e1b486',
      pinned: false,
      activity: '48m',
      files: {
        ...base,
        'src/shell/Workspace.vue': [
          '<template>',
          '  <main ref="pane" class="workspace" tabindex="0">',
          '    <slot />',
          '  </main>',
          '</template>',
        ],
        'src/shell/focus.ts': [
          'export function restoreFocus(previous: HTMLElement) {',
          '  if (previous.isConnected) previous.focus()',
          '}',
        ],
      },
    },
    {
      name: 'release/0.8',
      tip: 'r15',
      color: '#80c5b4',
      pinned: false,
      activity: '90m',
      files: {
        ...base,
        'CHANGELOG.md': ['# Preview 0.8', '', 'A quieter place to review your work.'],
      },
    },
    {
      name: 'origin/main',
      tip: 'm14',
      remote: true,
      color: '#a5b8e0',
      pinned: false,
      activity: '2h',
      files: { ...base },
    },
  ]
}
export function history(tip: string) {
  const result: SampleCommit[] = []
  let node = commits.find((c) => c.id === tip)
  while (node) {
    result.push(node)
    node = commits.find((c) => c.id === node?.parent)
  }
  return result
}
export function comparison(source: SampleBranch, target: SampleBranch) {
  const a = history(source.tip),
    b = history(target.tip)
  const common = a.find((c) => b.some((other) => other.id === c.id))!
  return {
    source: a.filter((c) => !b.some((other) => other.id === c.id)),
    target: b.filter((c) => !a.some((other) => other.id === c.id)),
    common,
  }
}
export function fileChanges(source: SampleBranch, target: SampleBranch) {
  return [...new Set([...Object.keys(source.files), ...Object.keys(target.files)])]
    .sort()
    .flatMap((path) => {
      const before = target.files[path] || [],
        after = source.files[path] || []
      if (JSON.stringify(before) === JSON.stringify(after)) return []
      return [
        {
          path,
          before,
          after,
          added: after.filter((line) => !before.includes(line)).length,
          removed: before.filter((line) => !after.includes(line)).length,
        },
      ]
    })
}
