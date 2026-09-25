import { reactive } from 'vue'

// Session-only history. Recent files are shown only when present in the current repository.
export const finderHistory = reactive({ searches: [] as string[], files: [] as string[] })
export function rememberFind(query: string, mode: string, file?: string) {
  const prefix: Record<string, string> = { branch: 'b:', commit: 'c:', file: 'f:', view: 'v:', repo: 'r:', workspace: 'w:', profile: 'p:' }
  if (query.trim()) {
    const search = (prefix[mode] ?? '') + query.trim()
    finderHistory.searches = [search, ...finderHistory.searches.filter(value => value !== search)].slice(0, 6)
  }
  if (file) finderHistory.files = [file, ...finderHistory.files.filter(value => value !== file)].slice(0, 6)
}
