import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Events, System, Window } from '@wailsio/runtime'

// Matches main.go's macOS full-size-content window. Other platforms use
// native title bars outside the webview and need no traffic-light inset.
export function useWindowChrome() {
  const isMac = ref(System.IsMac())
  const fullscreen = ref(false)
  let request = 0
  let disposed = false
  const unsubscribers: (() => void)[] = []

  async function refreshFullscreen() {
    if (!isMac.value || disposed) return
    const id = ++request
    try {
      const value = await Window.IsFullscreen()
      if (!disposed && id === request) fullscreen.value = value
    } catch {
      // Keep the last known state if the native window is unavailable.
    }
  }

  onMounted(() => {
    isMac.value = System.IsMac()
    if (!isMac.value) return
    // Query this window rather than applying another window's event state.
    unsubscribers.push(
      Events.On('common:WindowFullscreen', refreshFullscreen),
      Events.On('common:WindowUnFullscreen', refreshFullscreen),
    )
    window.addEventListener('focus', refreshFullscreen)
    void refreshFullscreen()
  })
  onUnmounted(() => {
    disposed = true
    request++
    unsubscribers.forEach(off => off())
    window.removeEventListener('focus', refreshFullscreen)
  })

  return { reserveTrafficLights: computed(() => isMac.value && !fullscreen.value) }
}
