package views

import (
	"github.com/atterpac/dado/components"
	"github.com/atterpac/dado/input"
)

// hintsFrom builds a view's key hints from its action registry, the single
// source of truth, optionally bracketed by navigation/back hints the registry
// does not own (handled by the underlying table/tree/textview).
func hintsFrom(reg *input.ActionRegistry, before, after []components.KeyHint) []components.KeyHint {
	out := make([]components.KeyHint, 0, len(before)+len(after)+8)
	out = append(out, before...)
	out = append(out, reg.Hints()...)
	out = append(out, after...)
	return out
}

var navHint = components.KeyHint{Key: "j/k", Description: "Navigate"}
var backHint = components.KeyHint{Key: "Esc", Description: "Back"}
