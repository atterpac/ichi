<script setup lang="ts">
import { useOpenProfile } from './profile'
defineProps<{ name: string; login?: string; commit?: string; email?: string }>()
const openProfile = useOpenProfile()
</script>
<template>
  <span
    class="person-name"
    role="button"
    tabindex="0"
    :aria-label="`View ${name} contributions`"
    @click.stop="openProfile({ name, login, commit, email })"
    @contextmenu.prevent.stop="openProfile({ name, login, commit, email })"
    @keydown.enter.stop="openProfile({ name, login, commit, email })"
    @keydown.space.prevent.stop="openProfile({ name, login, commit, email })"
    >{{ name }}</span
  >
</template>
<style scoped>
.person-name {
  cursor: pointer;
}
.person-name:hover {
  text-decoration: underline;
}
.person-name:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
