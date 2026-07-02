<script setup lang="ts">
/**
 * Design 6 — prefix trees. Branches collapse into folders by their slash
 * prefix (feature/, fix/, spike/…), each folder carrying aggregate drift
 * and its freshest age. Scales past the point flat lists fall apart.
 */
import { computed, ref } from 'vue'
import { PhCaretRight, PhFolderSimple } from '@phosphor-icons/vue'
import { BRANCHES, splitName, type Branch } from './branches'

interface Group {
  name: string
  branches: Branch[]
  ahead: number
  behind: number
  freshest: string
}

const collapsed = ref(new Set<string>(['spike']))
const selected = ref<string>(BRANCHES.find((b) => b.current)?.name ?? '')

const groups = computed<Group[]>(() => {
  const map = new Map<string, Branch[]>()
  for (const branch of BRANCHES) {
    const { group } = splitName(branch.name)
    const list = map.get(group) ?? []
    list.push(branch)
    map.set(group, list)
  }
  return [...map.entries()]
    .map(([name, branches]) => {
      const sortedBranches = [...branches].sort((a, b) => a.ageScore - b.ageScore)
      return {
        name,
        branches: sortedBranches,
        ahead: branches.reduce((sum, b) => sum + b.ahead, 0),
        behind: branches.reduce((sum, b) => sum + b.behind, 0),
        freshest: sortedBranches[0]!.age,
      }
    })
    .sort((a, b) => (a.name === '·' ? -1 : b.name === '·' ? 1 : a.name.localeCompare(b.name)))
})

function toggle(name: string) {
  const next = new Set(collapsed.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  collapsed.value = next
}
</script>

<template>
  <div class="tree">
    <section v-for="group in groups" :key="group.name" class="group">
      <button type="button" class="folder" @click="toggle(group.name)">
        <PhCaretRight :size="11" weight="bold" class="caret" :class="{ open: !collapsed.has(group.name) }" />
        <PhFolderSimple v-if="group.name !== '·'" :size="14" weight="bold" class="folder-icon" />
        <span class="folder-name">{{ group.name === '·' ? 'refs' : `${group.name}/` }}</span>
        <span class="folder-count">{{ group.branches.length }}</span>
        <span class="folder-meta">
          <span v-if="group.ahead" class="ahead">+{{ group.ahead }}</span>
          <span v-if="group.behind" class="behind">−{{ group.behind }}</span>
          <span class="age">{{ group.freshest }}</span>
        </span>
      </button>

      <div v-if="!collapsed.has(group.name)" class="leaves">
        <button
          v-for="(branch, i) in group.branches"
          :key="branch.name"
          type="button"
          class="leaf"
          :class="{ selected: selected === branch.name, merged: branch.merged }"
          @click="selected = branch.name"
        >
          <span class="rail" :class="{ last: i === group.branches.length - 1 }" />
          <span class="leaf-name">
            {{ splitName(branch.name).rest }}
            <span v-if="branch.current" class="chip">HEAD</span>
            <span v-if="branch.merged" class="note">merged</span>
            <span v-else-if="branch.upstream === 'gone'" class="note warn">gone</span>
          </span>
          <span class="leaf-meta">
            <span v-if="branch.ahead" class="ahead">+{{ branch.ahead }}</span>
            <span v-if="branch.behind" class="behind">−{{ branch.behind }}</span>
            <span class="age">{{ branch.age }}</span>
          </span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tree {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
}

.group { margin-bottom: 4px; }

.folder {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.folder:hover { background: color-mix(in srgb, var(--fg) 4%, transparent); }

.caret { color: var(--fg-muted); transition: transform 0.15s ease; }
.caret.open { transform: rotate(90deg); }

.folder-icon { color: var(--accent); }

.folder-name { font-size: 12px; font-weight: 700; color: var(--fg); }

.folder-count {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 9.5px;
  color: var(--fg-muted);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0 7px;
}

.folder-meta {
  margin-left: auto;
  display: flex;
  gap: 8px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 10px;
}

.leaves { display: flex; flex-direction: column; }

.leaf {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 10px 6px 34px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.leaf:hover { background: color-mix(in srgb, var(--fg) 4%, transparent); }
.leaf.selected { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.leaf.merged .leaf-name { opacity: 0.55; }

/* tree rail: vertical line + elbow into each leaf */
.rail {
  position: absolute;
  left: 15px;
  top: 0;
  bottom: 0;
  width: 12px;
  pointer-events: none;
}

.rail::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-left: 1px solid var(--border);
}

.rail.last::before { bottom: 50%; }

.rail::after {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 10px;
  border-top: 1px solid var(--border);
}

.leaf-name {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chip {
  flex: none;
  font-size: 8.5px;
  font-weight: 700;
  color: var(--bg);
  background: var(--accent);
  border-radius: 999px;
  padding: 1px 6px;
}

.note { font-size: 9.5px; font-style: italic; color: var(--fg-muted); }
.note.warn { color: var(--accent-2); }

.leaf-meta {
  margin-left: auto;
  display: flex;
  gap: 8px;
  flex: none;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 9.5px;
}

.ahead { color: var(--accent); }
.behind { color: var(--accent-2); }
.age { color: var(--fg-muted); width: 30px; text-align: right; }
</style>
