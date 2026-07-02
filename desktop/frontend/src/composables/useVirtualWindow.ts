/**
 * useVirtualWindow — fixed-row-height windowed rendering over a flat list.
 *
 * The container scrolls a spacer sized to the full list; only the rows
 * inside the viewport (± overscan) are rendered, offset into place with a
 * translateY. Fixed row height keeps the math O(1) per scroll event.
 */
import { computed, onMounted, onUnmounted, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue'

export interface VirtualWindow {
  /** inclusive start index of the rendered slice */
  start: number
  /** exclusive end index of the rendered slice */
  end: number
  /** translateY for the rendered slice, px */
  offsetY: number
  /** spacer height for the full list, px */
  totalHeight: number
}

export function computeWindow(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  count: number,
  overscan: number,
): VirtualWindow {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const end = Math.min(count, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan)
  return {
    start,
    end: Math.max(start, end),
    offsetY: start * rowHeight,
    totalHeight: count * rowHeight,
  }
}

export interface VirtualWindowOptions {
  count: MaybeRefOrGetter<number>
  rowHeight: MaybeRefOrGetter<number>
  container: Ref<HTMLElement | null>
  overscan?: number
}

export function useVirtualWindow(opts: VirtualWindowOptions) {
  const overscan = opts.overscan ?? 15
  const rowHeight = () => toValue(opts.rowHeight)
  const scrollTop = ref(0)
  const viewportHeight = ref(600)
  let scrollScheduled = false
  let resizeObserver: ResizeObserver | null = null

  function readViewport() {
    const el = opts.container.value
    if (el && el.clientHeight > 0) viewportHeight.value = el.clientHeight
  }

  function onScroll() {
    if (scrollScheduled) return
    scrollScheduled = true
    const apply = () => {
      scrollScheduled = false
      scrollTop.value = opts.container.value?.scrollTop ?? 0
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply)
    else apply()
  }

  const window = computed<VirtualWindow>(() =>
    computeWindow(scrollTop.value, viewportHeight.value, rowHeight(), toValue(opts.count), overscan),
  )

  function scrollToRow(index: number, position: 'nearest' | 'center' = 'nearest') {
    const el = opts.container.value
    if (!el) return
    const rowH = rowHeight()
    const rowTop = index * rowH
    if (position === 'center') {
      el.scrollTop = Math.max(0, rowTop - viewportHeight.value / 2)
      return
    }
    if (rowTop < el.scrollTop) el.scrollTop = rowTop
    else if (rowTop + rowH > el.scrollTop + viewportHeight.value) {
      el.scrollTop = rowTop + rowH - viewportHeight.value
    }
  }

  onMounted(() => {
    const el = opts.container.value
    if (!el) return
    el.addEventListener('scroll', onScroll, { passive: true })
    readViewport()
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(readViewport)
      resizeObserver.observe(el)
    }
  })

  onUnmounted(() => {
    opts.container.value?.removeEventListener('scroll', onScroll)
    resizeObserver?.disconnect()
  })

  return { window, scrollToRow, scrollTop }
}
