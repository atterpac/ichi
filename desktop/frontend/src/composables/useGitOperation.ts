import { onScopeDispose, ref } from 'vue'
import { notify } from './useToasts'

type OperationFeedback = {
  success?: string | { title: string; message?: string }
  failure?: string
  onError?: (error: unknown) => void
  /** Confirmation dialogs retain a failed operation for retry. */
  rethrow?: boolean
}

/** One mutation at a time; even a failed Git command may have changed the repo. */
export function useGitOperation(options: {
  refresh: () => Promise<void>
  blocked?: () => boolean
  invalidate?: () => void
}) {
  const busy = ref(false)
  let alive = true
  onScopeDispose(() => { alive = false })

  async function run(operation: () => Promise<void>, feedback: OperationFeedback = {}, refresh = options.refresh) {
    if (!alive || busy.value || options.blocked?.()) return false
    busy.value = true
    let succeeded = false
    let failure: unknown
    try {
      options.invalidate?.()
      await operation()
      succeeded = true
      if (alive && feedback.success) notify({ tone: 'success', ...(typeof feedback.success === 'string' ? { title: feedback.success } : feedback.success) })
    } catch (error) {
      failure = error
      if (alive) {
        if (feedback.onError) feedback.onError(error)
        else notify({ tone: 'danger', title: feedback.failure ?? 'Operation failed', message: error instanceof Error ? error.message : String(error) })
      }
    } finally {
      try {
        if (alive) await refresh()
      } catch (error) {
        if (alive) notify({ tone: 'danger', title: 'Refresh failed', message: error instanceof Error ? error.message : String(error) })
      } finally {
        busy.value = false
      }
    }
    if (!succeeded && alive && feedback.rethrow) throw failure
    return succeeded
  }

  return { busy, run }
}
