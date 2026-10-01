//go:build !windows

package services

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestReviewCancellationStopsLauncherChildren(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "orphan-wrote-this")
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, "sh", "-c", `(sleep 0.4; printf orphan > "$1") & wait`, "review-fixture", marker)
	configureReviewProcess(cmd)
	if err := cmd.Run(); err == nil {
		t.Fatal("expected cancelled launcher")
	}
	time.Sleep(500 * time.Millisecond)
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatal("child survived cancellation", err)
	}
}
