package services

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestProfileCacheSeesExternalEditsAndIsBounded(t *testing.T) {
	profileTestEnv(t)
	path := filepath.Join(t.TempDir(), "identity")
	write := func(name string) {
		t.Helper()
		if err := os.WriteFile(path, []byte("[user]\n name = "+name+"\n email = test@example.com\n"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write("First")
	var cache profileReadCache
	a, err := cache.read(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	b, err := cache.read(context.Background(), path)
	if err != nil || a["user.name"] != "First" || b["user.name"] != "First" {
		t.Fatalf("warm profile: %v %v", b, err)
	}
	write("Externally edited identity")
	updated, err := cache.read(context.Background(), path)
	if err != nil || updated["user.name"] != "Externally edited identity" {
		t.Fatalf("stale profile: %v %v", updated, err)
	}
	for n := range 12 {
		other := filepath.Join(t.TempDir(), "identity")
		if err := os.WriteFile(other, []byte("[user]\n name = Test\n email = test@example.com\n"), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := cache.read(context.Background(), other); err != nil {
			t.Fatalf("profile %d: %v", n, err)
		}
	}
	if len(cache.entries) > 8 {
		t.Fatal("profile cache grew without bound")
	}
}
