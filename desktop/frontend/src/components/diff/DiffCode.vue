<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ content: string; path: string; highlight?: [number, number] | null }>()
// Conservative, line-local highlighting; Vue escapes every token as text.
// Unknown file types remain plain text, and word-diff marks retain precedence.
const supported = /\.(?:[cm]?[jt]sx?|vue|svelte|go|rs|py|rb|java|c|cpp|h|cs|json|ya?ml|toml|sh|css|html)$/i
const keywords = new Set('const let var function return if else for while class extends import from export default async await new null undefined true false type interface public private static void package func struct map range defer go fn pub use impl match def in self None True False try catch throw switch case break continue'.split(' '))
const tokens = computed(() => {
  const result: { text: string; kind: string; marked: boolean }[] = []
  const text = props.content
  const add = (start: number, end: number, kind = '') => {
    if (end <= start) return
    const points = [start, end, ...(props.highlight ?? []).filter(point => point > start && point < end)].sort((a, b) => a - b)
    for (let i = 0; i < points.length - 1; i++) {
      const left = points[i]!, right = points[i + 1]!
      result.push({ text: text.slice(left, right), kind, marked: !!props.highlight && left >= props.highlight[0] && right <= props.highlight[1] })
    }
  }
  if (!supported.test(props.path)) { add(0, text.length); return result }
  const pattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\/\/.*$|\/\*.*?\*\/)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_$][\w$]*)\b/g
  let end = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index
    add(end, start)
    const kind = match[1] ? 'string' : match[2] ? 'comment' : match[3] ? 'number' : keywords.has(match[0]) ? 'keyword' : ''
    add(start, start + match[0].length, kind)
    end = start + match[0].length
  }
  add(end, text.length)
  return result
})
</script>
<template><template v-for="(token, index) in tokens" :key="index"><mark v-if="token.marked" :class="token.kind && `syntax-${token.kind}`">{{ token.text }}</mark><span v-else :class="token.kind && `syntax-${token.kind}`">{{ token.text }}</span></template></template>
