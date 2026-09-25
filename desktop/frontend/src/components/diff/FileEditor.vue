<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, lineNumbers, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap } from '@codemirror/view'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { vim, Vim, getCM } from '@replit/codemirror-vim'
import UiButton from '../common/UiButton.vue'
import { useRepoSwitchGuard } from '../../composables/useRepoSwitchGuard'

const props = defineProps<{ content: string; line: number; lineOffset?: number; save: (original: string, content: string) => Promise<void> }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const host = ref<HTMLElement | null>(null)
const mode = ref('NORMAL')
const visual = computed(() => mode.value.startsWith('VISUAL'))
const error = ref('')
const saving = ref(false)
const discardPrompt = ref(false)
let view: EditorView | undefined
let alive = true
const newline = props.content.includes('\r\n') ? '\r\n' : '\n'
const normalized = props.content.replace(/\r\n/g, '\n')
useRepoSwitchGuard(() => saving.value ? 'Wait for the file to finish saving.' : view && view.state.doc.toString() !== normalized ? 'Save or close your edited file before switching repositories.' : '')
function close(force = false) {
  if (saving.value) return
  if (!force && view?.state.doc.toString() !== normalized) { discardPrompt.value = true; return }
  emit('close')
}
async function saveBuffer() {
  if (!view || saving.value) return
  const text = view.state.doc.toString().replace(/\n/g, newline)
  if (new TextEncoder().encode(text).length > 1024 * 1024 || view.state.doc.lines > 20000) {
    error.value = 'Editing is limited to 1 MiB and 20,000 lines.'; return
  }
  saving.value = true
  error.value = ''
  view.contentDOM.setAttribute('aria-busy', 'true')
  try {
    await props.save(props.content, text)
    if (alive) emit('saved')
  } catch (err) { if (alive) error.value = String(err) }
  finally { saving.value = false; view?.contentDOM.removeAttribute('aria-busy') }
}
// Ex commands dispatch through the owning editor, so multiple panes stay independent.
Vim.defineEx('write', 'w', cm => cm.signal('ichi-save', null))
Vim.defineEx('quit', 'q', (cm, params) => cm.signal('ichi-close', params.argString?.trim() === '!'))
Vim.defineEx('wq', 'wq', cm => cm.signal('ichi-save', null))
onMounted(() => {
  const state = EditorState.create({
    doc: normalized,
    extensions: [
      Prec.highest(keymap.of([{ key: 'Mod-s', run: () => { void saveBuffer(); return true } }, { key: 'Mod-Enter', run: () => { void saveBuffer(); return true } }])),
      vim(), lineNumbers(), history(), drawSelection(), highlightActiveLine(), highlightActiveLineGutter(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorState.transactionFilter.of(tr => saving.value && tr.docChanged ? [] : tr),
      EditorView.contentAttributes.of({ 'aria-label': 'Edit file', spellcheck: 'false' }),
      EditorView.theme({
        '&': { height: '100%', backgroundColor: 'var(--diff-code-bg, var(--surface-panel))', color: 'var(--diff-code-text, var(--read-text))' },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)', lineHeight: 'var(--diff-row-h, 20px)' },
        '.cm-content': { padding: 'var(--diff-row-h, 20px) 0 0', caretColor: 'var(--accent-text)' },
        '.cm-line': { padding: '0 var(--diff-code-padding, 0px)', lineHeight: 'var(--diff-row-h, 20px)' },
        '.cm-gutters': { backgroundColor: 'var(--diff-code-bg, var(--surface-panel))', color: 'var(--text-mut)', border: 'none', paddingRight: 'var(--diff-sign-width, 16px)' },
        '.cm-lineNumbers .cm-gutterElement': { boxSizing: 'border-box', minWidth: 'var(--diff-number-end, 88px)', padding: '0 var(--space-4) 0 var(--diff-number-start, 44px)', fontSize: 'var(--diff-number-size, var(--fs-sm))', lineHeight: 'var(--diff-row-h, 20px)', opacity: 'var(--diff-number-opacity, 0.7)' },
        '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--selected)' },
        '.cm-activeLineGutter': { position: 'relative', color: 'var(--text-mut)' },
        '.cm-activeLineGutter::before': { content: 'var(--diff-cursor-content, "")', position: 'absolute', left: '0', width: '20px', textAlign: 'center', fontSize: '18px', color: 'var(--accent-text)' },
        '&.cm-focused': { outline: 'none' },
        // Vim hides the native selection background; override its foreground too,
        // otherwise the OS highlight text can disappear against our subtle tint.
        '.cm-content ::selection, .cm-content::selection': { backgroundColor: 'transparent !important', color: 'var(--text) !important' },
        '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'color-mix(in oklch, var(--accent) 18%, var(--diff-code-bg, var(--surface-panel)))', boxShadow: 'inset 0 0 0 1px var(--editor-selection-edge, transparent)' },
        '&.cm-focused .cm-fat-cursor': { background: 'var(--accent-text)', color: 'var(--diff-code-bg, var(--surface-panel)) !important' },
        '&:not(.cm-focused) .cm-fat-cursor': { outline: '1px solid var(--accent-text)' },
        '.cm-panels': { backgroundColor: 'var(--diff-code-bg, var(--surface-panel))', color: 'var(--text-mut)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)' },
        '.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
        '.cm-vim-panel': { padding: '4px 20px' },
        '.cm-cursor': { borderLeftColor: 'var(--accent-text)' },
      }),
    ],
  })
  view = new EditorView({ state, parent: host.value! })
  const cm = getCM(view)!
  cm.on('ichi-save', () => { void saveBuffer() })
  cm.on('ichi-close', (force: boolean) => close(force))
  cm.on('vim-mode-change', (event: { mode: string; subMode?: string }) => {
    mode.value = event.mode === 'visual'
      ? event.subMode === 'linewise' ? 'VISUAL LINE' : event.subMode === 'blockwise' ? 'VISUAL BLOCK' : 'VISUAL'
      : event.mode.toUpperCase()
  })
  const pos = state.doc.line(Math.max(1, Math.min(props.line, state.doc.lines))).from
  view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: props.lineOffset ?? 0 }) })
  view.focus()
})
onBeforeUnmount(() => { alive = false; view?.destroy(); view = undefined })
defineExpose({ focus: () => view?.focus() })
</script>

<template>
  <div class="file-editor" :class="{ 'is-visual': visual }" @keydown.stop>
    <div class="cursor-review-actions file-editor-toolbar">
      <span class="file-editor-mode" role="status" aria-live="polite" aria-atomic="true">{{ mode }}</span>
      <small class="file-editor-hint">{{ visual ? 'Selection active · d delete · y yank · Esc normal' : ':w save · :q close' }}</small>
      <UiButton size="sm" :disabled="saving" @click="close()">Close</UiButton>
      <UiButton size="sm" :disabled="saving" @click="saveBuffer">{{ saving ? 'Saving…' : 'Save' }}</UiButton>
    </div>
    <div v-if="error" role="alert" class="file-editor-message">{{ error }}</div>
    <div v-if="discardPrompt" class="file-editor-message">
      Discard unsaved changes?
      <UiButton size="sm" @click="close(true)">Discard</UiButton>
      <UiButton size="sm" @click="discardPrompt = false; view?.focus()">Keep editing</UiButton>
    </div>
    <div ref="host" class="file-editor-host" />
  </div>
</template>

<style scoped>
.file-editor { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.file-editor-host { flex: 1; min-height: 0; overflow: hidden; }
.file-editor-toolbar { position: static; flex-shrink: 0; }
.file-editor-toolbar > .file-editor-mode { padding: 3px 7px; border-radius: 3px; font-weight: 700; letter-spacing: 0.06em; white-space: nowrap; }
.file-editor.is-visual { --editor-selection-edge: var(--accent-text); }
.is-visual .file-editor-toolbar { box-shadow: inset 0 -2px var(--accent-text); }
.is-visual .file-editor-mode { background: var(--accent); color: var(--accent-ink); }
.is-visual .file-editor-hint { color: var(--text); }
.file-editor-hint { color: var(--text-mut); font: 10px var(--font-mono); white-space: nowrap; }
.file-editor-message { padding: 8px 12px; font-size: 12px; }
</style>
