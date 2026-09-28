import { reactive } from 'vue'
import { ConflictDocument, ConflictVersion, ConflictWorkspace } from '../../bindings/github.com/atterpac/ichi/desktop/services/models'
import { hasConflictMarkers } from './conflictRegions'

// Each mounted demo owns its data. This adapter never calls the Git backend.
export function createConflictDemo() {
  const root = '/demo/ichi'
  const samples = [
    { path: 'src/theme.ts', before: 'export const theme = {\n', current: '  accent: "violet",\n', incoming: '  accent: "blue",\n', after: '  density: "compact",\n}\n' },
    { path: 'README.md', before: '# Ichi\n\n', current: 'A fast Git workspace.\n', incoming: 'A thoughtful home for your Git projects.\n', after: '\n## Getting started\nOpen a repository to begin.\n' },
  ]
  const documents = new Map<string, ConflictDocument>()
  const staged = reactive<Record<string, string>>({})
  const state = reactive({ data: new ConflictWorkspace(), loading: false, error: '' })
  function reset() {
    documents.clear()
    for (const path of Object.keys(staged)) delete staged[path]
    for (const sample of samples) {
      const version = (content: string) => new ConflictVersion({ Exists: true, Editable: true, Mode: '100644', Content: sample.before + content + sample.after })
      documents.set(sample.path, new ConflictDocument({
        RepoPath: root, Path: sample.path, Token: sample.path, MarkerSize: 7,
        Exists: true, Editable: true, Base: version(''), Current: version(sample.current), Incoming: version(sample.incoming),
        Result: `${sample.before}<<<<<<< HEAD\n${sample.current}=======\n${sample.incoming}>>>>>>> feature/workspace\n${sample.after}`,
      }))
    }
    state.data = new ConflictWorkspace({
      RepoPath: root, Token: 'demo', Kind: 'rebase', Branch: 'feature/workspace', Onto: 'main',
      CurrentLabel: 'Rebased version (HEAD)', IncomingLabel: 'Commit being replayed',
      Commit: 'a1b2c3d4', Subject: 'Refine workspace appearance', Author: 'Alex Chen',
      OriginalHead: 'f6e5d4c3', Step: 2, Total: 3,
      Files: samples.map(s => ({ Path: s.path, Kind: 'Both modified' })), Staged: [],
      Steps: [{ Hash: '1122334', Subject: 'Add workspace layout', State: 'done' }, { Hash: 'a1b2c3d4', Subject: 'Refine workspace appearance', State: 'current' }, { Hash: '5566778', Subject: 'Update documentation', State: 'pending' }],
    })
  }
  reset()
  return {
    state, staged, reset, refresh: async () => {},
    async LoadConflict(_root: string, path: string) {
      const doc = documents.get(path)
      if (!doc) throw new Error('Demo file not found.')
      return new ConflictDocument(doc)
    },
    async ResolveConflict(_root: string, path: string, _token: string, choice: string, content: string) {
      const doc = documents.get(path)!
      const result = choice === 'current' ? doc.Current.Content : choice === 'incoming' ? doc.Incoming.Content : content
      if (hasConflictMarkers(result)) throw new Error('Resolve all markers before staging.')
      staged[path] = result
      state.data.Files = state.data.Files.filter(f => f.Path !== path)
      state.data.Staged.push(path)
    },
    async ControlConflict(_root: string, _token: string, action: string) {
      if (action === 'continue' && state.data.Files.length) throw new Error('Resolve the remaining files first.')
      state.data.Kind = ''
      state.data.Files = []
      state.data.Step = 3
      if (action !== 'continue') {
        for (const path of Object.keys(staged)) delete staged[path]
        state.data.Staged = []
      }
    },
  }
}
