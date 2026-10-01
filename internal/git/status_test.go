package git

import "testing"

func TestParseStatusV2(t *testing.T) {
	out := "1 M. N... 100644 100644 100644 1111111 2222222 cmd/main.go\x00" +
		"1 .M N... 100644 100644 100644 1111111 2222222 pkg/util.go\x00" +
		"2 R. N... 100644 100644 100644 1111111 2222222 R100 pkg/new.go\x00pkg/old.go\x00" +
		"? untracked.txt\x00" +
		"! ignored.log\x00" +
		"u UU N... 100644 100644 100644 100644 1111111 2222222 3333333 conflict.go\x00"

	got := parseStatusV2(out)
	if len(got) != 6 {
		t.Fatalf("got %d entries, want 6: %+v", len(got), got)
	}

	want := []StatusEntry{
		{Path: "cmd/main.go", IndexStatus: FileModified, WorkStatus: FileUnchanged, IsStaged: true},
		{Path: "pkg/util.go", IndexStatus: FileUnchanged, WorkStatus: FileModified, IsStaged: false},
		{Path: "pkg/new.go", OldPath: "pkg/old.go", IndexStatus: FileRenamed, WorkStatus: FileUnchanged, IsStaged: true},
		{Path: "untracked.txt", WorkStatus: FileUntracked, IsUntracked: true},
		{Path: "ignored.log", WorkStatus: FileIgnored},
		{Path: "conflict.go", IndexStatus: FileConflict, WorkStatus: FileConflict, IsConflict: true},
	}
	for i, w := range want {
		if got[i] != w {
			t.Errorf("entry %d:\n got %+v\nwant %+v", i, got[i], w)
		}
	}
}
