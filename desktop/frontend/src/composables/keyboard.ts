export function isEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}
export function isModified(event: KeyboardEvent) {
  return event.ctrlKey || event.metaKey || event.altKey || event.isComposing
}
/** Local widgets get first refusal; Escape then leaves the enclosing pane. */
export function returnFromPane(event: KeyboardEvent, target: HTMLElement | null) {
  if (event.defaultPrevented || isModified(event) || isEditable(event.target)) return
  if (!['Escape', 'h', 'ArrowLeft'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  target?.focus()
}
