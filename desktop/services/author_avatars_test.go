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

func TestAuthorAvatarURLRecognizesGitHubPrivateAddresses(t *testing.T) {
	for _, tc := range []struct{ email, want string }{
		{"1943904+leaanthony@users.noreply.github.com", "https://avatars.githubusercontent.com/u/1943904?s=64"},
		{" leaanthony@users.noreply.github.com ", "https://avatars.githubusercontent.com/leaanthony?s=64"},
		{"123+dependabot[bot]@users.noreply.github.com", "https://avatars.githubusercontent.com/u/123?s=64"},
		{"", ""},
	} {
		if got := authorAvatarURL(tc.email); got != tc.want {
			t.Errorf("%q: got %s want %s", tc.email, got, tc.want)
		}
	}
	for _, email := range []string{"author@example.com", "leaanthony@users.noreply.github.com.evil.test", "../../bad@users.noreply.github.com"} {
		want := "https://www.gravatar.com/avatar/" + avatarEmailHash(email) + "?s=64&d=404&r=g"
		if got := authorAvatarURL(email); got != want {
			t.Errorf("unexpected provider for %q: %s", email, got)
		}
	}
}
