<script setup lang="ts">
import { useOpenProfile } from '../people/profile'
const openProfile = useOpenProfile()
import AuthorAvatar from '../common/AuthorAvatar.vue'
defineProps<{ author: string; avatarUrl?: string }>()
</script>
<template>
  <span
    class="activity-identity"
    role="button"
    tabindex="0"
    :aria-label="`View ${author} contributions`"
    @click.stop="openProfile({ name: author, login: author, avatarUrl })"
    @contextmenu.prevent.stop="openProfile({ name: author, login: author, avatarUrl })"
    @keydown.enter.stop="openProfile({ name: author, login: author, avatarUrl })"
    @keydown.space.prevent.stop="openProfile({ name: author, login: author, avatarUrl })"
    ><AuthorAvatar
      :name="author"
      :avatar-url="avatarUrl"
      :size="26"
      :interactive="false"
    /><strong>{{ author }}</strong></span
  >
</template>
<style scoped>
.activity-identity {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
