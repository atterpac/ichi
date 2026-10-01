<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { loadAuthorAvatar } from '../graph/authorAvatars'
import { placeholderSvg } from './avatarPlaceholder'
import { usePreferenceBindings } from '../../customization/usePreferences'
import { emailAvatarHash, resolveCommitAvatarHash } from '../graph/authorIdentity'

const props = withDefaults(defineProps<{ name: string; commit?: string; email?: string; size?: number }>(), { size: 20 })
const source = ref('')
const settings = usePreferenceBindings()
const placeholder = computed(() => placeholderSvg(props.name, settings['appearance.avatarPlaceholder']))
watch(() => [props.commit, props.email, props.name], async (_, __, onCleanup) => {
  let cancelled = false
  onCleanup(() => { cancelled = true })
  source.value = ''
  try {
    let hash = props.commit ? await resolveCommitAvatarHash(props.commit) : ''
    if (!hash && props.email) hash = await emailAvatarHash(props.email)
    if (cancelled || !hash) return
    const image = await loadAuthorAvatar(hash)
    if (!cancelled && image) source.value = image.src
  } catch { /* Keep the local creature when attribution is unavailable. */ }
}, { immediate: true })
</script>

<template>
  <span class="author-avatar" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.max(8, size * .36)}px` }" aria-hidden="true">
    <img v-if="source" :src="source" alt="" referrerpolicy="no-referrer" @error="source = ''" />
    <span v-else class="author-placeholder" v-html="placeholder" />
  </span>
</template>

<style scoped>
.author-avatar { display: inline-flex; flex: none; align-items: center; justify-content: center; overflow: hidden; border-radius: 4px; background: var(--surface-2); color: var(--text); font-family: var(--font-mono); line-height: 1; vertical-align: middle; }
.author-avatar img { display: block; width: 100%; height: 100%; object-fit: cover; }
.author-avatar:has(.author-placeholder) { background: transparent; }
.author-placeholder, .author-placeholder :deep(svg) { display: block; width: 100%; height: 100%; }
</style>
