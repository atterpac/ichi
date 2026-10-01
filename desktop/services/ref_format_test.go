package services

import (
	"strings"
	"testing"
)

func TestRefFormats(t *testing.T) {
	service := &PreferencesService{}
	results, err := service.FormatRefLabels([]RefFormatRequest{
		{Format: "{{if .Remote}}{{.Branch}} · {{.Remote}}{{else}}{{.Name}}{{end}}", Name: "origin/feature/topic", Branch: "feature/topic", Remote: "origin", Kind: "remote"},
		{Format: "{{if .Remote}}{{.Branch}} · {{.Remote}}{{else}}{{.Name}}{{end}}", Name: "main", Branch: "main", Kind: "branch"},
		{Format: "{{if and .Current (eq .Kind \"branch\")}}✓ {{end}}{{.Name}}", Name: "main", Kind: "branch", Current: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	for i, want := range []string{"feature/topic · origin", "main", "✓ main"} {
		if results[i].Text != want || results[i].Error != "" {
			t.Fatalf("%d: %+v", i, results[i])
		}
	}
}
func TestRefFormatBoundsAndFailures(t *testing.T) {
	formats := []string{"{{.Missing}}", "{{if}}", "{{template \"ref\" .}}", "{{define \"loop\"}}{{template \"loop\" .}}{{end}}{{template \"loop\" .}}", "{{range .Name}}{{.}}{{end}}", "{{printf \"%1000000000s\" .Name}}", "{{if .Current}}{{printf \"%s\" .Name}}{{end}}", "{{print .Name .Name}}", "{{(printf \"%1000000000s\" .Name).Missing}}", "{{.Name}}", "", "a\nb", strings.Repeat("a", 513)}
	requests := make([]RefFormatRequest, len(formats))
	for i, format := range formats {
		requests[i] = RefFormatRequest{Format: format, Name: strings.Repeat("n", 513)}
	}
	results, err := (&PreferencesService{}).FormatRefLabels(requests)
	if err != nil {
		t.Fatal(err)
	}
	for i, result := range results {
		if result.Error == "" || result.Text != "" {
			t.Fatalf("format %q unexpectedly succeeded: %+v", formats[i], result)
		}
	}
	if _, err = (&PreferencesService{}).FormatRefLabels(make([]RefFormatRequest, 513)); err == nil {
		t.Fatal("accepted oversized batch")
	}
}
