package services

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/atterpac/ichi/internal/git"
)

func profileTestEnv(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	t.Setenv("HOME", root)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(root, "config"))
	t.Setenv("GIT_CONFIG_GLOBAL", filepath.Join(root, ".gitconfig"))
	t.Setenv("GIT_CONFIG_NOSYSTEM", "1")
	t.Setenv("GIT_AUTHOR_NAME", "")
	t.Setenv("GIT_AUTHOR_EMAIL", "")
	t.Setenv("GIT_COMMITTER_NAME", "")
	t.Setenv("GIT_COMMITTER_EMAIL", "")
	// Empty identity env vars override Git too; remove them while preserving cleanup.
	for _, key := range []string{"GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"} {
		os.Unsetenv(key)
	}
	return root
}
func writeProfile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
}
func TestDiscoverGitProfiles(t *testing.T) {
	root := profileTestEnv(t)
	writeProfile(t, filepath.Join(root, ".gitconfig"), "[user]\n name = Personal\n email = personal@example.test\n[includeIf \"gitdir:~/work/\"]\n path = work.gitconfig\n[include]\n path = more.gitconfig\n")
	writeProfile(t, filepath.Join(root, "work.gitconfig"), "[user]\n email = work@example.test\n signingkey = signing-key-id\n[commit]\n gpgsign = true\n[gpg]\n format = ssh\n[include]\n path = .gitconfig\n")
	writeProfile(t, filepath.Join(root, "more.gitconfig"), "[includeIf \"onbranch:never\"]\n path = extra.gitconfig\n")
	writeProfile(t, filepath.Join(root, "extra.gitconfig"), "[user]\n name = Extra\n email = extra@example.test\n")
	service := &RepoService{state: NewState(nil, nil)}
	catalog := service.ListGitProfiles(nil)
	if len(catalog.Profiles) != 3 {
		t.Fatalf("profiles: %+v, warnings: %v", catalog.Profiles, catalog.Warnings)
	}
	var work GitProfile
	for _, p := range catalog.Profiles {
		if p.Label == "work.gitconfig" {
			work = p
		}
	}
	if work.Name != "Personal" || work.Email != "work@example.test" || work.SigningEnabled != "true" || work.SigningFormat != "ssh" {
		t.Fatalf("wrong work identity: %+v", work)
	}
}
func TestWorkspaceProfileCommitIsolationAndPersistence(t *testing.T) {
	root := profileTestEnv(t)
	global := filepath.Join(root, ".gitconfig")
	original := "[user]\n name = Default User\n email = default@example.test\n"
	writeProfile(t, global, original)
	work := filepath.Join(root, "work.gitconfig")
	writeProfile(t, work, "[user]\n name = Work User\n email = work@example.test\n[commit]\n gpgsign = false\n")
	repoPath := filepath.Join(root, "project")
	if err := os.Mkdir(repoPath, 0755); err != nil {
		t.Fatal(err)
	}
	run := func(args ...string) string {
		t.Helper()
		out, err := exec.Command("git", append([]string{"-C", repoPath}, args...)...).CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %v %s", args, err, out)
		}
		return strings.TrimSpace(string(out))
	}
	run("init")
	run("config", "user.name", "Local User")
	run("config", "user.email", "local@example.test")
	repo, err := git.OpenRepository(repoPath)
	if err != nil {
		t.Fatal(err)
	}
	state := NewState(repo, nil)
	service := &RepoService{state: state}
	nested := filepath.Join(repoPath, "nested")
	if err := os.Mkdir(nested, 0755); err != nil {
		t.Fatal(err)
	}
	if err := service.SyncWorkspaceProfiles(map[string]string{nested: work}); err != nil {
		t.Fatal(err)
	}
	configured, err := state.Repo()
	if err != nil {
		t.Fatal(err)
	}
	writeProfile(t, filepath.Join(repoPath, "file"), "one")
	if err := configured.StageAll(); err != nil {
		t.Fatal(err)
	}
	if err := configured.Commit("work commit"); err != nil {
		t.Fatal(err)
	}
	if author := run("log", "-1", "--format=%an <%ae> / %cn <%ce>"); author != "Work User <work@example.test> / Work User <work@example.test>" {
		t.Fatal(author)
	}
	if run("config", "user.email") != "local@example.test" {
		t.Fatal("rewrote repository config")
	}
	if data, _ := os.ReadFile(global); string(data) != original {
		t.Fatal("rewrote global config")
	}
	restored, err := NewState(repo, nil).Repo()
	if err != nil {
		t.Fatal(err)
	}
	if email, _ := restored.ConfigValue("user.email"); email != "work@example.test" {
		t.Fatal("assignment not restored")
	}
	if err := service.SyncWorkspaceProfiles(map[string]string{}); err != nil {
		t.Fatal(err)
	}
	defaults, _ := state.Repo()
	if email, _ := defaults.ConfigValue("user.email"); email != "local@example.test" {
		t.Fatal("defaults not restored")
	}
	// Previously started operations retain the profile context after reassignment.
	if email, _ := configured.ConfigValue("user.email"); email != "work@example.test" {
		t.Fatal("mutated an in-flight context")
	}
	if err := service.SyncWorkspaceProfiles(map[string]string{repoPath: filepath.Join(root, "missing")}); err == nil {
		t.Fatal("accepted missing profile")
	}
	if value, _ := defaults.ConfigValue("user.email"); value != "local@example.test" {
		t.Fatal("failed assignment changed identity")
	}
}
