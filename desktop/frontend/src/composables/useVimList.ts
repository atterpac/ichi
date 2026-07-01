/**
 * useVimList — generic vim-style keyboard navigation over any reactive list.
 *
 * The whole point: vim normal-mode is a tiny grammar —
 *     [count][operator][count][motion]
 * and over a list the "buffer" is just an index into an array. So we run a
 * small state machine that accumulates keystrokes until a command completes,
 * then either moves the cursor or fires an action with the affected range.
 *
 * The composable owns: cursor, visual selection, counts, pending operator,
 * registers (yank), marks, and search. The HOST owns the data — actions like
 * delete/paste are dispatched via onAction so the app mutates its own list.
 *
 * Drop-in: works over commit rows, diff lines, file trees, anything indexable.
 */
import { computed, onUnmounted, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

export type VimMode = 'normal' | 'visual'

export interface VimActionPayload<T> {
  /** affected indices (single line, visual range, or operator+motion range) */
  indices: number[]
  /** the affected items */
  items: T[]
  cursor: number
  /** current yank register contents */
  register: T[]
}

export type VimAction = 'delete' | 'yank' | 'change' | 'paste' | 'open' | string

export interface VimApi<T> {
  cursor: Ref<number>
  mode: Ref<VimMode>
  /** [lo, hi] inclusive when something is selected, else null */
  selection: Ref<[number, number] | null>
  isSelected: (i: number) => boolean
  /** live "command line" state, handy for a status bar */
  count: Ref<string>
  pending: Ref<string>
  register: Ref<T[]>
  marks: Ref<Record<string, number>>
  search: { active: Ref<boolean>; query: Ref<string>; dir: Ref<1 | -1> }
  /** feed it a keydown; returns true if the key was consumed */
  handleKey: (e: KeyboardEvent) => boolean
  /** imperative helpers (also reusable from custom bindings) */
  moveTo: (i: number) => void
  setItems?: never
}

export interface VimOptions<T> {
  initial?: number
  /** wrap cursor at the ends */
  loop?: boolean
  /** rows per Ctrl-f / half that for Ctrl-d */
  pageSize?: MaybeRefOrGetter<number>
  /** text used for / search matching */
  text?: (item: T) => string
  /** fired for d / y / c / p / Enter (open) and any custom action */
  onAction?: (action: VimAction, payload: VimActionPayload<T>) => void
  /** extra single-key bindings: key -> handler(api) */
  bindings?: Record<string, (api: VimApi<T>) => void>
  /** attach a window keydown listener automatically (default true) */
  autoListen?: boolean
}

export function useVimList<T>(
  source: MaybeRefOrGetter<T[]>,
  opts: VimOptions<T> = {},
): VimApi<T> {
  const items = computed(() => toValue(source))
  const len = () => items.value.length

  const cursor = ref(opts.initial ?? 0)
  const mode = ref<VimMode>('normal')
  const anchor = ref<number | null>(null) // visual-mode start
  const count = ref('')
  const pending = ref('') // 'g' | 'd' | 'y' | 'c' | 'm' | "'"
  const register = ref<T[]>([]) as Ref<T[]>
  const marks = ref<Record<string, number>>({})

  const searchActive = ref(false)
  const searchQuery = ref('')
  const searchDir = ref<1 | -1>(1)

  const pageSize = () => Math.max(1, toValue(opts.pageSize ?? 10))

  const selection = computed<[number, number] | null>(() => {
    if (mode.value === 'visual' && anchor.value !== null) {
      return [Math.min(anchor.value, cursor.value), Math.max(anchor.value, cursor.value)]
    }
    return null
  })
  const isSelected = (i: number) => {
    const s = selection.value
    return s ? i >= s[0] && i <= s[1] : i === cursor.value
  }

  function clamp(i: number) {
    const n = len()
    if (n === 0) return 0
    if (opts.loop) return ((i % n) + n) % n
    return Math.max(0, Math.min(n - 1, i))
  }
  function moveTo(i: number) {
    cursor.value = clamp(i)
  }

  function takeCount(fallback = 1) {
    const c = count.value ? parseInt(count.value, 10) : fallback
    count.value = ''
    return c
  }

  // resolve a range for an operator. doubled operator (dd) => `count` whole lines.
  function rangeForDoubled(c: number): [number, number] {
    return [cursor.value, clamp(cursor.value + c - 1)]
  }

  function fireAction(action: VimAction, lo: number, hi: number) {
    const indices: number[] = []
    for (let i = lo; i <= hi; i++) indices.push(i)
    const payload: VimActionPayload<T> = {
      indices,
      items: indices.map((i) => items.value[i]!),
      cursor: cursor.value,
      register: register.value,
    }
    if (action === 'yank') register.value = payload.items.slice()
    if (action === 'delete' || action === 'change') register.value = payload.items.slice()
    opts.onAction?.(action, payload)
  }

  function leaveVisual() {
    mode.value = 'normal'
    anchor.value = null
  }

  // a "motion" resolved to a target index; either moves cursor or, if an
  // operator is pending, fires the operator over [cursor..target].
  function applyMotion(target: number) {
    const t = clamp(target)
    if (pending.value && 'dyc'.includes(pending.value)) {
      const op = pending.value
      pending.value = ''
      const lo = Math.min(cursor.value, t)
      const hi = Math.max(cursor.value, t)
      fireAction(op === 'd' ? 'delete' : op === 'y' ? 'yank' : 'change', lo, hi)
      moveTo(lo)
      return
    }
    moveTo(t)
  }

  function runSearch(from: number, dir: 1 | -1): number {
    const q = searchQuery.value.toLowerCase()
    if (!q || !opts.text) return cursor.value
    const n = len()
    for (let step = 1; step <= n; step++) {
      const i = (((from + dir * step) % n) + n) % n
      if (opts.text(items.value[i]!).toLowerCase().includes(q)) return i
    }
    return cursor.value
  }

  // --- search input sub-mode: capture the query inline ---
  function handleSearchKey(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      searchActive.value = false
      searchQuery.value = ''
      return true
    }
    if (e.key === 'Enter') {
      searchActive.value = false
      moveTo(runSearch(cursor.value, searchDir.value))
      return true
    }
    if (e.key === 'Backspace') {
      searchQuery.value = searchQuery.value.slice(0, -1)
      return true
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      searchQuery.value += e.key
      return true
    }
    return false
  }

  const api: VimApi<T> = {
    cursor, mode, selection, isSelected, count, pending, register, marks,
    search: { active: searchActive, query: searchQuery, dir: searchDir },
    handleKey, moveTo,
  }

  function handleKey(e: KeyboardEvent): boolean {
    if (searchActive.value) return handleSearchKey(e)

    const key = e.key
    const ctrl = e.ctrlKey || e.metaKey

    // Ctrl chords -------------------------------------------------------
    if (ctrl) {
      switch (key) {
        case 'd': applyMotion(cursor.value + Math.floor(pageSize() / 2)); return true
        case 'u': applyMotion(cursor.value - Math.floor(pageSize() / 2)); return true
        case 'f': applyMotion(cursor.value + pageSize()); return true
        case 'b': applyMotion(cursor.value - pageSize()); return true
      }
      return false
    }

    // pending operator that takes a literal arg (marks) ------------------
    if (pending.value === 'm') {
      marks.value = { ...marks.value, [key]: cursor.value }
      pending.value = ''
      return true
    }
    if (pending.value === "'" || pending.value === '`') {
      const m = marks.value[key]
      pending.value = ''
      if (m !== undefined) moveTo(m)
      return true
    }
    // 'g' prefix (gg) ---------------------------------------------------
    if (pending.value === 'g') {
      pending.value = ''
      if (key === 'g') { applyMotion(count.value ? takeCount() - 1 : 0); return true }
      return true // swallow unknown g-sequences
    }

    // counts ------------------------------------------------------------
    if (/[0-9]/.test(key) && !(key === '0' && count.value === '')) {
      count.value += key
      return true
    }

    switch (key) {
      // motions
      case 'j': case 'ArrowDown': applyMotion(cursor.value + takeCount()); return true
      case 'k': case 'ArrowUp': applyMotion(cursor.value - takeCount()); return true
      case 'G': applyMotion(count.value ? takeCount() - 1 : len() - 1); return true
      case 'g': pending.value = 'g'; return true
      case '{': applyMotion(cursor.value - takeCount() * pageSize()); return true
      case '}': applyMotion(cursor.value + takeCount() * pageSize()); return true

      // operators
      case 'd': case 'y': case 'c': {
        if (mode.value === 'visual' && selection.value) {
          const [lo, hi] = selection.value
          fireAction(key === 'd' ? 'delete' : key === 'y' ? 'yank' : 'change', lo, hi)
          leaveVisual()
          moveTo(lo)
          return true
        }
        if (pending.value === key) {
          // doubled: dd / yy / cc over `count` lines
          const c = takeCount()
          const [lo, hi] = rangeForDoubled(c)
          fireAction(key === 'd' ? 'delete' : key === 'y' ? 'yank' : 'change', lo, hi)
          pending.value = ''
          moveTo(lo)
          return true
        }
        pending.value = key
        return true
      }
      case 'p': case 'P':
        opts.onAction?.('paste', {
          indices: [cursor.value], items: [], cursor: cursor.value, register: register.value,
        })
        return true

      // visual mode
      case 'v': case 'V':
        if (mode.value === 'visual') leaveVisual()
        else { mode.value = 'visual'; anchor.value = cursor.value }
        return true
      case 'o':
        if (mode.value === 'visual' && anchor.value !== null) {
          const a = anchor.value; anchor.value = cursor.value; cursor.value = a
        }
        return true

      // marks
      case 'm': pending.value = 'm'; return true
      case "'": case '`': pending.value = "'"; return true

      // search
      case '/': searchActive.value = true; searchDir.value = 1; searchQuery.value = ''; return true
      case '?': searchActive.value = true; searchDir.value = -1; searchQuery.value = ''; return true
      case 'n': moveTo(runSearch(cursor.value, searchDir.value)); return true
      case 'N': moveTo(runSearch(cursor.value, (searchDir.value * -1) as 1 | -1)); return true

      // confirm / cancel
      case 'Enter':
        opts.onAction?.('open', {
          indices: [cursor.value], items: [items.value[cursor.value]!],
          cursor: cursor.value, register: register.value,
        })
        return true
      case 'Escape':
        if (mode.value === 'visual') leaveVisual()
        pending.value = ''
        count.value = ''
        return true
    }

    // custom bindings ----------------------------------------------------
    if (opts.bindings && key in opts.bindings) {
      opts.bindings[key]!(api)
      count.value = ''
      pending.value = ''
      return true
    }
    return false
  }

  // keep cursor valid if the list shrinks
  watch(items, () => { cursor.value = clamp(cursor.value) })

  if (opts.autoListen !== false) {
    const listener = (e: KeyboardEvent) => {
      if (handleKey(e)) e.preventDefault()
    }
    window.addEventListener('keydown', listener)
    onUnmounted(() => window.removeEventListener('keydown', listener))
  }

  return api
}
