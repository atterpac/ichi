import { RefService, StashService } from '../bindings/github.com/atterpac/ichi/desktop/services'
import type { OperationConfirmRequest } from '../components/overlays/OperationConfirmModal.vue'

export function isDirtyTreeError(error: unknown) {
  const message = (error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : String(error)).toLowerCase()
  return message.includes('would be overwritten') || message.includes('stash them')
}

export class BranchSwitchRecoveryError extends Error {}

/** Keep the created ref across retries without creating or overwriting it twice. */
export function branchCreation(ref: string, run: (op: () => Promise<void>) => void | Promise<void>): Pick<OperationConfirmRequest, 'onConfirm' | 'recovery'> {
  let createdName = ''
  let stashed = false
  const checkout = async () => {
    try {
      await RefService.CheckoutBranch(createdName, false)
    } catch (error) {
      if (isDirtyTreeError(error)) throw new BranchSwitchRecoveryError('Your changes would be overwritten by checkout.')
      throw error
    }
  }
  return {
    onConfirm: ({ name }) => run(async () => {
      if (!createdName) {
        const target = name!.trim()
        await RefService.CreateBranchAt(target, ref)
        createdName = target
      }
      await checkout()
    }),
    recovery: (error) => {
      if (!createdName || (!stashed && !isDirtyTreeError(error))) return undefined
      return {
        label: stashed ? 'Retry switch' : 'Stash changes and switch',
        message: stashed
          ? `Your changes are saved in Stashes. Could not switch to ${createdName}. Retry the switch or cancel and inspect the repository.`
          : `Branch ${createdName} was created, but your uncommitted changes block switching to it. Save tracked and untracked changes in Stashes, then switch. You can restore them from Stashes when ready.`,
        run: () => run(async () => {
          if (!stashed) {
            await StashService.StashPush(`ichi: switch to ${createdName}`, true)
            stashed = true
          }
          await checkout()
        }),
      }
    },
  }
}
