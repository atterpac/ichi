import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vite'
import appConfig from './vite.config'

// Labs share application plugins and aliases, but never its output directory.
export default mergeConfig(appConfig, defineConfig({
  build: {
    outDir: 'dist-labs',
    rolldownOptions: {
      input: {
        graphPlayground: fileURLToPath(new URL('./graph-playground.html', import.meta.url)),
        conflictsAppLab: fileURLToPath(new URL('./conflicts-app-lab.html', import.meta.url)),
        operationsLab: fileURLToPath(new URL('./operations-lab.html', import.meta.url)),
        branchesLab: fileURLToPath(new URL('./branches-lab.html', import.meta.url)),
        switcherLab: fileURLToPath(new URL('./switcher-lab.html', import.meta.url)),
        avatarLab: fileURLToPath(new URL('./avatar-lab.html', import.meta.url)),
        reviewLab: fileURLToPath(new URL('./review-lab.html', import.meta.url)),
        workingTreeHeatmap: fileURLToPath(new URL('./working-tree-heatmap.html', import.meta.url)),
        components: fileURLToPath(new URL('./components.html', import.meta.url)),
        changesDesigns: fileURLToPath(new URL('./changes-designs.html', import.meta.url)),
        sandbox: fileURLToPath(new URL('./sandbox.html', import.meta.url)),
      },
    },
  },
}))
