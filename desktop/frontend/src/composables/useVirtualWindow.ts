/**
 * useVirtualWindow — fixed-row-height windowed rendering over a flat list.
 *
 * The container scrolls a spacer sized to the full list; only the rows
 * inside the viewport (± overscan) are rendered, offset into place with a
 * translateY. Fixed row height keeps the math O(1) per scroll event.
 */
import { computed, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

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
  scrollTop = Math.max(0, Math.min(scrollTop, Math.max(0, count * rowHeight - viewportHeight)))
  const start = Math.min(count, Math.max(0, Math.floor(scrollTop / rowHeight) - overscan))
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
  /** Content origin and sticky overlays within the scroll container. */
  offset?: MaybeRefOrGetter<number>
  paddingStart?: MaybeRefOrGetter<number>
  paddingEnd?: MaybeRefOrGetter<number>
}

export function useVirtualWindow(opts: VirtualWindowOptions) {
  const overscan = opts.overscan ?? 15
  const rowHeight = () => toValue(opts.rowHeight)
  const scrollTop = ref(0)
  const viewportHeight = ref(600)
  const offset = () => toValue(opts.offset ?? 0)
  const paddingStart = () => toValue(opts.paddingStart ?? 0)
  const paddingEnd = () => toValue(opts.paddingEnd ?? 0)
  const usableHeight = () => Math.max(1, viewportHeight.value - paddingStart() - paddingEnd())

  function readViewport() {
    const el = opts.container.value
    if (!el) return
    if (el.clientHeight > 0) viewportHeight.value = el.clientHeight
    scrollTop.value = el.scrollTop
  }

  const window = computed<VirtualWindow>(() =>
    computeWindow(Math.max(0, scrollTop.value + paddingStart() - offset()),
      usableHeight(), rowHeight(), toValue(opts.count), overscan),
  )

  function scrollToRow(index: number, position: 'nearest' | 'center' = 'nearest') {
    const el = opts.container.value
    if (!el) return
    index = Math.max(0, Math.min(index, toValue(opts.count) - 1))
    const rowH = rowHeight()
    const rowTop = offset() + index * rowH
    if (position === 'center') {
      el.scrollTop = Math.max(0, rowTop - paddingStart() - (usableHeight() - rowH) / 2)
    } else if (rowTop < el.scrollTop + paddingStart()) {
      el.scrollTop = Math.max(0, rowTop - paddingStart())
    } else if (rowTop + rowH > el.scrollTop + viewportHeight.value - paddingEnd()) {
      el.scrollTop = rowTop + rowH - viewportHeight.value + paddingEnd()
    }
    // Programmatic selection needs the new slice before looking up its DOM row.
    scrollTop.value = el.scrollTop
  }

  // Loading/error states can replace the container after mounting.
  watch(opts.container, (el, _, onCleanup) => {
    if (!el) return
    let frame: number | undefined
    const onScroll = () => {
      if (frame !== undefined) return
      if (typeof requestAnimationFrame !== 'function') { readViewport(); return }
      frame = requestAnimationFrame(() => { frame = undefined; readViewport() })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    readViewport()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(readViewport) : null
    observer?.observe(el)
    onCleanup(() => {
      el.removeEventListener('scroll', onScroll)
      observer?.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
    })
  }, { flush: 'post', immediate: true })
  watch([() => toValue(opts.count), rowHeight], readViewport, { flush: 'post' })

  return { window, scrollToRow, scrollTop }
}
