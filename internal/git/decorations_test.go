package git

import "testing"

func TestParseDecorations(t *testing.T) {
	remotes := map[string]bool{"origin": true, "upstream": true}

	got := parseDecorations("HEAD -> main, origin/main, tag: v1.2.0, feature/graph-refs, upstream/main", remotes)
	want := []RefDecoration{
		{Name: "main", Kind: "branch", IsHead: true},
		{Name: "origin/main", Kind: "remote"},
		{Name: "v1.2.0", Kind: "tag"},
		{Name: "feature/graph-refs", Kind: "branch"},
		{Name: "upstream/main", Kind: "remote"},
	}
	if len(got) != len(want) {
		t.Fatalf("got %d decorations, want %d: %+v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("decoration %d = %+v, want %+v", i, got[i], want[i])
		}
	}
}

func TestParseDecorationsDetachedAndEmpty(t *testing.T) {
	if d := parseDecorations("", nil); d != nil {
		t.Errorf("empty ref string should yield nil, got %+v", d)
	}
	// A branch literally named like a remote prefix stays a branch when no remote matches.
	got := parseDecorations("HEAD, origin/x", map[string]bool{})
	if len(got) != 2 || got[0].Kind != "head" || got[1].Kind != "branch" {
		t.Errorf("unexpected classification: %+v", got)
	}
}
