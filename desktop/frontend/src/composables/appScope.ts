import { clearSharedCommitDetails } from '../components/graph/commitDetailCache'
import { invalidateChangesSnapshots } from '../components/status/changesSnapshotCache'
import { disposePreferences, initializePreferences } from '../customization/usePreferences'
import { invalidateNavigationSnapshots } from './navigationSnapshots'
import { disposeConflictWorkspace } from './useConflictWorkspace'
import { disposeGitProfiles } from './useGitProfiles'
import { disposeRepoStatus, startRepoStatus } from './useRepoStatus'
import { disposeWorkspaces, startWorkspaces } from './useWorkspaces'
import { disposeToasts } from './useToasts'

// One concrete lifetime for this window's stores. Accessors also start their
// owner lazily for standalone labs; component unmount never stops shared data.
let active = false
let initialization: Promise<void> | undefined
export function initializeAppScope(): Promise<void> {
  if (active) return initialization!
  active = true
  startWorkspaces()
  startRepoStatus()
  initialization = initializePreferences()
  return initialization
}

/** Call after unmount; safe to repeat in tests and hot reload. */
export function disposeAppScope() {
  active = false
  initialization = undefined
  disposeConflictWorkspace()
  disposeRepoStatus()
  disposeGitProfiles()
  disposeWorkspaces()
  disposePreferences()
  disposeToasts()
  invalidateChangesSnapshots()
  invalidateNavigationSnapshots()
  clearSharedCommitDetails()
}
