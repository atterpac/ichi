import { reactive } from 'vue'

/** Module-scoped so the inspected file survives view switches (the shell
 * v-if ladder unmounts views on navigation). */
const state = reactive({
  file: '',
})

export function useFileInspect() {
  return state
}
