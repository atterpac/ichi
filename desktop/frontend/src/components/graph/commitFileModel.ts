import type { ChangedFile, CommitDetail } from '../../bindings/github.com/atterpac/ichi/internal/git'

type FileModel = { files: ChangedFile[]; indices: Map<string, number> }
const empty: FileModel = { files: [], indices: new Map() }
// The commit cache owns these immutable objects. Weak keys let eviction also
// release their sorted lists and indexes; revisiting avoids sorting them again.
const models = new WeakMap<CommitDetail, FileModel>()
export function commitFileModel(detail: CommitDetail | null): FileModel {
  if (!detail) return empty
  const cached = models.get(detail)
  if (cached) return cached
  const files = [...(detail.Files ?? [])].sort((a, b) => a.Path.localeCompare(b.Path))
  const model = { files, indices: new Map(files.map((file, index) => [file.Path, index])) }
  models.set(detail, model)
  return model
}
