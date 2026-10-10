<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useOpenProfile } from '../people/profile'
const openProfile = useOpenProfile()
import { loadAuthorAvatar, loadAvatarURL, safeAvatarURL } from '../graph/authorAvatars'
import { placeholderSvg } from './avatarPlaceholder'
import { usePreferenceBindings } from '../../customization/usePreferences'
import { emailAvatarHash, resolveCommitAvatarURL } from '../graph/authorIdentity'

const props = withDefaults(
  defineProps<{
    name: string
    commit?: string
    email?: string
    avatarUrl?: string
    size?: number
    interactive?: boolean
    login?: string
  }>(),
  { size: 20, interactive: true },
)
const source = ref('')
const settings = usePreferenceBindings()
const placeholder = computed(() =>
  placeholderSvg(props.name, settings['appearance.avatarPlaceholder']),
)
watch(
  () => [props.commit, props.email, props.name, props.avatarUrl],
  async (_, __, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    source.value = ''
    try {
      const supplied = safeAvatarURL(props.avatarUrl ?? '')
      if (supplied) {
        source.value = supplied
        return
      }
      const url = props.commit ? await resolveCommitAvatarURL(props.commit) : ''
      if (cancelled) return
      const image = url
        ? await loadAvatarURL(url)
        : props.email
          ? await loadAuthorAvatar(await emailAvatarHash(props.email))
          : null
      if (!cancelled && image) source.value = image.src
    } catch {
      /* Keep the local creature when attribution is unavailable. */
    }
  },
  { immediate: true },
)
</script>

<template>
  <span
    class="author-avatar"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.max(8, size * 0.36)}px` }"
    :aria-hidden="interactive ? undefined : true"
    :role="interactive ? 'button' : undefined"
    :tabindex="interactive ? 0 : undefined"
    :aria-label="interactive ? `View ${name} contributions` : undefined"
    @click="
      interactive &&
      ($event.stopPropagation(), openProfile({ name, commit, email, avatarUrl, login }))
    "
    @contextmenu="
      interactive &&
      ($event.preventDefault(),
      $event.stopPropagation(),
      openProfile({ name, commit, email, avatarUrl, login }))
    "
    @keydown.enter.stop="interactive && openProfile({ name, commit, email, avatarUrl, login })"
    @keydown.space.prevent.stop="
      interactive && openProfile({ name, commit, email, avatarUrl, login })
    "
  >
    <img
      v-if="source"
      :src="source"
      alt=""
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="source = ''"
    />
    <span v-else class="author-placeholder" v-html="placeholder" />
  </span>
</template>

<style scoped>
.author-avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text);
  font-family: var(--font-mono);
  line-height: 1;
  vertical-align: middle;
}
.author-avatar[role='button'] {
  cursor: pointer;
}
.author-avatar:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.author-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.author-avatar:has(.author-placeholder) {
  background: transparent;
}
.author-placeholder,
.author-placeholder :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
