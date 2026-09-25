package services

import (
	"crypto/sha256"
	"fmt"
	"testing"
)

func TestAvatarEmailHash(t *testing.T) {
	want := fmt.Sprintf("%x", sha256.Sum256([]byte("author@example.com")))
	if got := avatarEmailHash("  Author@Example.COM  "); got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
	if avatarEmailHash("  ") != "" {
		t.Fatal("empty email should not request an avatar")
	}
}
