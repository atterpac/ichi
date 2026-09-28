import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueJsx(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        conflictsAppLab: fileURLToPath(new URL('./conflicts-app-lab.html', import.meta.url)),
        operationsLab: fileURLToPath(new URL('./operations-lab.html', import.meta.url)),
        branchesLab: fileURLToPath(new URL('./branches-lab.html', import.meta.url)),
        switcherLab: fileURLToPath(new URL('./switcher-lab.html', import.meta.url)),
        avatarLab: fileURLToPath(new URL('./avatar-lab.html', import.meta.url)),
        reviewLab: fileURLToPath(new URL('./review-lab.html', import.meta.url)),
        workingTreeHeatmap: fileURLToPath(new URL('./working-tree-heatmap.html', import.meta.url)),
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        components: fileURLToPath(new URL('./components.html', import.meta.url)),
        changesDesigns: fileURLToPath(new URL('./changes-designs.html', import.meta.url)),
      },
    },
  },
})
