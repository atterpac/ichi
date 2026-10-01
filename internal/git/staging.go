package git

import (
	"fmt"
	"path/filepath"
	"strings"
)

// StageFiles updates all selected literal paths in a single index transaction.
// NUL-delimited stdin avoids argument limits and preserves unusual filenames.
func (r *Repository) StageFiles(paths []string) error { return r.changeIndex(paths, "add") }

// UnstageFiles resets selected index entries without touching working files.
// Omitting an explicit HEAD also supports repositories before their first commit.
func (r *Repository) UnstageFiles(paths []string) error { return r.changeIndex(paths, "reset") }

func (r *Repository) changeIndex(paths []string, operation string) error {
	if len(paths) == 0 {
		return nil
	}
	var input strings.Builder
	seen := make(map[string]bool, len(paths))
	for _, path := range paths {
		if strings.ContainsRune(path, 0) || !filepath.IsLocal(path) || filepath.Clean(path) == "." {
			return fmt.Errorf("index operation requires paths inside the worktree")
		}
		path = filepath.ToSlash(filepath.Clean(path))
		if path == ".git" || strings.HasPrefix(path, ".git/") {
			return fmt.Errorf("cannot stage Git metadata")
		}
		if !seen[path] {
			seen[path] = true
			input.WriteString(path)
			input.WriteByte(0)
		}
	}
	cmd := r.command("--literal-pathspecs", operation, "--pathspec-from-file=-", "--pathspec-file-nul")
	cmd.Stdin = strings.NewReader(input.String())
	if out, err := cmd.CombinedOutput(); err != nil {
		if ctxErr := r.operationContext().Err(); ctxErr != nil {
			return ctxErr
		}
		return fmt.Errorf("%s selected paths: %w: %s", operation, err, strings.TrimSpace(string(out)))
	}
	return nil
}
