import type { Commit } from '../../bindings/github.com/atterpac/ichi/internal/git'

/** Follow first-parent history, keeping shared history on the preferred branch. */
export function branchLabels(commits: Commit[], currentBranch: string): Map<string, string> {
  const byHash = new Map(commits.map((commit) => [commit.Hash, commit]))
  const labels = new Map<string, string>()
  const tips = commits.flatMap((commit) =>
    (commit.Decorations ?? [])
      .filter((ref) => ref.Kind === 'branch' || ref.Kind === 'remote')
      .map((ref) => ({
        hash: commit.Hash,
        name: ref.Name,
        priority: ref.Name === currentBranch ? 0 : ref.Kind === 'branch' ? 1 : 2,
      })),
  ).sort((a, b) => a.priority - b.priority)

  // Preserve explicit tips even when one branch's history passes another tip.
  for (const tip of tips) {
    if (!labels.has(tip.hash)) labels.set(tip.hash, tip.name)
  }
  const visited = new Set<string>()
  for (const tip of tips) {
    let hash: string | undefined = tip.hash
    while (hash && !visited.has(hash)) {
      visited.add(hash)
      if (!labels.has(hash)) labels.set(hash, tip.name)
      hash = byHash.get(hash)?.Parents?.[0]
    }
  }
  if (currentBranch) labels.set('__ichi_working_changes__', currentBranch)
  return labels
}
