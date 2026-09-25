<script setup lang="ts">
import { DIFF, selectedFile } from './worktree'

defineProps<{ minimap?: boolean; bare?: boolean }>()
</script>

<template>
  <div class="diff" :class="{ bare }">
    <header v-if="!bare && selectedFile" class="diff-head">
      <span class="diff-path">{{ selectedFile.path }}</span>
      <span class="diff-stat"><b class="add">+{{ selectedFile.add }}</b> <b class="del">−{{ selectedFile.del }}</b></span>
      <span class="diff-actions"><button type="button">Stage hunk</button><button type="button">Discard</button></span>
    </header>
    <div class="diff-body">
      <div class="diff-lines">
        <div v-for="(line, i) in DIFF" :key="i" class="line" :class="line.kind">
          <template v-if="line.kind === 'hunk'"><span class="hunk">{{ line.text }}</span></template>
          <template v-else>
            <span class="ln">{{ line.old ?? '' }}</span><span class="ln">{{ line.new ?? '' }}</span>
            <span class="sign">{{ line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' ' }}</span>
            <code>{{ line.text }}</code>
          </template>
        </div>
      </div>
      <div v-if="minimap" class="minimap" aria-hidden="true">
        <span v-for="(line, i) in DIFF" :key="i" :class="line.kind" />
        <span class="viewport" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.diff {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
}
.diff-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  font: 12px var(--mono);
}
.diff-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.add {
  color: var(--add);
  font-weight: 500;
}
.del {
  color: var(--del);
  font-weight: 500;
}
.diff-actions {
  display: flex;
  gap: 6px;
}
.diff-actions button {
  border: 1px solid var(--border);
  border-radius: 5px;
  background: transparent;
  color: var(--fg-muted);
  font: 11px var(--mono);
  padding: 3px 8px;
  cursor: pointer;
}
.diff-actions button:hover {
  color: var(--fg);
  background: var(--hover);
}
.diff-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: auto;
}
.diff-lines {
  flex: 1;
  min-width: 0;
  padding: 6px 0;
  font: 12px/20px var(--mono);
}
.line {
  display: grid;
  grid-template-columns: 40px 40px 18px 1fr;
  white-space: pre;
}
.line.add {
  background: color-mix(in srgb, var(--add) 12%, transparent);
}
.line.del {
  background: color-mix(in srgb, var(--del) 12%, transparent);
}
.line.add .sign {
  color: var(--add);
}
.line.del .sign,
.line.del code {
  color: var(--del);
}
.line.hunk {
  display: block;
  margin: 6px 0;
  padding: 2px 14px;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--accent);
}
.ln {
  padding-right: 8px;
  color: var(--fg-muted);
  text-align: right;
  opacity: 0.6;
}
code {
  font: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
}
.minimap {
  position: relative;
  flex: none;
  width: 44px;
  padding: 6px 6px;
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.minimap span {
  height: 3px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--fg) 10%, transparent);
}
.minimap .add {
  background: var(--add);
}
.minimap .del {
  background: var(--del);
}
.minimap .hunk {
  background: var(--accent);
  margin-top: 4px;
}
.minimap .viewport {
  position: absolute;
  inset: 4px 3px auto 3px;
  height: 46px;
  border: 1px solid color-mix(in srgb, var(--fg) 30%, transparent);
  background: color-mix(in srgb, var(--fg) 5%, transparent);
}
</style>
