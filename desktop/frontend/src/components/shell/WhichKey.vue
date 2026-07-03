<script setup lang="ts">
import { NAV_GROUPS } from './nav'

defineEmits<{ (e: 'select', id: string): void; (e: 'close'): void }>()
</script>

<template>
  <div class="whichkey" @click.self="$emit('close')">
    <div class="wk-panel" role="menu" aria-label="Go to view">
      <div class="wk-head">
        <span class="kbadge">space</span>
        <span class="wk-crumb">Go to view</span>
      </div>
      <div class="wk-groups">
        <div v-for="group in NAV_GROUPS" :key="group.title" class="wk-group">
          <span class="wk-title">{{ group.title }}</span>
          <button
            v-for="item in group.items"
            :key="item.id"
            class="wk-item"
            type="button"
            role="menuitem"
            @click="$emit('select', item.id)"
          >
            <kbd>{{ item.key }}</kbd>
            <span class="wk-label">{{ item.label }}</span>
          </button>
        </div>
      </div>
      <footer class="wk-foot">
        <span><kbd>g s c …</kbd> jump</span>
        <span><kbd>esc</kbd> close</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.whichkey{position:fixed;inset:0;z-index:80;display:flex;align-items:flex-end;justify-content:center;padding:0 16px 38px;background:rgba(8,8,14,.5);backdrop-filter:blur(2px)}
.wk-panel{width:min(680px,100%);border:1px solid var(--border-2);border-radius:14px;background:color-mix(in oklab,var(--surface) 96%,transparent);box-shadow:var(--shadow-2);overflow:hidden}
.wk-head{display:flex;align-items:center;gap:11px;padding:11px 15px;border-bottom:1px solid var(--border);background:var(--surface-2)}
.kbadge{flex:none;padding:3px 9px;border-radius:6px;background:var(--accent);color:var(--accent-ink);font:700 11px "JetBrains Mono",ui-monospace,monospace;text-transform:uppercase}
.wk-crumb{flex:none;color:var(--text-dim);font-size:13px}
.wk-groups{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px 14px;padding:10px}
.wk-group{display:flex;flex-direction:column;gap:3px;min-width:0}
.wk-title{padding:2px 10px 5px;color:var(--text-mut);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.wk-item{display:flex;align-items:center;gap:10px;border:0;border-radius:9px;background:transparent;color:var(--text-dim);padding:7px 10px;text-align:left;cursor:pointer;font:inherit}
.wk-item:hover{background:var(--accent-soft);box-shadow:inset 0 0 0 1px var(--accent-line);color:var(--text)}
.wk-item kbd{flex:none;min-width:22px;color:var(--accent)}
.wk-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
.wk-foot{display:flex;flex-wrap:wrap;gap:16px;padding:9px 16px;border-top:1px solid var(--border);background:var(--surface-2)}
.wk-foot span{display:flex;align-items:center;gap:6px;color:var(--text-mut);font-size:11px}
.wk-foot kbd{color:var(--text-dim)}
@media (max-width:640px){.wk-groups{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
