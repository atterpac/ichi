import { nextTick, onBeforeUnmount, onMounted, type Ref } from 'vue'

/** Keep modal keyboard focus local and return it to the invoking control. */
export function useDialogFocus(dialog: Ref<HTMLElement | null>, close: () => void) {
  let previous: HTMLElement | null = null
  let disposed = false
  const controls = () =>
    Array.from(
      dialog.value?.querySelectorAll<HTMLElement>(
        ':is(button, input, select, textarea, a[href], [tabindex]):not(:disabled):not([tabindex="-1"]):not([type="hidden"])',
      ) ?? [],
    ).filter((element) => {
      for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
        if (
          parent.hidden ||
          getComputedStyle(parent).display === 'none' ||
          getComputedStyle(parent).visibility === 'hidden'
        )
          return false
      }
      return true
    })
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') {
      const items = controls()
      const first = items[0]
      const last = items[items.length - 1]
      const outside = !dialog.value?.contains(document.activeElement)
      if (!first) {
        event.preventDefault()
        dialog.value?.focus()
      } else if (
        outside ||
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last)
      ) {
        event.preventDefault()
        ;(event.shiftKey ? last : first)?.focus()
      }
    }
  }
  onMounted(async () => {
    previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    window.addEventListener('keydown', onKey, true)
    await nextTick()
    if (disposed) return
    const items = controls()
    ;(items.find((element) => element.matches('input')) ?? items[0] ?? dialog.value)?.focus()
  })
  onBeforeUnmount(() => {
    disposed = true
    window.removeEventListener('keydown', onKey, true)
    if (previous?.isConnected) previous.focus()
  })
}
