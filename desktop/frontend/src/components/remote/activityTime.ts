export function activityTime(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || date.getFullYear() < 2) return ''
  const days = Math.floor(Math.max(0, Date.now() - date.getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}),
  })
}
