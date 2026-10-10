<script setup lang="ts">
import { computed, ref } from 'vue'
import { renderMarkdown, safeMarkdownURL } from './markdown'
const props = defineProps<{ body: string; baseUrl?: string; repoUrl?: string }>()
const emit = defineEmits<{ open: [url: string] }>()
const html = computed(() => renderMarkdown(props.body, props.baseUrl, props.repoUrl))
const copyStatus = ref('')
async function activate(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null
  const link = target?.closest('a')
  if (link) {
    event.preventDefault()
    const url = safeMarkdownURL(link.getAttribute('href') ?? '')
    if (url) emit('open', url)
    return
  }
  const button = target?.closest<HTMLButtonElement>('.md-copy-code')
  if (!button || event.button !== 0) return
  const code = button.closest('figure')?.querySelector('code')
  if (!code) return
  try {
    await navigator.clipboard.writeText(code.textContent ?? '')
    copyStatus.value = 'Code copied.'
  } catch {
    copyStatus.value = 'Could not copy. Select the code and copy it manually.'
  }
}
</script>
<template>
  <div class="markdown-body">
    <!-- Only sanitized output from renderMarkdown is inserted here. -->
    <div class="markdown-content" @click="activate" @auxclick="activate" v-html="html" />
    <span class="md-copy-status" role="status">{{ copyStatus }}</span>
  </div>
</template>
<style scoped>
.markdown-body {
  min-width: 0;
  font-size: var(--fs-md);
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.markdown-content :deep(> :first-child) {
  margin-top: 0;
}
.markdown-content :deep(> :last-child) {
  margin-bottom: 0;
}
.markdown-content :deep(p),
.markdown-content :deep(ul),
.markdown-content :deep(ol),
.markdown-content :deep(blockquote) {
  margin: 0.75em 0;
}
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  color: var(--head);
  line-height: 1.3;
  margin: 1.2em 0 0.5em;
}
.markdown-content :deep(h1) {
  font-size: 1.4em;
}
.markdown-content :deep(h2) {
  font-size: 1.25em;
}
.markdown-content :deep(h3) {
  font-size: 1.1em;
}
.markdown-content :deep(a) {
  color: var(--accent-text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 1.7em;
}
.markdown-content :deep(li + li) {
  margin-top: 0.3em;
}
.markdown-content :deep(input[type='checkbox']) {
  margin-right: 6px;
  accent-color: var(--accent);
}
.markdown-content :deep(blockquote) {
  border-left: 3px solid var(--accent-line);
  padding: 2px 14px;
  color: var(--text-dim);
  background: var(--surface-2);
}
.markdown-content :deep(code),
.markdown-content :deep(kbd) {
  font-family: var(--font-mono);
  font-size: 0.9em;
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--surface-2);
}
.markdown-content :deep(kbd) {
  border: 1px solid var(--border);
}
.markdown-content :deep(pre) {
  margin: 0;
  padding: 12px;
  overflow: auto;
  max-height: 500px;
  white-space: pre;
  tab-size: 4;
}
.markdown-content :deep(pre code) {
  padding: 0;
  background: none;
  font-size: var(--fs-sm);
  white-space: pre;
  overflow-wrap: normal;
}
.markdown-content :deep(.md-code-block) {
  margin: 12px 0;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  overflow: hidden;
}
.markdown-content :deep(figcaption) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text-mut);
  font-size: var(--fs-xs);
}
.markdown-content :deep(.md-copy-code) {
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  background: var(--surface-input);
  padding: 3px 8px;
  cursor: pointer;
}
.markdown-content :deep(.md-copy-code:focus-visible),
.markdown-content :deep(pre:focus-visible),
.markdown-content :deep(.md-table:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.markdown-content :deep(.hljs-keyword),
.markdown-content :deep(.hljs-selector-tag),
.markdown-content :deep(.hljs-title) {
  color: var(--accent-text);
}
.markdown-content :deep(.hljs-string),
.markdown-content :deep(.hljs-addition) {
  color: var(--positive-text);
}
.markdown-content :deep(.hljs-number),
.markdown-content :deep(.hljs-literal),
.markdown-content :deep(.hljs-attr) {
  color: var(--warning-text);
}
.markdown-content :deep(.hljs-comment),
.markdown-content :deep(.hljs-quote) {
  color: var(--text-mut);
}
.markdown-content :deep(.hljs-deletion) {
  color: var(--negative-text);
}
.markdown-content :deep(.md-table) {
  overflow: auto;
  max-width: 100%;
  margin: 12px 0;
}
.markdown-content :deep(table) {
  border-collapse: collapse;
  min-width: 50%;
  font-size: var(--fs-sm);
}
.markdown-content :deep(th),
.markdown-content :deep(td) {
  padding: 7px 10px;
  border: 1px solid var(--border);
  text-align: left;
}
.markdown-content :deep(th) {
  background: var(--surface-2);
  color: var(--head);
}
.markdown-content :deep(img) {
  max-width: 100%;
  max-height: 500px;
  object-fit: contain;
  border-radius: 4px;
}
.markdown-content :deep(details) {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px 12px;
  margin: 12px 0;
}
.markdown-content :deep(summary) {
  cursor: pointer;
  color: var(--head);
}
.markdown-content :deep(hr) {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 16px 0;
}
.md-copy-status {
  display: block;
  color: var(--text-mut);
  font-size: var(--fs-xs);
}
.md-copy-status:empty {
  display: none;
}
</style>
