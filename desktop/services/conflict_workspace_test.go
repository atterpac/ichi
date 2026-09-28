package services

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/atterpac/ichi/internal/git"
)

func conflictTestRepo(t *testing.T) (string, func(...string) string) {
	t.Helper()
	root := profileTestEnv(t)
	repo := filepath.Join(root, "repo")
	if err := os.Mkdir(repo, 0755); err != nil {
		t.Fatal(err)
	}
	run := func(args ...string) string {
		t.Helper()
		out, err := exec.Command("git", append([]string{"-C", repo}, args...)...).CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %s %v", args, out, err)
		}
		return strings.TrimSpace(string(out))
	}
	run("init", "-b", "main")
	run("config", "user.name", "Test")
	run("config", "user.email", "test@example.test")
	run("config", "commit.gpgsign", "false")
	run("config", "core.autocrlf", "false")
	return repo, run
}
func conflictService(t *testing.T, path string) *ConflictService {
	t.Helper()
	repo, err := git.OpenRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	return &ConflictService{state: NewState(repo, nil)}
}
func makeTextConflict(t *testing.T, kind string) (string, *ConflictService, func(...string) string) {
	t.Helper()
	path, run := conflictTestRepo(t)
	writeProfile(t, filepath.Join(path, "file.txt"), "before\nbase\nafter\n")
	run("add", ".")
	run("commit", "-m", "base")
	run("checkout", "-b", "topic")
	writeProfile(t, filepath.Join(path, "file.txt"), "before\ntopic\nafter\n")
	run("commit", "-am", "topic change")
	topic := run("rev-parse", "HEAD")
	run("checkout", "main")
	writeProfile(t, filepath.Join(path, "file.txt"), "before\nmain\nafter\n")
	run("commit", "-am", "main change")
	args := []string{kind, "topic"}
	if kind == "rebase" {
		run("checkout", "topic")
		args = []string{"rebase", "main"}
	} else if kind == "cherry-pick" {
		args = []string{"cherry-pick", topic}
	}
	if out, err := exec.Command("git", append([]string{"-C", path}, args...)...).CombinedOutput(); err == nil {
		t.Fatalf("expected conflict: %s", out)
	}
	return path, conflictService(t, path), run
}
func TestRealConflictResolveAndContinue(t *testing.T) {
	for _, kind := range []string{"merge", "rebase", "cherry-pick"} {
		t.Run(kind, func(t *testing.T) {
			path, service, run := makeTextConflict(t, kind)
			w, err := service.Workspace()
			if err != nil {
				t.Fatal(err)
			}
			if w.Kind != kind || len(w.Files) != 1 || w.Token == "" {
				t.Fatalf("workspace: %+v", w)
			}
			if kind == "rebase" && (w.Step != 1 || w.Total != 1 || w.Commit == "") {
				t.Fatalf("rebase progress: %+v", w)
			}
			doc, err := service.LoadConflict(path, "file.txt")
			if err != nil {
				t.Fatal(err)
			}
			if !doc.Base.Exists || !doc.Current.Exists || !doc.Incoming.Exists {
				t.Fatalf("missing stages: %+v", doc)
			}
			if err := service.ControlConflict(path, w.Token, "continue"); err == nil {
				t.Fatal("continued unresolved operation")
			}
			if err := service.ResolveConflict(path, "file.txt", doc.Token, "edit", "<<<<<<< left\n"); err == nil {
				t.Fatal("staged unresolved markers")
			}
			if err := service.ResolveConflict(path, "file.txt", doc.Token, "edit", "before\nresolved\nafter\n"); err != nil {
				t.Fatal(err)
			}
			if got := run("show", ":file.txt"); got != "before\nresolved\nafter" {
				t.Fatal(got)
			}
			// Ambient editor must not launch or fail headless continuation.
			t.Setenv("GIT_EDITOR", "false")
			if err := service.ControlConflict(path, w.Token, "continue"); err != nil {
				t.Fatal(err)
			}
			final, err := service.Workspace()
			if err != nil || final.Kind != "" || len(final.Files) != 0 {
				t.Fatalf("completion: %+v %v", final, err)
			}
		})
	}
}
func TestConflictRejectsExternalEditsAndRepositorySwitch(t *testing.T) {
	path, service, _ := makeTextConflict(t, "merge")
	doc, err := service.LoadConflict(path, "file.txt")
	if err != nil {
		t.Fatal(err)
	}
	writeProfile(t, filepath.Join(path, "file.txt"), "external edit\n")
	if err := service.ResolveConflict(path, "file.txt", doc.Token, "edit", "lost edit"); err == nil || !strings.Contains(err.Error(), "changed externally") {
		t.Fatalf("expected stale guard: %v", err)
	}
	got, _ := os.ReadFile(filepath.Join(path, "file.txt"))
	if string(got) != "external edit\n" {
		t.Fatal("overwrote external edit")
	}
	if _, err := service.LoadConflict(path+"-other", "file.txt"); err == nil {
		t.Fatal("accepted wrong repository")
	}
	for _, p := range []string{"../outside", ".git/config", "file*", "file.txt\x00"} {
		if _, err := service.LoadConflict(path, p); err == nil {
			t.Fatalf("accepted %q", p)
		}
	}
}
func TestConflictDeletionAndBinaryChoices(t *testing.T) {
	for _, binary := range []bool{false, true} {
		t.Run(map[bool]string{false: "deletion", true: "binary"}[binary], func(t *testing.T) {
			path, run := conflictTestRepo(t)
			filename := "name [literal].dat"
			base := "base\n"
			left := "left\n"
			right := "right\n"
			if binary {
				base = "base\x00bytes"
				left = "left\x00bytes"
				right = "right\x00bytes"
			}
			writeProfile(t, filepath.Join(path, filename), base)
			run("add", ".")
			run("commit", "-m", "base")
			run("checkout", "-b", "topic")
			writeProfile(t, filepath.Join(path, filename), right)
			run("commit", "-am", "topic")
			run("checkout", "main")
			if binary {
				writeProfile(t, filepath.Join(path, filename), left)
				run("commit", "-am", "main")
			} else {
				run("rm", "--", filename)
				run("commit", "-m", "remove")
			}
			if err := exec.Command("git", "-C", path, "merge", "topic").Run(); err == nil {
				t.Fatal("expected conflict")
			}
			service := conflictService(t, path)
			doc, err := service.LoadConflict(path, filename)
			if err != nil {
				t.Fatal(err)
			}
			if binary && doc.Editable {
				t.Fatal("binary marked editable")
			}
			if !binary && doc.Current.Exists {
				t.Fatal("deleted version exists")
			}
			choice := "current"
			if binary {
				choice = "incoming"
			}
			if err := service.ResolveConflict(path, filename, doc.Token, choice, ""); err != nil {
				t.Fatal(err)
			}
			if binary {
				got, _ := os.ReadFile(filepath.Join(path, filename))
				if string(got) != right {
					t.Fatal("binary changed")
				}
			} else {
				if _, err := os.Stat(filepath.Join(path, filename)); !os.IsNotExist(err) {
					t.Fatal("deletion not kept")
				}
			}
			w, _ := service.Workspace()
			if len(w.Files) != 0 {
				t.Fatal("conflict not staged")
			}
		})
	}
}
func TestConflictPreservesCRLFModeAndNoFinalNewline(t *testing.T) {
	path, service, _ := makeTextConflict(t, "merge")
	content := "<<<<<<< HEAD\r\nmain\r\n=======\r\nother\r\n>>>>>>> topic\r\n"
	writeProfile(t, filepath.Join(path, "file.txt"), content)
	os.Chmod(filepath.Join(path, "file.txt"), 0755)
	doc, err := service.LoadConflict(path, "file.txt")
	if err != nil {
		t.Fatal(err)
	}
	if err := service.ResolveConflict(path, "file.txt", doc.Token, "edit", "resolved\nlast line"); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(filepath.Join(path, "file.txt"))
	info, _ := os.Stat(filepath.Join(path, "file.txt"))
	if string(got) != "resolved\r\nlast line" || info.Mode().Perm() != 0755 {
		t.Fatalf("content=%q mode=%v", got, info.Mode())
	}
}
func TestLinkedWorktreeConflictDetectionAndAbort(t *testing.T) {
	path, service, run := makeTextConflict(t, "merge")
	w, _ := service.Workspace()
	if err := service.ControlConflict(path, w.Token, "abort"); err != nil {
		t.Fatal(err)
	}
	linked := filepath.Join(filepath.Dir(path), "linked")
	run("worktree", "add", "-b", "linked", linked)
	if err := exec.Command("git", "-C", linked, "merge", "topic").Run(); err == nil {
		t.Fatal("expected conflict")
	}
	linkedService := conflictService(t, linked)
	state, err := linkedService.Workspace()
	if err != nil || state.Kind != "merge" || len(state.Files) != 1 {
		t.Fatalf("linked workspace: %+v %v", state, err)
	}
	if err := linkedService.ControlConflict(linked, state.Token, "abort"); err != nil {
		t.Fatal(err)
	}
	main, _ := service.Workspace()
	if main.Kind != "" {
		t.Fatal("affected main worktree")
	}
}
func TestRebaseSkipAndStaleOperation(t *testing.T) {
	path, service, _ := makeTextConflict(t, "rebase")
	w, _ := service.Workspace()
	if err := service.ControlConflict(path, w.Token, "skip"); err != nil {
		t.Fatal(err)
	}
	if err := service.ControlConflict(path, w.Token, "abort"); err == nil {
		t.Fatal("accepted stale operation")
	}
}
func TestConflictSymlinkIsNotFollowed(t *testing.T) {
	path, service, _ := makeTextConflict(t, "merge")
	outside := filepath.Join(filepath.Dir(path), "outside")
	writeProfile(t, outside, "preserve")
	os.Remove(filepath.Join(path, "file.txt"))
	if err := os.Symlink(outside, filepath.Join(path, "file.txt")); err != nil {
		t.Skip(err)
	}
	if _, err := service.LoadConflict(path, "file.txt"); err == nil {
		t.Fatal("followed symlink")
	}
	got, _ := os.ReadFile(outside)
	if string(got) != "preserve" {
		t.Fatal("changed target")
	}
}

type conflictEvents struct{ names []string }

func (e *conflictEvents) Emit(name string, _ ...any) { e.names = append(e.names, name) }
func TestFailedMergeEmitsStatusAndCustomMarkersAreProtected(t *testing.T) {
	path, service, run := makeTextConflict(t, "merge")
	w, _ := service.Workspace()
	if err := service.ControlConflict(path, w.Token, "abort"); err != nil {
		t.Fatal(err)
	}
	writeProfile(t, filepath.Join(path, ".gitattributes"), "file.txt conflict-marker-size=5\n")
	run("add", ".gitattributes")
	run("commit", "-m", "custom markers")
	emitter := &conflictEvents{}
	service.state.emitter = emitter
	refs := &RefService{state: service.state}
	if err := refs.MergeBranch("topic"); err == nil {
		t.Fatal("expected merge conflict")
	}
	if len(emitter.names) != 2 || emitter.names[0] != EventStatusChanged {
		t.Fatal("failed operation did not refresh state")
	}
	doc, err := service.LoadConflict(path, "file.txt")
	if err != nil {
		t.Fatal(err)
	}
	if doc.MarkerSize != 5 {
		t.Fatal(doc.MarkerSize)
	}
	if err := service.ResolveConflict(path, "file.txt", doc.Token, "edit", doc.Result); err == nil {
		t.Fatal("staged custom conflict markers")
	}
}
func TestRevertConflictsCanContinue(t *testing.T) {
	path, run := conflictTestRepo(t)
	file := filepath.Join(path, "file.txt")
	writeProfile(t, file, "base\n")
	run("add", ".")
	run("commit", "-m", "base")
	writeProfile(t, file, "change\n")
	run("commit", "-am", "change")
	target := run("rev-parse", "HEAD")
	writeProfile(t, file, "later\n")
	run("commit", "-am", "later")
	if err := exec.Command("git", "-C", path, "revert", target).Run(); err == nil {
		t.Fatal("expected revert conflict")
	}
	service := conflictService(t, path)
	w, err := service.Workspace()
	if err != nil || w.Kind != "revert" {
		t.Fatalf("revert state %+v %v", w, err)
	}
	doc, err := service.LoadConflict(path, "file.txt")
	if err != nil {
		t.Fatal(err)
	}
	if err := service.ResolveConflict(path, "file.txt", doc.Token, "incoming", ""); err != nil {
		t.Fatal(err)
	}
	if err := service.ControlConflict(path, w.Token, "continue"); err != nil {
		t.Fatal(err)
	}
}

func TestRebaseContinueRefreshesTheNextConflict(t *testing.T) {
	path, run := conflictTestRepo(t)
	writeProfile(t, filepath.Join(path, "one"), "base\n")
	writeProfile(t, filepath.Join(path, "two"), "base\n")
	run("add", ".")
	run("commit", "-m", "base")
	run("checkout", "-b", "topic")
	writeProfile(t, filepath.Join(path, "one"), "topic one\n")
	run("commit", "-am", "topic one")
	writeProfile(t, filepath.Join(path, "two"), "topic two\n")
	run("commit", "-am", "topic two")
	run("checkout", "main")
	writeProfile(t, filepath.Join(path, "one"), "main one\n")
	writeProfile(t, filepath.Join(path, "two"), "main two\n")
	run("commit", "-am", "main changes")
	run("checkout", "topic")
	if err := exec.Command("git", "-C", path, "rebase", "main").Run(); err == nil {
		t.Fatal("expected conflict")
	}
	service := conflictService(t, path)
	first, err := service.Workspace()
	if err != nil {
		t.Fatal(err)
	}
	doc, err := service.LoadConflict(path, "one")
	if err != nil {
		t.Fatal(err)
	}
	if err := service.ResolveConflict(path, "one", doc.Token, "incoming", ""); err != nil {
		t.Fatal(err)
	}
	emitter := &conflictEvents{}
	service.state.emitter = emitter
	if err := service.ControlConflict(path, first.Token, "continue"); err == nil {
		t.Fatal("expected second conflict")
	}
	second, err := service.Workspace()
	if err != nil {
		t.Fatal(err)
	}
	if second.Step != 2 || second.Total != 2 || len(second.Files) != 1 || second.Files[0].Path != "two" || first.Token == second.Token {
		t.Fatalf("wrong next state: %+v", second)
	}
	if len(emitter.names) != 2 {
		t.Fatal("next conflict did not emit refresh")
	}
	doc, err = service.LoadConflict(path, "two")
	if err != nil {
		t.Fatal(err)
	}
	if err := service.ResolveConflict(path, "two", doc.Token, "incoming", ""); err != nil {
		t.Fatal(err)
	}
	if err := service.ControlConflict(path, second.Token, "continue"); err != nil {
		t.Fatal(err)
	}
}
