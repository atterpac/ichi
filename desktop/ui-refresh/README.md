# Ichi UI refresh study

Open `index.html` directly in a browser. It is self-contained: no install, network requests, fonts, or desktop backend required. All commits and diffs are illustrative. The prototype does not change the application.

## Review of the current implementation

The graph's structure is worth keeping: refs sit beside the lanes, columns align, selection has a leading accent, and keyboard navigation supports fast scanning. Shared lane colors and existing density preferences are good foundations.

The main opportunities, based on the Vue components and styles:

- **Surface separation:** `theme/tokens.css` sets `--read-bg` to `--surface`, and `theme/views/graph.css` uses it for the inspector. The graph and inspector therefore share a background. Define a dedicated inspector surface, slightly lighter in dark themes, with a single boundary. Keep shadows subtle and mainly on overlays; the large outer shadow in this study frames the presentation, not a proposed in-app card.
- **Inspector hierarchy:** the current 320px panel places the SHA before a 14px title, followed by a bordered stats strip, individually ruled file rows, and individually ruled metadata rows. Increase the default width to approximately 350px, use a 20–21px title, group author/time, and replace most separators with 16–24px spacing. Put files in the default tab and long metadata in a secondary tab. Retain copy and commit actions in the production header; the study demonstrates copy only.
- **Type roles:** the app already declares Inter and JetBrains Mono with fallbacks. Establish consistent roles rather than adding another font: 13px primary row text, 11–12px metadata, 17px view headings, and 20–21px inspector headings. Keep monospace for refs, SHAs, paths, and numeric deltas; author names and dates can use sans serif. The preview uses local font fallbacks and does not bundle fonts.
- **Color:** preserve the existing shared lane palette and branch/ref color relationship. Reduce saturation in surrounding chrome and reserve the interface accent for selection/focus. Keep explicit status letters and signed deltas so color is not the only cue. The study explores graphite and warm light palettes; it is not a replacement for all existing themes.
- **Density:** the current app offers 30/36/44px rows. The study explores 34px compact and 42px comfortable spacing. Choose final values after comparing with large repositories. Any production row-height change must also update canvas positioning and keyboard/scroll assumptions; do not change CSS heights alone.
- **Responsive behavior:** preserve horizontal access to the graph, collapse lower-priority columns first, and move the inspector below it at narrow widths. The preview demonstrates this below 850px; desktop integration should also keep the existing hidden/bottom inspector preferences.

## Preview interactions

- Select commits; use ↑/↓ or j/k while a row is focused.
- Search messages, authors, refs, or SHAs; `/` focuses search and Escape clears it.
- Filtered rows hide connecting lines to avoid presenting incorrect ancestry.
- Toggle light/dark, compact/comfortable, and inspector visibility.
- Switch Files/Metadata with click or tab arrow keys.
- Select a file for an explicitly illustrative diff dialog.
- Copy the sample SHA where browser clipboard access is supported.

## Suggested implementation order

1. Add semantic surface and type tokens in `frontend/src/theme/tokens.css`; check both light and dark themes.
2. Restructure the inspector in `frontend/src/components/graph/GraphView.vue` and its rules in `frontend/src/theme/views/graph.css`. Preserve loading/error/working-tree states, existing actions, file navigation, and detail settings.
3. Refine table metadata contrast and density, coordinating changes with `GraphCanvas.vue`.
4. Apply the same control sizing and spacing to shared primitives and shell chrome.

Validation: JSDOM checks passed for rendering, commit selection, file updates, tab switching, theme/density controls, inspector visibility, search, empty results, and keyboard navigation. No browser screenshot or native Wails visual review was performed. Review the preview in a browser before choosing the direction; native font rendering, long paths, narrow windows, focus contrast, and all theme palettes still need visual validation during integration.
