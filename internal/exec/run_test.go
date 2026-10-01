package exec

import (
	"context"
	"errors"
	"os/exec"
	"strings"
	"testing"
)

func TestCaptureBoundedAndProcessErrorsRetained(t *testing.T) {
	command := "awk 'BEGIN {for(i=0;i<1100000;i++) printf \"x\";}' ; echo diagnostic >&2; exit 7"
	out, errOut, err := RunShell(context.Background(), t.TempDir(), command)
	var exit *exec.ExitError
	if !errors.As(err, &exit) || exit.ExitCode() != 7 {
		t.Fatalf("process error=%v", err)
	}
	if len(out) != MaxCapturedOutputBytes+len(truncationNotice) || !strings.HasSuffix(out, truncationNotice) || !strings.Contains(errOut, "diagnostic") {
		t.Fatalf("capture sizes %d, %q", len(out), errOut)
	}
}

func TestMissingShellReported(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	_, _, err := RunShell(context.Background(), t.TempDir(), "true")
	if !errors.Is(err, exec.ErrNotFound) || !strings.Contains(err.Error(), "POSIX sh") {
		t.Fatalf("error=%v", err)
	}
}

func TestCancellationAndExactLimit(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, err := RunShell(ctx, t.TempDir(), "exec sleep 60"); err == nil {
		t.Fatal("cancelled command succeeded")
	}
	var output boundedOutput
	data := []byte(strings.Repeat("x", MaxCapturedOutputBytes))
	if n, err := output.Write(data); n != len(data) || err != nil {
		t.Fatalf("write=%d %v", n, err)
	}
	if output.truncated {
		t.Fatal("exact limit reported truncation")
	}
	if n, err := output.Write([]byte("extra")); n != 5 || err != nil || !output.truncated {
		t.Fatal("overflow not consumed and reported")
	}
}
