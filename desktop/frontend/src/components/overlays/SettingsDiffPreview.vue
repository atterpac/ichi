<script setup lang="ts">
import DiffView from '../diff/DiffView.vue'
import { FileDiff, LineType } from '../../bindings/github.com/atterpac/ichi/internal/git'
const diff = FileDiff.createFrom({
  Path: 'src/settings.ts',
  Hunks: [
    {
      Header: '@@ -1,4 +1,4 @@',
      OldStart: 1,
      OldCount: 4,
      NewStart: 1,
      NewCount: 4,
      Expanded: true,
      Lines: [
        {
          Type: LineType.LineContext,
          Content: 'export const settings = {',
          OldLineNo: 1,
          NewLineNo: 1,
        },
        { Type: LineType.LineRemoved, Content: "  theme: 'dark',", OldLineNo: 2, NewLineNo: 0 },
        { Type: LineType.LineAdded, Content: "  theme: 'light',", OldLineNo: 0, NewLineNo: 2 },
        { Type: LineType.LineContext, Content: '  previews: true,', OldLineNo: 3, NewLineNo: 3 },
        { Type: LineType.LineContext, Content: '}', OldLineNo: 4, NewLineNo: 4 },
      ],
    },
  ],
})
const content = async () => "export const settings = {\n  theme: 'light',\n  previews: true,\n}\n"
</script>
<template>
  <div class="settings-diff-preview" aria-label="Diff preview">
    <DiffView :diff="diff" read-only :load-file-content="content" />
  </div>
  <p class="set-note">Sample code · your files are unchanged</p>
</template>
<style scoped>
.settings-diff-preview {
  height: 330px;
  display: flex;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.settings-diff-preview :deep(.diff-view) {
  min-width: 0;
  flex: 1;
}
</style>
