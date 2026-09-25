<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { repoSwitchBlocker } from '../../composables/useRepoSwitchGuard'
import { useGitProfiles } from '../../composables/useGitProfiles'
import { useWorkspaces } from '../../composables/useWorkspaces'
import { useRepoStatus } from '../../composables/useRepoStatus'
import UiButton from '../common/UiButton.vue'
const props = defineProps<{ initialProfile?: string }>()
const profiles = useGitProfiles()
const profileCard = ref<HTMLElement>()
onMounted(() => { if (props.initialProfile) requestAnimationFrame(() => profileCard.value?.querySelector('select')?.focus()) })
const profileFile = ref('')
const chosenProfile = ref('')
const profileBusy = ref(false)
const ws = useWorkspaces()
const repoStatus = useRepoStatus()
const selected = ref(ws.state.workspaces[0]!.id)
const name = ref('')
const color = ref('#a9bf87')
const editingWorkspace = ref('')
const error = ref('')
const path = ref('')
const repoName = ref('')
const oldPath = ref<string>()
const assignment = ref(selected.value)
const repos = computed(() => ws.state.repos.filter((r) => r.workspace === selected.value))
const current = computed(() => ws.state.workspaces.find((w) => w.id === selected.value)!)
watch(
  selected,
  () => {
    chosenProfile.value = current.value.profileId || ''
  },
  { immediate: true },
)
if (props.initialProfile) chosenProfile.value = props.initialProfile
const selectedProfile = computed(() =>
  profiles.state.profiles.find((p) => p.ID === chosenProfile.value),
)
async function applyProfile() {
  profileBusy.value = true
  error.value = ''
  try {
    await profiles.assign(selected.value, chosenProfile.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    profileBusy.value = false
  }
}
async function addProfileFile() {
  error.value = ''
  try {
    await profiles.registerFile(profileFile.value)
    profileFile.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
function attempt(action: () => void) {
  error.value = ''
  try {
    action()
  } catch (e) {
    error.value = String(e instanceof Error ? e.message : e)
  }
}
function cancelWorkspaceEdit() {
  editingWorkspace.value = ''
  name.value = ''
}
function saveWorkspace() {
  attempt(() => {
    if (editingWorkspace.value) ws.updateWorkspace(editingWorkspace.value, name.value, color.value)
    else selected.value = ws.addWorkspace(name.value, color.value).id
    name.value = ''
    editingWorkspace.value = ''
    assignment.value = selected.value
  })
}
function editWorkspace() {
  editingWorkspace.value = current.value.id
  name.value = current.value.name
  color.value = current.value.color
}
function removeWorkspace() {
  attempt(() => {
    const blocker = repoSwitchBlocker(); if (blocker) throw new Error(blocker)
    ws.removeWorkspace(selected.value)
    selected.value = ws.state.workspaces[0]!.id
    assignment.value = selected.value
    editingWorkspace.value = ''
    name.value = ''
  })
}
function selectWorkspace(id: string) {
  selected.value = id
  assignment.value = id
}
function saveRepo() {
  attempt(() => {
    const blocker = repoSwitchBlocker(); if (blocker) throw new Error(blocker)
    ws.saveRepo(path.value, repoName.value, assignment.value, oldPath.value)
    selected.value = assignment.value
    resetRepo()
  })
}
function resetRepo() {
  path.value = ''
  repoName.value = ''
  oldPath.value = undefined
}
function editRepo(r: (typeof ws.state.repos)[number]) {
  path.value = r.path
  repoName.value = r.name
  assignment.value = r.workspace
  oldPath.value = r.path
}
function addCurrent() {
  if (repoStatus.info) {
    path.value = repoStatus.info.Path
    repoName.value = repoStatus.info.Name
    oldPath.value = ws.state.repos.find((r) => r.path === path.value)?.path
  }
}
function removeRepo(path: string) {
  const blocker = repoSwitchBlocker(); if (blocker) { error.value = blocker; return }
  ws.state.repos = ws.state.repos.filter((r) => r.path !== path)
  if (oldPath.value === path) resetRepo()
}
</script>
<template>
  <div class="workspace-settings">
    <p class="ws-description">
      Group projects into your own workspaces. Names, colors, pins, and repository folders are saved
      on this device.
    </p>
    <p v-if="error || ws.persistence.error" class="ws-error" role="alert">
      {{ error || ws.persistence.error }}
    </p>
    <form class="ws-form" @submit.prevent="saveWorkspace">
      <h3>{{ editingWorkspace ? 'Edit workspace' : 'New workspace' }}</h3>
      <div class="ws-inline">
        <label class="ws-grow"
          >Name<input
            v-model="name"
            required
            placeholder="Work, Personal, Open source…"
            aria-label="Workspace name" /></label
        ><label>Color<input v-model="color" type="color" aria-label="Workspace color" /></label
        ><UiButton type="submit">{{
          editingWorkspace ? 'Save workspace' : 'Create workspace'
        }}</UiButton
        ><UiButton v-if="editingWorkspace" @click="cancelWorkspaceEdit">Cancel</UiButton>
      </div>
    </form>
    <nav class="ws-tabs" aria-label="Workspaces">
      <button
        v-for="w in ws.state.workspaces"
        :key="w.id"
        :aria-pressed="selected === w.id"
        @click="selectWorkspace(w.id)"
      >
        <i :style="{ background: w.color }"></i>{{ w.name
        }}<small>{{ ws.state.repos.filter((r) => r.workspace === w.id).length }}</small>
      </button>
    </nav>
    <div class="ws-heading">
      <h3>{{ current.name }}</h3>
      <UiButton size="sm" @click="editWorkspace">Edit workspace</UiButton
      ><UiButton size="sm" :disabled="ws.state.workspaces.length === 1" @click="removeWorkspace"
        >Remove workspace</UiButton
      >
    </div>
    <p class="ws-description">
      Removing a workspace moves its repositories to the first remaining workspace. Removing a saved
      repository leaves its files on disk.
    </p>
    <section ref="profileCard" class="ws-form ws-profile">
      <div class="ws-heading">
        <h3>Git profile</h3>
        <UiButton size="sm" :disabled="profiles.state.loading" @click="profiles.refresh"
          >Rescan machine</UiButton
        >
      </div>
      <p class="ws-description">
        Use this identity for Git operations launched by Ichi in this workspace. Git config files
        and authentication stay unchanged.
      </p>
      <label
        >Assigned identity<select
          v-model="chosenProfile"
          aria-label="Workspace Git profile"
          :disabled="profileBusy"
        >
          <option value="">Use repository defaults</option>
          <option v-for="p in profiles.state.profiles" :key="p.ID" :value="p.ID">
            {{ p.Label }} — {{ p.Name }} &lt;{{ p.Email }}&gt;
          </option>
          <option v-if="chosenProfile && !selectedProfile" :value="chosenProfile">
            Unavailable profile: {{ chosenProfile }}
          </option>
        </select></label
      >
      <div v-if="selectedProfile" class="ws-profile-detail">
        <strong>{{ selectedProfile.Name }} &lt;{{ selectedProfile.Email }}&gt;</strong
        ><small>{{ selectedProfile.Source }}</small
        ><small
          >Commit signing:
          {{
            ['true', 'yes', 'on', '1'].includes(selectedProfile.SigningEnabled.toLowerCase())
              ? selectedProfile.SigningFormat
              : 'off'
          }}<template v-if="selectedProfile.SigningKey">
            · {{ selectedProfile.SigningKey }}</template
          ></small
        >
      </div>
      <p v-else-if="!chosenProfile" class="ws-description">
        Git resolves the identity from this repository’s local, global, and conditional
        configuration.
      </p>
      <div class="ws-actions">
        <UiButton
          :disabled="
            profileBusy || profiles.state.syncing || chosenProfile === (current.profileId || '')
          "
          @click="applyProfile"
          >{{ profileBusy ? 'Applying…' : 'Assign profile' }}</UiButton
        >
      </div>
      <p v-if="profiles.state.error || profiles.state.syncError" class="ws-error" role="alert">
        {{ profiles.state.error || profiles.state.syncError }}
      </p>
      <details>
        <summary>Additional Git config files</summary>
        <p class="ws-description">
          Global identities and included config files are discovered automatically. Register another
          existing identity file here.
        </p>
        <form class="ws-inline" @submit.prevent="addProfileFile">
          <label class="ws-grow"
            >Config file<input
              v-model="profileFile"
              placeholder="~/.gitconfig-work"
              aria-label="Git profile config file"
              required /></label
          ><UiButton type="submit">Add profile file</UiButton>
        </form>
        <p v-for="warning in profiles.state.warnings" :key="warning" class="ws-description">
          {{ warning }}
        </p>
      </details>
    </section>
    <div class="ws-repos">
      <div v-for="r in repos" :key="r.path" class="ws-repo">
        <button
          class="ws-pin"
          :aria-label="`${r.pinned ? 'Unpin' : 'Pin'} ${r.name}`"
          :aria-pressed="r.pinned"
          @click="r.pinned = !r.pinned"
        >
          {{ r.pinned ? '★' : '☆' }}
        </button>
        <div class="ws-grow">
          <strong>{{ r.name }}</strong
          ><small>{{ r.path }}</small>
        </div>
        <UiButton size="sm" @click="editRepo(r)">Edit</UiButton
        ><UiButton size="sm" @click="removeRepo(r.path)">Remove</UiButton>
      </div>
      <p v-if="!repos.length" class="ws-description">No repositories yet. Add a folder below.</p>
    </div>
    <form class="ws-form" @submit.prevent="saveRepo">
      <div class="ws-heading">
        <h3>{{ oldPath ? 'Edit repository' : 'Add repository' }}</h3>
        <UiButton v-if="repoStatus.info" size="sm" @click="addCurrent"
          >Use current repository</UiButton
        >
      </div>
      <label
        >Folder path<input
          v-model="path"
          required
          placeholder="~/projects/my-repo"
          aria-label="Repository folder path"
      /></label>
      <div class="ws-inline">
        <label class="ws-grow"
          >Display name<input
            v-model="repoName"
            placeholder="Defaults to folder name"
            aria-label="Repository display name" /></label
        ><label class="ws-grow"
          >Workspace<select v-model="assignment" aria-label="Repository workspace">
            <option v-for="w in ws.state.workspaces" :key="w.id" :value="w.id">{{ w.name }}</option>
          </select></label
        >
      </div>
      <div class="ws-actions">
        <UiButton v-if="oldPath" @click="resetRepo">Cancel</UiButton
        ><UiButton type="submit">{{ oldPath ? 'Save repository' : 'Add repository' }}</UiButton>
      </div>
    </form>
  </div>
</template>
<style scoped>
.ws-profile-detail {
  display: grid;
  gap: 5px;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.ws-profile-detail small {
  color: var(--text-mut);
  font-size: 10px;
}
.ws-profile summary {
  cursor: pointer;
  font-size: 12px;
}
.ws-profile details > * {
  margin-top: 10px;
}
.workspace-settings {
  display: grid;
  gap: 16px;
}
.ws-description {
  color: var(--text-mut);
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
}
.ws-form {
  display: grid;
  gap: 12px;
  padding: 16px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.workspace-settings h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.ws-inline,
.ws-heading,
.ws-repo {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ws-inline {
  align-items: end;
  flex-wrap: wrap;
}
.ws-grow {
  flex: 1;
  min-width: 120px;
}
.ws-heading h3 {
  flex: 1;
}
.workspace-settings label {
  display: grid;
  gap: 7px;
  color: var(--text-mut);
  font-size: 11px;
}
.workspace-settings input,
.workspace-settings select {
  background: var(--surface-panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 8px;
  width: 100%;
  font: inherit;
  min-height: 32px;
}
.workspace-settings input[type='color'] {
  width: 42px;
  padding: 3px;
}
.ws-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.ws-tabs button {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 8px 10px;
  font-size: 12px;
}
.ws-tabs button[aria-pressed='true'] {
  background: var(--selected);
  border-color: var(--accent);
}
.ws-tabs i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.ws-tabs small {
  color: var(--text-mut);
}
.ws-repos {
  display: grid;
  gap: 8px;
}
.ws-repo {
  padding: 10px;
  border-bottom: 1px solid var(--border);
}
.ws-repo strong {
  font-size: 12px;
}
.ws-repo small {
  display: block;
  font-size: 10px;
  color: var(--text-mut);
  overflow-wrap: anywhere;
  margin-top: 4px;
}
.ws-pin {
  background: none;
  border: 0;
  color: var(--accent-text);
  font-size: 18px;
  cursor: pointer;
}
.ws-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.ws-error {
  color: var(--danger, #df8b83);
  font-size: 12px;
}
</style>
