//go:build darwin && cgo

package services

import (
	"context"
	"strings"
	"testing"
)

func TestListSystemFonts(t *testing.T) {
	fonts, err := (&PreferencesService{}).ListSystemFonts(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(fonts) == 0 {
		t.Fatal("macOS returned no fonts")
	}
	mono := 0
	seen := map[string]bool{}
	for _, font := range fonts {
		key := strings.ToLower(font.Family)
		if key == "" || seen[key] {
			t.Fatalf("invalid duplicate font %q", font.Family)
		}
		seen[key] = true
		if font.Monospace {
			mono++
		}
	}
	if mono == 0 {
		t.Fatal("expected installed monospaced fonts")
	}
	t.Logf("Discovered %d font families, including %d monospaced", len(fonts), mono)
}
func TestListSystemFontsCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := (&PreferencesService{}).ListSystemFonts(ctx); err == nil {
		t.Fatal("expected cancellation")
	}
}
