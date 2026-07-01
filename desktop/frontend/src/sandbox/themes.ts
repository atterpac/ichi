/**
 * Theme palettes for the sandbox, mirroring a subset of ichi's TUI color
 * schemes (which come from dado). Each theme is a flat map of CSS custom
 * properties applied to :root by the store. Add more freely — the floating
 * bar's theme selector is generated from this object's keys.
 *
 * Convention for variable names (consume these in your playground markup):
 *   --bg        canvas background
 *   --bg-soft   slightly raised surface (cards, the floating bar)
 *   --fg        primary text
 *   --fg-muted  secondary / dim text
 *   --accent    primary accent (active state, focus)
 *   --accent-2  secondary accent
 *   --border    hairline borders
 *   --grid      the faint sandbox grid lines
 */
export interface Theme {
  '--bg': string
  '--bg-soft': string
  '--fg': string
  '--fg-muted': string
  '--accent': string
  '--accent-2': string
  '--border': string
  '--grid': string
}

export const themes: Record<string, Theme> = {
  'tokyonight-night': {
    '--bg': '#1a1b26',
    '--bg-soft': '#24283b',
    '--fg': '#c0caf5',
    '--fg-muted': '#565f89',
    '--accent': '#7aa2f7',
    '--accent-2': '#bb9af7',
    '--border': '#2f344d',
    '--grid': 'rgba(122, 162, 247, 0.06)',
  },
  'catppuccin-mocha': {
    '--bg': '#1e1e2e',
    '--bg-soft': '#313244',
    '--fg': '#cdd6f4',
    '--fg-muted': '#6c7086',
    '--accent': '#89b4fa',
    '--accent-2': '#f5c2e7',
    '--border': '#45475a',
    '--grid': 'rgba(137, 180, 250, 0.06)',
  },
  'gruvbox-dark': {
    '--bg': '#282828',
    '--bg-soft': '#3c3836',
    '--fg': '#ebdbb2',
    '--fg-muted': '#928374',
    '--accent': '#fabd2f',
    '--accent-2': '#8ec07c',
    '--border': '#504945',
    '--grid': 'rgba(250, 189, 47, 0.05)',
  },
  rosepine: {
    '--bg': '#191724',
    '--bg-soft': '#1f1d2e',
    '--fg': '#e0def4',
    '--fg-muted': '#6e6a86',
    '--accent': '#c4a7e7',
    '--accent-2': '#ebbcba',
    '--border': '#26233a',
    '--grid': 'rgba(196, 167, 231, 0.06)',
  },
  nord: {
    '--bg': '#2e3440',
    '--bg-soft': '#3b4252',
    '--fg': '#eceff4',
    '--fg-muted': '#7b88a1',
    '--accent': '#88c0d0',
    '--accent-2': '#a3be8c',
    '--border': '#434c5e',
    '--grid': 'rgba(136, 192, 208, 0.06)',
  },
  dracula: {
    '--bg': '#282a36',
    '--bg-soft': '#343746',
    '--fg': '#f8f8f2',
    '--fg-muted': '#6272a4',
    '--accent': '#bd93f9',
    '--accent-2': '#ff79c6',
    '--border': '#44475a',
    '--grid': 'rgba(189, 147, 249, 0.06)',
  },
  /** Pure black sandbox default — maximal contrast for design work. */
  void: {
    '--bg': '#000000',
    '--bg-soft': '#0c0c0f',
    '--fg': '#e6e6e6',
    '--fg-muted': '#666666',
    '--accent': '#3b82f6',
    '--accent-2': '#22d3ee',
    '--border': '#1c1c22',
    '--grid': 'rgba(255, 255, 255, 0.045)',
  },
}

export type ThemeName = keyof typeof themes
export const defaultTheme: ThemeName = 'void'
