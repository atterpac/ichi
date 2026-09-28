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
	if run("config", "user.email") != "work@example.test" {
		t.Fatal("terminal Git did not receive workspace identity")
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
	if run("config", "user.email") != "local@example.test" {
		t.Fatal("terminal defaults not restored")
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

func TestSaveGitProfileAndNativeUpdates(t *testing.T) {
	root := profileTestEnv(t)
	service := &RepoService{state: NewState(nil, nil)}
	input := GitProfile{Label: "Work", Name: "Work User", Email: "work@example.test", SigningFormat: "ssh", SigningEnabled: "false", TagSigningEnabled: "false"}
	saved, err := service.SaveGitProfile(input)
	if err != nil {
		t.Fatal(err)
	}
	catalog := service.ListGitProfiles(nil)
	if len(catalog.Profiles) != 1 || catalog.Profiles[0].Label != "Work" {
		t.Fatalf("managed discovery: %+v", catalog)
	}
	repo := filepath.Join(root, "repo")
	os.Mkdir(repo, 0755)
	if out, err := exec.Command("git", "-C", repo, "init").CombinedOutput(); err != nil {
		t.Fatalf("%s %v", out, err)
	}
	config := filepath.Join(repo, ".git", "config")
	original, _ := os.ReadFile(config)
	if err := service.SyncWorkspaceProfiles(map[string]string{repo: saved.ID}); err != nil {
		t.Fatal(err)
	}
	saved.Email = "edited@example.test"
	if _, err := service.SaveGitProfile(*saved); err != nil {
		t.Fatal(err)
	}
	out, err := exec.Command("git", "-C", repo, "var", "GIT_AUTHOR_IDENT").Output()
	if err != nil || !strings.Contains(string(out), "edited@example.test") {
		t.Fatalf("terminal author: %s %v", out, err)
	}
	// Existing unrelated Git settings survive profile edits.
	exec.Command("git", "config", "--file", saved.ID, "core.editor", "my editor").Run()
	saved.Label = "Renamed"
	if _, err := service.SaveGitProfile(*saved); err != nil {
		t.Fatal(err)
	}
	out, _ = exec.Command("git", "config", "--file", saved.ID, "core.editor").Output()
	if strings.TrimSpace(string(out)) != "my editor" {
		t.Fatal("lost unrelated config")
	}
	if err := service.SyncWorkspaceProfiles(nil); err != nil {
		t.Fatal(err)
	}
	restored, _ := os.ReadFile(config)
	if string(restored) != string(original) {
		t.Fatalf("config was not restored exactly:\n%s", restored)
	}
}

func TestMissingRepositoryDoesNotBlockProfileUpdates(t *testing.T) {
	root := profileTestEnv(t)
	service := &RepoService{state: NewState(nil, nil)}
	profile, err := service.SaveGitProfile(GitProfile{Label: "Work", Name: "Work", Email: "work@example.test", SigningFormat: "openpgp", SigningEnabled: "false", TagSigningEnabled: "false"})
	if err != nil {
		t.Fatal(err)
	}
	repo := filepath.Join(root, "available")
	missing := filepath.Join(root, "moved")
	if out, err := exec.Command("git", "init", repo).CombinedOutput(); err != nil {
		t.Fatalf("init: %s %v", out, err)
	}
	assignments := map[string]string{repo: profile.ID, missing: profile.ID}
	for i := 0; i < 2; i++ {
		if err := service.SyncWorkspaceProfiles(assignments); err != nil {
			t.Fatal(err)
		}
	}
	stored, err := loadProfileAssignments()
	if err != nil || stored[missing] != profile.ID {
		t.Fatalf("missing repository assignment lost: %v %v", stored, err)
	}
	profile.Email = "edited@example.test"
	if _, err := service.SaveGitProfile(*profile); err != nil {
		t.Fatal(err)
	}
	out, err := exec.Command("git", "-C", repo, "config", "user.email").Output()
	if err != nil || strings.TrimSpace(string(out)) != profile.Email {
		t.Fatalf("available repository not updated: %s %v", out, err)
	}
	if out, err := exec.Command("git", "init", missing).CombinedOutput(); err != nil {
		t.Fatalf("init restored repository: %s %v", out, err)
	}
	if err := service.SyncWorkspaceProfiles(assignments); err != nil {
		t.Fatal(err)
	}
	out, err = exec.Command("git", "-C", missing, "config", "user.email").Output()
	if err != nil || strings.TrimSpace(string(out)) != profile.Email {
		t.Fatalf("restored repository not updated: %s %v", out, err)
	}
	if err := os.RemoveAll(missing); err != nil {
		t.Fatal(err)
	}
	if err := service.SyncWorkspaceProfiles(nil); err != nil {
		t.Fatal(err)
	}
}

func TestRepositoryConfigErrorIncludesGitDetails(t *testing.T) {
	root := profileTestEnv(t)
	_, err := repositoryConfigPath(root)
	if err == nil || !strings.Contains(err.Error(), "not a git repository") {
		t.Fatalf("missing Git diagnostic: %v", err)
	}
}

func TestNativeProfileFailureIsAtomic(t *testing.T) {
	root := profileTestEnv(t)
	profile := filepath.Join(root, "work.gitconfig")
	writeProfile(t, profile, "[user]\n name = Work\n email = work@example.test\n")
	service := &RepoService{state: NewState(nil, nil)}
	assignments := map[string]string{}
	for _, name := range []string{"a", "z"} {
		repo := filepath.Join(root, name)
		os.Mkdir(repo, 0755)
		exec.Command("git", "-C", repo, "init").Run()
		assignments[repo] = profile
	}
	aConfig := filepath.Join(root, "a", ".git", "config")
	original, _ := os.ReadFile(aConfig)
	lock := filepath.Join(root, "z", ".git", "config.lock")
	writeProfile(t, lock, "external lock")
	if err := service.SyncWorkspaceProfiles(assignments); err == nil {
		t.Fatal("accepted locked config")
	}
	unchanged, _ := os.ReadFile(aConfig)
	if string(unchanged) != string(original) {
		t.Fatal("partially changed workspace")
	}
	if _, err := os.Stat(aConfig + ".lock"); !os.IsNotExist(err) {
		t.Fatal("leaked config lock")
	}
	if data, _ := os.ReadFile(lock); string(data) != "external lock" {
		t.Fatal("removed external lock")
	}
	os.Remove(lock)
	if err := service.SyncWorkspaceProfiles(assignments); err != nil {
		t.Fatal(err)
	}
	originalProfile, _ := os.ReadFile(profile)
	writeProfile(t, lock, "external lock")
	_, err := service.SaveGitProfile(GitProfile{ID: profile, Label: "Edited", Name: "Edited", Email: "edited@example.test", SigningFormat: "openpgp", SigningEnabled: "false", TagSigningEnabled: "false"})
	if err == nil {
		t.Fatal("saved despite failed repository update")
	}
	actual, _ := os.ReadFile(profile)
	if string(actual) != string(originalProfile) {
		t.Fatal("failed edit changed profile")
	}
}

func TestLinkedWorktreeProfileConflict(t *testing.T) {
	root := profileTestEnv(t)
	profile := filepath.Join(root, "work.gitconfig")
	writeProfile(t, profile, "[user]\n name = Work\n email = work@example.test\n")
	other := filepath.Join(root, "other.gitconfig")
	writeProfile(t, other, "[user]\n name = Other\n email = other@example.test\n")
	repo := filepath.Join(root, "repo")
	os.Mkdir(repo, 0755)
	run := func(args ...string) {
		t.Helper()
		if out, err := exec.Command("git", append([]string{"-C", repo}, args...)...).CombinedOutput(); err != nil {
			t.Fatalf("git %v: %s %v", args, out, err)
		}
	}
	run("init")
	run("-c", "user.name=Initial", "-c", "user.email=initial@example.test", "commit", "--allow-empty", "-m", "initial")
	linked := filepath.Join(root, "linked")
	run("worktree", "add", "-b", "linked", linked)
	service := &RepoService{state: NewState(nil, nil)}
	if err := service.SyncWorkspaceProfiles(map[string]string{repo: profile, linked: other}); err == nil || !strings.Contains(err.Error(), "linked worktrees") {
		t.Fatalf("wanted shared config conflict, got %v", err)
	}
	run("config", "extensions.worktreeConfig", "true")
	if err := service.SyncWorkspaceProfiles(map[string]string{repo: profile, linked: other}); err != nil {
		t.Fatal(err)
	}
	for path, want := range map[string]string{repo: "work@example.test", linked: "other@example.test"} {
		out, err := exec.Command("git", "-C", path, "config", "user.email").Output()
		if err != nil || strings.TrimSpace(string(out)) != want {
			t.Fatalf("%s: %s %v", path, out, err)
		}
	}
}

func TestConfigLockCleanupDoesNotRemoveAnotherWritersLock(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config")
	writeProfile(t, path, "[user]\n name = Original\n")
	c, err := lockConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	c.next = []byte("[user]\n name = Updated\n")
	if err := c.write(); err != nil {
		t.Fatal(err)
	}
	writeProfile(t, path+".lock", "another writer")
	c.release()
	if data, _ := os.ReadFile(path + ".lock"); string(data) != "another writer" {
		t.Fatal("cleanup removed another writer's lock")
	}
}

func TestProfileValidationAndQuoting(t *testing.T) {
	profileTestEnv(t)
	service := &RepoService{state: NewState(nil, nil)}
	valid := GitProfile{Label: "Personal", Name: "User \"Quoted\" # Name", Email: "user@example.test", SigningFormat: "openpgp", SigningEnabled: "false", TagSigningEnabled: "false"}
	saved, err := service.SaveGitProfile(valid)
	if err != nil {
		t.Fatal(err)
	}
	values, err := profileValues(saved.ID)
	if err != nil || values["user.name"] != valid.Name {
		t.Fatalf("quoting: %v %v", values, err)
	}
	original, _ := os.ReadFile(saved.ID)
	for _, edit := range []func(*GitProfile){func(p *GitProfile) { p.Name = "" }, func(p *GitProfile) { p.Email = "bad\nvalue" }, func(p *GitProfile) { p.SigningEnabled = "true" }, func(p *GitProfile) { p.SigningFormat = "invalid" }} {
		invalid := *saved
		edit(&invalid)
		if _, err := service.SaveGitProfile(invalid); err == nil {
			t.Fatal("accepted invalid profile")
		}
		actual, _ := os.ReadFile(saved.ID)
		if string(actual) != string(original) {
			t.Fatal("validation failure changed file")
		}
	}
}
