/** A change map only earns its space once a file list is too long to scan. */
export const HEATMAP_MIN_FILES = 21
export const showsHeatmap = (fileCount: number) => fileCount >= HEATMAP_MIN_FILES
