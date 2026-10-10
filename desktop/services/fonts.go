package services

import (
	"context"
	"sort"
	"strings"
)

type FontFamily struct {
	Family    string
	Monospace bool
}

// ListSystemFonts discovers installed fonts; it never downloads or installs fonts.
func (s *PreferencesService) ListSystemFonts(ctx context.Context) ([]FontFamily, error) {
	fonts, err := installedFontFamilies(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]FontFamily, 0, len(fonts))
	seen := make(map[string]bool)
	for _, font := range fonts {
		font.Family = strings.TrimSpace(font.Family)
		key := strings.ToLower(font.Family)
		if key == "" || strings.HasPrefix(key, ".") || seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, font)
	}
	sort.Slice(result, func(i, j int) bool { return strings.ToLower(result[i].Family) < strings.ToLower(result[j].Family) })
	return result, nil
}
