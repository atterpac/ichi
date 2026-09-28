<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RepoService, GitProfile } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import { useGitProfiles } from '../../composables/useGitProfiles'
import { useWorkspaces } from '../../composables/useWorkspaces'
import UiButton from '../common/UiButton.vue'
const props = defineProps<{ initialProfile?: string }>()
const profiles = useGitProfiles()
const ws = useWorkspaces()
const selected = ref(props.initialProfile || '')
const draft = ref(
  new GitProfile({
    Label: '',
    Name: '',
    Email: '',
    SigningKey: '',
    SigningFormat: 'openpgp',
    SigningEnabled: 'false',
    TagSigningEnabled: 'false',
  }),
)
const baseline = ref(JSON.stringify(draft.value))
const dirty = computed(() => JSON.stringify(draft.value) !== baseline.value)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const importPath = ref('')
const assignment = ref('')
const workspace = ref(ws.state.workspaces[0]?.id || '')
const target = computed(() => ws.state.workspaces.find((w) => w.id === workspace.value))
const targetRepos = computed(() => ws.state.repos.filter((r) => r.workspace === workspace.value))
const usedBy = computed(() =>
  ws.state.workspaces.filter((w) => w.profileId && w.profileId === draft.value.ID),
)
const readOnly = computed(() => draft.value.ID === 'global')
function load(id: string) {
  const p = profiles.state.profiles.find((p) => p.ID === id)
  draft.value = new GitProfile(
    p || {
      Label: '',
      Name: '',
      Email: '',
      SigningKey: '',
      SigningFormat: 'openpgp',
      SigningEnabled: 'false',
      TagSigningEnabled: 'false',
    },
  )
  for (const key of ['SigningEnabled', 'TagSigningEnabled'] as const)
    draft.value[key] = ['true', 'yes', 'on', '1'].includes(draft.value[key]?.toLowerCase())
      ? 'true'
      : 'false'
  selected.value = id
  baseline.value = JSON.stringify(draft.value)
  error.value = ''
  notice.value = ''
}
function choose(id: string) {
  if (busy.value || (dirty.value && !window.confirm('Discard unsaved profile changes?'))) return
  load(id)
}
watch(
  () => profiles.state.profiles,
  () => {
    if (!dirty.value && selected.value) load(selected.value)
  },
  { immediate: true },
)
watch(
  () => props.initialProfile,
  (id) => {
    if (id) choose(id)
  },
)
watch(
  target,
  (value) => {
    assignment.value = value?.profileId || ''
  },
  { immediate: true },
)
function duplicate() {
  draft.value = new GitProfile({
    ...draft.value,
    ID: '',
    Source: '',
    Label: `${draft.value.Label} copy`,
  })
  selected.value = ''
  notice.value = ''
  error.value = ''
}
async function save() {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const saved = await RepoService.SaveGitProfile(draft.value)
    if (!saved) throw new Error('No profile returned after saving.')
    if (!ws.state.profileFiles.includes(saved.Source)) ws.state.profileFiles.push(saved.Source)
    selected.value = saved.ID
    draft.value = saved
    baseline.value = JSON.stringify(saved)
    await profiles.refresh()
    await profiles.effective()
    notice.value = 'Profile saved. Assigned repositories now use these settings.'
  } catch (e) {
    error.value = String(e instanceof Error ? e.message : e)
  } finally {
    busy.value = false
  }
}
async function importFile() {
  busy.value = true
  error.value = ''
  try {
    await profiles.registerFile(importPath.value)
    importPath.value = ''
    notice.value = 'Profile file imported.'
  } catch (e) {
    error.value = String(e instanceof Error ? e.message : e)
  } finally {
    busy.value = false
  }
}
async function apply() {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await profiles.assign(workspace.value, assignment.value)
    notice.value = 'Workspace Git settings updated.'
  } catch (e) {
    assignment.value = target.value?.profileId || ''
    error.value = String(e instanceof Error ? e.message : e)
  } finally {
    busy.value = false
  }
}
defineExpose({
  canLeave: () =>
    !busy.value && (!dirty.value || window.confirm('Discard unsaved profile changes?')),
})
</script>

<template>
  <div class="profiles-page">
    <header class="profiles-heading">
      <div>
        <p class="eyebrow">Git settings</p>
        <h2>Profiles</h2>
        <p>Manage your identities and choose how each workspace commits.</p>
      </div>
      <UiButton :disabled="busy" @click="choose('')">New profile</UiButton>
    </header>
    <p v-if="error || profiles.state.error || profiles.state.syncError" class="error" role="alert">
      {{ error || profiles.state.error || profiles.state.syncError }}
    </p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <div class="profiles-layout">
      <aside class="profiles-list">
        <div class="section-heading">
          <h3>Your profiles</h3>
          <UiButton size="sm" :disabled="busy || profiles.state.loading" @click="profiles.refresh"
            >Rescan</UiButton
          >
        </div>
        <nav aria-label="Git profiles">
          <button
            v-for="p in profiles.state.profiles"
            :key="p.ID"
            :aria-current="selected === p.ID ? 'true' : undefined"
            :disabled="busy"
            @click="choose(p.ID)"
          >
            <strong>{{ p.Label }}</strong
            ><span>{{ p.Email }}</span
            ><small>{{
              p.ID === 'global'
                ? 'Global default'
                : `${ws.state.workspaces.filter((w) => w.profileId === p.ID).length} workspaces`
            }}</small>
          </button>
        </nav>
        <p v-if="!profiles.state.profiles.length">
          Create your first profile or import an existing Git config.
        </p>
        <form class="import-form" @submit.prevent="importFile">
          <label
            >Import a Git config<input
              v-model="importPath"
              placeholder="~/.gitconfig-work"
              required /></label
          ><UiButton type="submit" size="sm" :disabled="busy">Import profile</UiButton>
        </form>
        <p v-for="warning in profiles.state.warnings" :key="warning" class="error">{{ warning }}</p>
      </aside>
      <div class="profiles-editor">
        <form class="profile-card" @submit.prevent="save">
          <div class="section-heading">
            <h3>{{ draft.ID ? draft.Label : 'New profile' }}</h3>
            <UiButton v-if="draft.ID" size="sm" :disabled="busy" @click="duplicate"
              >Duplicate</UiButton
            >
          </div>
          <p v-if="readOnly">
            Your global identity is shown for reference. Duplicate it to create an editable
            workspace profile.
          </p>
          <fieldset :disabled="busy || readOnly">
            <legend>Identity</legend>
            <label
              >Profile name<input
                v-model="draft.Label"
                required
                placeholder="Work, Personal, Open source…"
            /></label>
            <div class="field-pair">
              <label>Author name<input v-model="draft.Name" required autocomplete="name" /></label
              ><label
                >Email<input v-model="draft.Email" required type="email" autocomplete="email"
              /></label>
            </div>
            <h4>Signing</h4>
            <div class="field-pair">
              <label
                >Format<select v-model="draft.SigningFormat">
                  <option value="openpgp">OpenPGP</option>
                  <option value="ssh">SSH</option>
                  <option value="x509">X.509</option>
                </select></label
              ><label
                >Signing key<input
                  v-model="draft.SigningKey"
                  placeholder="Key ID or public key path"
                  :required="draft.SigningEnabled === 'true' || draft.TagSigningEnabled === 'true'"
              /></label>
            </div>
            <div class="field-pair">
              <label
                >Sign commits<select v-model="draft.SigningEnabled">
                  <option value="false">Off</option>
                  <option value="true">On</option>
                </select></label
              ><label
                >Sign tags<select v-model="draft.TagSigningEnabled">
                  <option value="false">Off</option>
                  <option value="true">On</option>
                </select></label
              >
            </div>
          </fieldset>
          <div class="save-preview">
            <strong>{{ readOnly ? 'Source' : 'Save preview' }}</strong
            ><code>{{
              draft.Source || 'New file in your Git configuration directory: ichi/profiles/'
            }}</code>
            <p v-if="!readOnly">
              Saves the displayed identity and signing values explicitly. Other settings in this
              file are preserved.
            </p>
            <p>Used by: {{ usedBy.map((w) => w.name).join(', ') || 'No workspace assignments' }}</p>
            <p v-if="usedBy.length">
              Saving updates Git configuration for
              {{
                ws.state.repos.filter((r) => usedBy.some((w) => w.id === r.workspace)).length
              }}
              assigned repositories.
            </p>
          </div>
          <div v-if="!readOnly" class="actions">
            <UiButton :disabled="busy || !dirty" @click="load(selected)">Discard</UiButton
            ><UiButton type="submit" :disabled="busy || (!dirty && !!draft.ID)">{{
              busy ? 'Saving…' : 'Save profile'
            }}</UiButton>
          </div>
        </form>
        <section class="profile-card">
          <h3>Workspace assignment</h3>
          <p>
            Apply an identity to every saved repository in a workspace. This updates repository Git
            configuration for Ichi, terminal Git, and other clients. Removing the assignment
            restores the underlying settings.
          </p>
          <div class="field-pair">
            <label
              >Workspace<select v-model="workspace" :disabled="busy">
                <option v-for="w in ws.state.workspaces" :key="w.id" :value="w.id">
                  {{ w.name }}
                </option>
              </select></label
            ><label
              >Profile<select v-model="assignment" :disabled="busy">
                <option value="">Use repository defaults</option>
                <option v-for="p in profiles.state.profiles" :key="p.ID" :value="p.ID">
                  {{ p.Label }}
                </option>
                <option
                  v-if="assignment && !profiles.state.profiles.some((p) => p.ID === assignment)"
                  :value="assignment"
                >
                  Unavailable: {{ assignment }}
                </option>
              </select></label
            >
          </div>
          <details>
            <summary>{{ targetRepos.length }} repositories affected</summary>
            <ul>
              <li v-for="r in targetRepos" :key="r.path">
                <strong>{{ r.name }}</strong
                ><code>{{ r.path }}</code>
              </li>
            </ul>
          </details>
          <p>
            Linked worktrees share this identity unless Git per-worktree configuration is enabled.
            Conflicting assignments are rejected.
          </p>
          <div class="actions">
            <UiButton
              :disabled="busy || profiles.state.syncing || assignment === (target?.profileId || '')"
              @click="apply"
              >Apply to workspace</UiButton
            >
          </div>
        </section>
        <section v-if="profiles.state.effective" class="profile-card">
          <h3>Current repository identity</h3>
          <strong
            >{{ profiles.state.effective.Name }} &lt;{{
              profiles.state.effective.Email
            }}&gt;</strong
          >
          <p>
            {{ profiles.state.effective.Label }} · Commit signing
            {{ profiles.state.effective.SigningEnabled === 'true' ? 'on' : 'off' }}
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
<style scoped>
.profiles-page {
  overflow: auto;
  padding: 28px;
  color: var(--text);
  height: 100%;
}
.profiles-heading,
.section-heading,
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.profiles-heading {
  margin-bottom: 24px;
}
h2 {
  margin: 4px 0 8px;
  font-size: 24px;
}
h3 {
  margin: 0;
  font-size: 14px;
}
h4 {
  margin: 8px 0 0;
  font-size: 12px;
}
p {
  color: var(--text-mut);
  font-size: 12px;
  line-height: 1.65;
  margin: 8px 0;
}
.eyebrow {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--accent-text);
}
.profiles-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 760px);
  gap: 24px;
}
.profiles-list nav {
  display: grid;
  gap: 6px;
  margin: 16px 0;
}
.profiles-list nav button {
  display: grid;
  gap: 6px;
  text-align: left;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  background: var(--surface-raised);
  cursor: pointer;
  overflow-wrap: anywhere;
}
.profiles-list nav button[aria-current] {
  border-color: var(--accent);
  background: var(--selected);
}
.profiles-list span,
.profiles-list small {
  color: var(--text-mut);
  font-size: 11px;
}
.profiles-editor,
.profile-card,
.import-form {
  display: grid;
  gap: 16px;
}
.profile-card {
  padding: 24px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: 10px;
}
fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 16px;
  min-width: 0;
}
legend {
  padding: 12px 0;
  font-size: 12px;
  font-weight: 600;
}
label {
  display: grid;
  gap: 8px;
  color: var(--text-mut);
  font-size: 12px;
  min-width: 0;
}
input,
select {
  width: 100%;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  background: var(--surface-panel);
  font: inherit;
}
.field-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.save-preview {
  padding: 14px;
  border-radius: 6px;
  background: var(--surface-panel);
  font-size: 12px;
}
code {
  display: block;
  overflow-wrap: anywhere;
  color: var(--text-mut);
  font-size: 11px;
  margin-top: 6px;
}
.actions {
  justify-content: flex-end;
}
.error {
  color: var(--danger, #df8b83);
}
.notice {
  color: var(--accent-text);
}
summary {
  cursor: pointer;
  font-size: 12px;
}
li {
  margin: 10px 0;
  font-size: 12px;
}
@media (max-width: 850px) {
  .profiles-layout {
    grid-template-columns: 190px minmax(0, 1fr);
    gap: 14px;
  }
  .profiles-page {
    padding: 16px;
  }
  .field-pair {
    grid-template-columns: 1fr;
  }
  .profile-card {
    padding: 16px;
  }
}
@media (max-width: 600px) {
  .profiles-layout {
    grid-template-columns: 1fr;
  }
}
</style>
