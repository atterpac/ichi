package git

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestCommitCoreAndDeferredMetadata(t *testing.T) {
	repo, run := diffTestRepo(t)
	write := func(path, content string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(repo.path, path), []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write("old spaced.txt", "one\ntwo\nthree\n")
	run("add", ".")
	run("commit", "-m", "root | subject\n\nbody | text")
	root := strings.TrimSpace(run("rev-parse", "HEAD"))
	detail, err := repo.LoadCommit(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	if detail.Subject != "root | subject" || !strings.Contains(detail.Body, "body | text") || detail.Stats.Insertions != 3 || len(detail.Parents) != 0 {
		t.Fatalf("bad root: %+v", detail)
	}
	run("mv", "old spaced.txt", "new spaced.txt")
	write("binary.dat", "a\x00b")
	specialPath := "tab\tline\nbreak.txt"
	if runtime.GOOS == "windows" {
		specialPath = "special spaced.txt"
	}
	write(specialPath, "special\n")
	run("add", ".")
	run("commit", "-m", "child | subject")
	run("config", "log.showSignature", "true")
	run("config", "color.ui", "always")
	trace := filepath.Join(t.TempDir(), "trace")
	t.Setenv("GIT_TRACE", trace)
	detail, err = repo.LoadCommit(context.Background(), "HEAD")
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Files) != 3 || detail.Stats.FilesChanged != 3 || detail.Stats.Insertions != 1 || detail.ParentSubjects[0] != "root | subject" {
		t.Fatalf("bad child: %+v", detail)
	}
	files := map[string]ChangedFile{}
	for _, f := range detail.Files {
		files[f.Path] = f
	}
	if f := files["new spaced.txt"]; f.OldPath != "old spaced.txt" || f.Status != FileRenamed || f.Insertions != 0 {
		t.Fatalf("rename: %+v", f)
	}
	if !files["binary.dat"].Binary || files[specialPath].Insertions != 1 {
		t.Fatalf("files: %+v", files)
	}
	log, err := os.ReadFile(trace)
	if err != nil {
		t.Fatal(err)
	}
	if n := strings.Count(string(log), "built-in: git"); n != 3 {
		t.Fatalf("want 3 core commands; got %d: %s", n, log)
	}
	if strings.Contains(string(log), "%G?") || strings.Contains(string(log), "--contains") {
		t.Fatalf("expensive metadata in core: %s", log)
	}
	run("branch", "contains-HEAD-word")
	metadata, err := repo.LoadCommitMetadata(context.Background(), detail.Hash)
	if err != nil {
		t.Fatal(err)
	}
	if metadata.GPGStatus.Signed || !strings.Contains(strings.Join(metadata.Branches, ","), "contains-HEAD-word") {
		t.Fatalf("metadata: %+v", metadata)
	}
	run("branch", "fresh-branch")
	metadata, err = repo.LoadCommitMetadata(context.Background(), detail.Hash)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(strings.Join(metadata.Branches, ","), "fresh-branch") {
		t.Fatal("stale branches")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := repo.LoadCommit(ctx, root); !errors.Is(err, context.Canceled) {
		t.Fatalf("core cancel: %v", err)
	}
	if _, err := repo.LoadCommitMetadata(ctx, root); !errors.Is(err, context.Canceled) {
		t.Fatalf("metadata cancel: %v", err)
	}
	if _, err := repo.LoadCommit(context.Background(), "missing-commit"); err == nil {
		t.Fatal("missing commit accepted")
	}
}

func TestCommitMergeUsesFirstParent(t *testing.T) {
	repo, run := diffTestRepo(t)
	run("commit", "--allow-empty", "-m", "root")
	branch := strings.TrimSpace(run("branch", "--show-current"))
	run("checkout", "-b", "side")
	if err := os.WriteFile(filepath.Join(repo.path, "side.txt"), []byte("side\n"), 0600); err != nil {
		t.Fatal(err)
	}
	run("add", ".")
	run("commit", "-m", "side")
	run("checkout", branch)
	run("commit", "--allow-empty", "-m", "main")
	run("merge", "--no-ff", "side", "-m", "merge")
	detail, err := repo.LoadCommit(context.Background(), "HEAD")
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Parents) != 2 || strings.Join(detail.ParentSubjects, ",") != "main,side" || len(detail.Files) != 1 || detail.Files[0].Path != "side.txt" || detail.Stats.Insertions != 1 {
		t.Fatalf("merge: %+v", detail)
	}
	empty, err := repo.LoadCommit(context.Background(), "HEAD^1")
	if err != nil || len(empty.Files) != 0 {
		t.Fatalf("empty: %+v, %v", empty, err)
	}
}

func TestParseCommitFilesRejectsTruncatedRecords(t *testing.T) {
	for _, out := range []string{":bad", ":100644 100644 a b R100\x00old\x00", ":100644 100644 a b M\x00file\x00", ":100644 100644 a b M\x00file\x001\t0\tother\x00"} {
		if _, err := parseCommitFiles(out); err == nil {
			t.Fatalf("accepted %q", out)
		}
	}
}

func TestCommitCoreDoesNotVerifySignedCommit(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell verifier fixture")
	}
	repo, run := diffTestRepo(t)
	run("commit", "--allow-empty", "-m", "signed fixture")
	raw := run("cat-file", "commit", "HEAD")
	raw = strings.Replace(raw, "\n\n", "\ngpgsig -----BEGIN PGP SIGNATURE-----\n fixture\n -----END PGP SIGNATURE-----\n\n", 1)
	cmd := repo.command("hash-object", "-t", "commit", "-w", "--stdin")
	cmd.Stdin = strings.NewReader(raw)
	out, err := cmd.Output()
	if err != nil {
		t.Fatal(err)
	}
	hash := strings.TrimSpace(string(out))
	marker := filepath.Join(t.TempDir(), "invocations")
	verifier := filepath.Join(t.TempDir(), "verify")
	if err := os.WriteFile(verifier, []byte("#!/bin/sh\necho invoked >> \"$ICHI_TEST_VERIFY_LOG\"\necho '[GNUPG:] ERRSIG 0123456789ABCDEF 1 8 00 1234567890 9'\necho '[GNUPG:] NO_PUBKEY 0123456789ABCDEF'\nexit 1\n"), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ICHI_TEST_VERIFY_LOG", marker)
	run("config", "gpg.program", verifier)
	run("config", "log.showSignature", "true")
	if _, err := repo.LoadCommit(context.Background(), hash); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatalf("core invoked verification: %v", err)
	}
	metadata, err := repo.LoadCommitMetadata(context.Background(), hash)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(marker); err != nil {
		t.Fatalf("metadata did not verify: %v", err)
	}
	if !metadata.GPGStatus.Signed || metadata.GPGStatus.Valid {
		t.Fatalf("failed verification reported unsigned or valid: %+v", metadata.GPGStatus)
	}
}

func TestCommitReadCancelsRunningProcess(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell process fixture")
	}
	repo, _ := diffTestRepo(t)
	bin := t.TempDir()
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte("#!/bin/sh\nexec sleep 30\n"), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if _, err := repo.LoadCommit(ctx, "HEAD"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("running command cancellation: %v", err)
	}
}
