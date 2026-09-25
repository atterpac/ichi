<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'default' | 'primary' | 'danger' | 'ghost'
    size?: 'sm' | 'md' | 'lg'
    iconOnly?: boolean
    active?: boolean
    block?: boolean
    loading?: boolean
    disabled?: boolean
  }>(),
  {
    variant: 'default',
    size: 'md',
    iconOnly: false,
    active: false,
    block: false,
    loading: false,
    disabled: false,
  },
)
</script>

<template>
  <button
    class="ui-button"
    :class="[`variant-${variant}`, `size-${size}`, { 'icon-only': iconOnly, active, block }]"
    :aria-busy="loading || undefined"
    :disabled="disabled || loading"
    type="button"
  >
    <slot />
  </button>
</template>
