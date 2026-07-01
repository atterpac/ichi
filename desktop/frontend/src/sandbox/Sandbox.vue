<script setup lang="ts">
import { onMounted } from 'vue'
import { applyTheme, sandbox } from './store'
import { defaultTheme } from './themes'
import FloatingBar from './components/FloatingBar.vue'
import Playground from './playground/Playground.vue'

onMounted(() => applyTheme(defaultTheme))
</script>

<template>
  <div class="sandbox-root">
    <!-- Faint grid backdrop denoting the sandbox surface -->
    <div v-show="sandbox.showGrid" class="sandbox-grid" aria-hidden="true" />

    <!-- The wipeable design surface. /sandbox-create only rewrites Playground. -->
    <main class="sandbox-stage">
      <Playground />
    </main>

    <FloatingBar />

    <div class="sandbox-watermark">sandbox</div>
  </div>
</template>

<style scoped>
.sandbox-root {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.sandbox-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(to right, var(--grid) 1px, transparent 1px),
    linear-gradient(to bottom, var(--grid) 1px, transparent 1px);
  background-size: var(--grid-size) var(--grid-size);
  /* Soften toward the edges so the surface feels infinite. */
  mask-image: radial-gradient(ellipse 90% 80% at 50% 45%, #000 60%, transparent 100%);
}

.sandbox-stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  padding-bottom: 96px; /* clearance for the floating bar */
}

.sandbox-watermark {
  position: absolute;
  top: 16px;
  left: 18px;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--fg-muted);
  opacity: 0.5;
  pointer-events: none;
  user-select: none;
}
</style>
