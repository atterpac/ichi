<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Events } from '@wailsio/runtime'
import type { Branch } from '../../bindings/github.com/atterpac/ichi/internal/git'
import type {
  ReviewSnapshot,
  ReviewWalkthrough,
} from '../../bindings/github.com/atterpac/ichi/desktop/services/models'
import * as ReviewService from '../../bindings/github.com/atterpac/ichi/desktop/services/reviewservice'
import { usePreferenceBindings } from '../../customization/usePreferences'
import { useDialogFocus } from '../../composables/useDialogFocus'
import DiffView from '../diff/DiffView.vue'
import SurfaceState from '../common/SurfaceState.vue'
import UiButton from '../common/UiButton.vue'

const props = defineProps<{
  branches: Branch[]
  defaultBase?: string
  defaultHead?: string
  repositoryPath?: string
}>()
const emit = defineEmits<{ close: [] }>()
const settings = usePreferenceBindings()
const base = ref(props.defaultBase || props.branches[0]?.Name || '')
const head = ref(
  props.defaultHead && props.defaultHead !== base.value
    ? props.defaultHead
    : props.branches.find((b) => b.Name !== base.value)?.Name || '',
)
const focus = ref('')
const model = computed({
  get: () =>
    settings[settings['review.backend'] === 'codex' ? 'review.codexModel' : 'review.ollamaModel'],
  set: (value: string) => {
    settings[settings['review.backend'] === 'codex' ? 'review.codexModel' : 'review.ollamaModel'] =
      value
  },
})
const dialog = ref<HTMLElement | null>(null)
useDialogFocus(dialog, () => emit('close'))
const snapshot = shallowRef<ReviewSnapshot | null>(null)
const tour = shallowRef<ReviewWalkthrough | null>(null)
const phase = ref<'idle' | 'loading' | 'generating'>('idle')
const error = ref('')
const notice = ref('')
const progress = ref('')
let runID = ''
let stopProgress: (() => void) | undefined
const outdated = ref(false)
const freshnessError = ref('')
const stepIndex = ref(-1)
const referenceID = ref('')
const reviewed = ref(new Set<number>())
const uncoveredOnly = ref(false)
const diffViewer = ref<InstanceType<typeof DiffView> | null>(null)
const activeStep = computed(() => tour.value?.steps[stepIndex.value])
const covered = computed(() => new Set(tour.value?.steps.flatMap((step) => step.diffRefs) ?? []))
const references = computed(() => snapshot.value?.References ?? [])
const visibleReferences = computed(() =>
  activeStep.value
    ? references.value.filter((ref) => activeStep.value!.diffRefs.includes(ref.ID))
    : references.value.filter((ref) => !uncoveredOnly.value || !covered.value.has(ref.ID)),
)
const selectedReference = computed(() =>
  references.value.find((ref) => ref.ID === referenceID.value),
)
const selectedFile = computed(() =>
  selectedReference.value
    ? (snapshot.value?.Files[selectedReference.value.FileIndex] ?? null)
    : null,
)
const busy = computed(() => phase.value !== 'idle')
const generationBlocker = computed(() => {
  if (phase.value === 'loading') return 'Wait for the comparison to finish loading.'
  if (phase.value === 'generating') return 'A tour is being generated.'
  if (!snapshot.value)
    return error.value
      ? 'The comparison could not be loaded. Check the error below and retry.'
      : 'Load a comparison first.'
  if (!references.value.length)
    return `No new changes on ${head.value} from the common ancestor. Try swapping base and head.`
  if (settings['review.backend'] === 'ollama' && !model.value.trim())
    return 'Enter an installed Ollama model name to generate a tour.'
  return ''
})
const canGenerate = computed(() => !generationBlocker.value)
let version = 0
let alive = true
let pending: { cancel?: () => void } | undefined
let freshnessRead: { cancel?: () => void } | undefined
let timer: ReturnType<typeof setInterval> | undefined

function cancel() {
  version++
  runID = ''
  pending?.cancel?.()
  pending = undefined
  if (busy.value) notice.value = 'Cancelled. You can retry when ready.'
  phase.value = 'idle'
}
function reset() {
  cancel()
  freshnessRead?.cancel?.()
  snapshot.value = null
  tour.value = null
  error.value = notice.value = freshnessError.value = ''
  outdated.value = false
  stepIndex.value = -1
  referenceID.value = ''
  reviewed.value = new Set()
  uncoveredOnly.value = false
}
watch([base, head, () => props.repositoryPath], reset)

async function loadComparison() {
  reset()
  const generation = version
  phase.value = 'loading'
  try {
    const request = ReviewService.Compare(base.value, head.value)
    pending = request
    const result = await request
    if (!alive || generation !== version) return
    if (!result) throw new Error('Comparison unavailable')
    snapshot.value = result
    referenceID.value = result.References[0]?.ID ?? ''
  } catch (cause) {
    if (alive && generation === version) error.value = String(cause)
  } finally {
    if (alive && generation === version) {
      phase.value = 'idle'
      pending = undefined
    }
  }
}

async function generate() {
  if (!canGenerate.value || !snapshot.value) return
  const id = snapshot.value.ID
  const generation = ++version
  runID = crypto.randomUUID()
  progress.value = 'Preparing the tour…'
  phase.value = 'generating'
  error.value = notice.value = ''
  try {
    const request = ReviewService.Generate(id, {
      Backend: settings['review.backend'],
      Model: model.value.trim(),
      Focus: focus.value,
      RunID: runID,
    })
    pending = request
    const result = await request
    if (!alive || generation !== version) return
    if (!result || result.snapshotId !== id)
      throw new Error('Walkthrough does not match this comparison')
    tour.value = result
    reviewed.value = new Set()
    selectStep(0)
    void checkFreshness()
  } catch (cause) {
    if (alive && generation === version) error.value = String(cause)
  } finally {
    if (alive && generation === version) {
      phase.value = 'idle'
      pending = undefined
    }
  }
}

function selectStep(index: number) {
  stepIndex.value = index
  uncoveredOnly.value = false
  referenceID.value =
    index >= 0 ? (tour.value?.steps[index]?.diffRefs[0] ?? '') : (references.value[0]?.ID ?? '')
}
function toggleReviewed() {
  const next = new Set(reviewed.value)
  if (next.has(stepIndex.value)) next.delete(stepIndex.value)
  else next.add(stepIndex.value)
  reviewed.value = next
}
watch(uncoveredOnly, () => {
  referenceID.value = visibleReferences.value[0]?.ID ?? ''
})
watch(referenceID, async () => {
  await nextTick()
  const target = selectedReference.value
  if (target && target.HunkIndex >= 0) await diffViewer.value?.revealHunk(target.HunkIndex, false)
})
async function checkFreshness() {
  if (!snapshot.value || freshnessRead) return
  const id = snapshot.value.ID
  const request = ReviewService.IsOutdated(id)
  freshnessRead = request
  try {
    const changed = await request
    if (alive && snapshot.value?.ID === id) {
      outdated.value = changed
      freshnessError.value = ''
    }
  } catch {
    if (alive && snapshot.value?.ID === id)
      freshnessError.value = 'Could not check branch updates. Reload the comparison to refresh.'
  } finally {
    if (freshnessRead === request) freshnessRead = undefined
  }
}
onMounted(() => {
  stopProgress = Events.On('review:progress', (event) => {
    const data = event.data as { runId?: string; snapshotId?: string; message?: string }
    if (
      phase.value === 'generating' &&
      runID &&
      data.runId === runID &&
      data.snapshotId === snapshot.value?.ID &&
      typeof data.message === 'string'
    )
      progress.value = data.message
  })
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void checkFreshness()
  }, 15000)
  window.addEventListener('focus', checkFreshness)
})
onBeforeUnmount(() => {
  alive = false
  cancel()
  stopProgress?.()
  freshnessRead?.cancel?.()
  clearInterval(timer)
  window.removeEventListener('focus', checkFreshness)
})
</script>

<template>
  <Teleport to="body">
    <div class="review-backdrop">
      <section
        ref="dialog"
        class="branch-review"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        tabindex="-1"
      >
        <header class="review-header">
          <div>
            <h2 id="review-title">Guided branch review</h2>
            <p>Follow the important changes, with the original diffs alongside.</p>
          </div>
          <UiButton @click="emit('close')">Close</UiButton>
        </header>
        <form class="review-controls" @submit.prevent="loadComparison">
          <label
            >Base branch<select v-model="base" :disabled="busy">
              <option v-for="branch in branches" :key="branch.Name" :value="branch.Name">
                {{ branch.Name }}
              </option>
            </select></label
          >
          <span class="review-direction" aria-hidden="true">→</span>
          <label
            >Head branch<select v-model="head" :disabled="busy">
              <option v-for="branch in branches" :key="branch.Name" :value="branch.Name">
                {{ branch.Name }}
              </option>
            </select></label
          >
          <UiButton :disabled="busy" @click="[base, head] = [head, base]">Swap branches</UiButton>
          <UiButton :disabled="busy || !base || !head || base === head" @click="loadComparison">{{
            snapshot ? 'Reload comparison' : 'Load comparison'
          }}</UiButton>
          <span class="review-help"
            >Changes from the common ancestor to head. No checkout needed.</span
          >
        </form>
        <div class="review-controls review-generation">
          <label
            >Assistant<select v-model="settings['review.backend']" :disabled="busy">
              <option value="codex">Codex</option>
              <option value="ollama">Ollama</option>
            </select></label
          >
          <label
            >Model<input
              v-model="model"
              :disabled="busy"
              maxlength="100"
              :placeholder="
                settings['review.backend'] === 'codex' ? 'Codex default' : 'Installed model name'
              "
          /></label>
          <label class="review-focus"
            >Review focus<input
              v-model="focus"
              :disabled="busy"
              maxlength="2000"
              placeholder="Optional, e.g. behavior changes and tests"
          /></label>
          <UiButton
            variant="primary"
            :disabled="!canGenerate"
            :title="generationBlocker || 'Generate a guided walkthrough'"
            aria-describedby="review-generation-reason"
            @click="generate"
            >{{ tour ? 'Regenerate tour' : 'Generate tour' }}</UiButton
          >
          <UiButton v-if="busy" @click="cancel">Cancel</UiButton>
          <p id="review-generation-reason" class="review-help review-provider-note" role="status">
            {{
              generationBlocker ||
              (snapshot && snapshot.AnalysisBatches > 1
                ? `Ready to analyze ${snapshot.AnalysisBatches} parts and combine them into one tour.`
                : 'Ready to generate a tour.')
            }}
          </p>
          <p class="review-help review-provider-note">
            {{
              settings['review.backend'] === 'codex'
                ? 'Sends this diff to OpenAI using your Codex login. Run codex login first.'
                : 'Uses Ollama on this device. Enter a local model from ollama list; 64k context is requested.'
            }}
            Tours stay in this view for this first version.
          </p>
        </div>
        <p v-if="busy" class="review-banner" role="status">
          {{
            phase === 'loading'
              ? 'Loading the comparison…'
              : progress || 'Examining changes and organizing the tour…'
          }}
        </p>
        <p v-if="notice" class="review-banner" role="status">{{ notice }}</p>
        <p v-if="error" class="review-banner review-error" role="alert">{{ error }}</p>
        <p v-if="outdated || freshnessError" class="review-banner" role="status">
          {{
            outdated
              ? 'Branches have changed. These diffs still show the captured commits. Reload to review the latest changes.'
              : freshnessError
          }}
        </p>
        <template v-if="snapshot">
          <div class="review-revisions">
            <span>Base {{ snapshot.BaseCommit.slice(0, 8) }}</span
            ><span>Common ancestor {{ snapshot.MergeBase.slice(0, 8) }}</span
            ><span>Head {{ snapshot.HeadCommit.slice(0, 8) }}</span
            ><span>{{ snapshot.Files.length }} files</span>
          </div>
          <p v-if="snapshot.GenerationNote" class="review-banner">{{ snapshot.GenerationNote }}</p>
          <SurfaceState
            v-if="!references.length"
            title="No changes to review"
            message="The head has no changes from the common ancestor."
          />
          <div v-else class="review-content">
            <aside class="review-sidebar" aria-label="Review steps">
              <template v-if="tour">
                <p class="review-summary">{{ tour.summary }}</p>
                <p class="review-help">
                  {{ covered.size }} / {{ references.length }} change sections linked ·
                  {{ reviewed.size }} / {{ tour.steps.length }} steps reviewed
                </p>
                <button
                  v-for="(step, index) in tour.steps"
                  :key="index"
                  class="review-step"
                  :aria-current="stepIndex === index ? 'step' : undefined"
                  @click="selectStep(index)"
                >
                  <span>{{ reviewed.has(index) ? '✓' : index + 1 }}</span
                  >{{ step.title }}
                </button>
              </template>
              <p v-else class="review-help">
                Browse the captured changes, or generate a tour to group them by purpose.
              </p>
              <UiButton block :active="stepIndex === -1" @click="selectStep(-1)"
                >All changes ({{ references.length }})</UiButton
              >
              <p v-if="tour" class="review-help">
                {{ references.length - covered.size }} sections outside the tour. Linked does not
                mean reviewed.
              </p>
            </aside>
            <section class="review-detail" aria-label="Review diff">
              <div v-if="activeStep" class="review-explanation">
                <div class="review-step-heading">
                  <h3>{{ activeStep.title }}</h3>
                  <UiButton size="sm" :active="reviewed.has(stepIndex)" @click="toggleReviewed">{{
                    reviewed.has(stepIndex) ? 'Reviewed' : 'Mark reviewed'
                  }}</UiButton>
                </div>
                <p>{{ activeStep.explanation }}</p>
                <div class="review-step-navigation">
                  <UiButton size="sm" :disabled="stepIndex === 0" @click="selectStep(stepIndex - 1)"
                    >Previous</UiButton
                  ><span>Step {{ stepIndex + 1 }} of {{ tour?.steps.length }}</span
                  ><UiButton
                    size="sm"
                    :disabled="stepIndex + 1 === tour?.steps.length"
                    @click="selectStep(stepIndex + 1)"
                    >Next</UiButton
                  >
                </div>
              </div>
              <label v-else-if="tour" class="review-uncovered"
                ><input v-model="uncoveredOnly" type="checkbox" /> Only changes outside the
                tour</label
              >
              <label class="review-target"
                >Diff section<select v-model="referenceID">
                  <option
                    v-for="reference in visibleReferences"
                    :key="reference.ID"
                    :value="reference.ID"
                  >
                    {{ reference.Label }}
                  </option>
                </select></label
              >
              <DiffView
                v-if="selectedFile && selectedReference && selectedReference.HunkIndex >= 0"
                :key="`${snapshot.ID}:${selectedReference.FileIndex}`"
                ref="diffViewer"
                :diff="selectedFile"
                read-only
                @exit="dialog?.querySelector<HTMLSelectElement>('.review-target select')?.focus()"
              />
              <SurfaceState
                v-else-if="selectedFile"
                :title="selectedFile.Path"
                :message="snapshot.FileDetails[selectedReference!.FileIndex] || 'No text hunks.'"
              />
              <SurfaceState
                v-else
                title="No sections to show"
                message="All change sections are linked in the tour."
              />
            </section>
          </div>
        </template>
        <SurfaceState
          v-else-if="phase !== 'loading'"
          title="Choose two branches"
          message="Load their changes, then generate a guided walkthrough."
        />
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.review-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: #0008;
  padding: var(--space-5);
  display: flex;
}
.branch-review {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4);
  gap: var(--space-4);
  border-bottom: 1px solid var(--border);
}
h2,
h3,
p {
  margin: 0;
}
h2 {
  font-size: var(--fs-lg);
}
h3 {
  font-size: var(--fs-md);
}
.review-header p,
.review-help {
  color: var(--text-mut);
  font-size: var(--fs-xs);
}
.review-controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: end;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
}
.review-controls label,
.review-target {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--fs-xs);
  min-width: 0;
}
.review-controls select,
.review-controls input,
.review-target select {
  background: var(--surface-panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  font: inherit;
  min-width: 0;
  max-width: 100%;
}
.review-controls label {
  flex: 1;
  min-width: 140px;
}
.review-controls .review-focus {
  flex: 2;
}
.review-direction {
  align-self: center;
}
.review-provider-note {
  flex-basis: 100%;
}
.review-banner {
  padding: var(--space-2) var(--space-4);
  background: var(--surface-panel);
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}
.review-error {
  color: var(--red);
}
.review-revisions {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
  padding: var(--space-2) var(--space-4);
  color: var(--text-mut);
  font: var(--fs-xs) var(--font-mono);
  border-bottom: 1px solid var(--border);
}
.review-content {
  display: grid;
  grid-template-columns: minmax(230px, 28%) minmax(0, 1fr);
  flex: 1;
  min-height: 0;
}
.review-sidebar {
  overflow: auto;
  padding: var(--space-4);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.review-summary {
  font-size: var(--fs-sm);
  line-height: 1.6;
  white-space: pre-wrap;
}
.review-step {
  display: flex;
  gap: var(--space-3);
  text-align: left;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-panel);
  color: var(--text);
  cursor: pointer;
  font: inherit;
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}
.review-step span {
  color: var(--accent-text);
}
.review-step[aria-current] {
  border-color: var(--accent);
  background: color-mix(in oklab, var(--accent) 10%, var(--surface-panel));
}
.review-detail {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.review-detail > :deep(.diff-view) {
  flex: 1;
  min-height: 0;
}
.review-explanation {
  padding: var(--space-4);
  border-bottom: 1px solid var(--border);
  max-height: 35%;
  overflow: auto;
}
.review-step-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.review-explanation p {
  margin-top: var(--space-3);
  line-height: 1.6;
  font-size: var(--fs-sm);
  white-space: pre-wrap;
}
.review-step-navigation {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  margin-top: var(--space-3);
  font-size: var(--fs-xs);
  color: var(--text-mut);
}
.review-target,
.review-uncovered {
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--border);
}
.review-uncovered {
  font-size: var(--fs-sm);
}
@media (max-width: 760px) {
  .review-backdrop {
    padding: 0;
  }
  .branch-review {
    border-radius: 0;
    overflow: auto;
  }
  .review-content {
    display: flex;
    flex-direction: column;
    min-height: 600px;
  }
  .review-sidebar {
    max-height: 180px;
    border-right: 0;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .review-detail {
    flex: 1;
  }
}
</style>
