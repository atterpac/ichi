/** A count with its singular or plural noun, shared by status and review surfaces. */
export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
