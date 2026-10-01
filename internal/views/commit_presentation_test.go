package views

import (
	"errors"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/atterpac/ichi/internal/git"
)

func TestSharedCommitPresentationFacts(t *testing.T) {
	detail := &git.CommitDetail{Subject: "Fix", Body: "Fix\n\nExplanation", Parents: []string{"123456789", "short"}, ParentSubjects: []string{"Parent"}}
	p := presentCommit(detail, nil, nil)
	if p.body != "Explanation" || p.signature != "loading" || len(p.parents) != 2 || p.parents[0].hash != "1234567" || p.parents[1].subject != "" {
		t.Fatalf("presentation: %+v", p)
	}
	detail.Body = "Fixing another problem"
	if got := presentCommit(detail, nil, errors.New("unavailable")); got.body != detail.Body || got.signature != "unavailable" {
		t.Fatalf("prefix body or metadata failure lost: %+v", got)
	}
	for _, tc := range []struct {
		signature git.GPGSignature
		want      string
	}{
		{git.GPGSignature{}, "unsigned"}, {git.GPGSignature{Signed: true, Valid: true}, "verified"}, {git.GPGSignature{Signed: true}, "invalid"},
	} {
		if got := presentCommit(detail, &git.CommitMetadata{GPGStatus: tc.signature}, nil).signature; got != tc.want {
			t.Fatalf("signature=%s want=%s", got, tc.want)
		}
	}
	if isTagRef("v2-feature") || !isTagRef("tag: v2") {
		t.Fatal("version-like branch misclassified as tag")
	}
	if got := truncateCommitText(strings.Repeat("界", 20), 10); !utf8.ValidString(got) || len([]rune(got)) != 10 {
		t.Fatalf("invalid truncation %q", got)
	}
}

func TestSharedAgeBoundaries(t *testing.T) {
	now := time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		age           time.Duration
		full, compact string
	}{
		{59 * time.Second, "just now", "now"}, {time.Minute, "1 minute ago", "1m"}, {2 * time.Minute, "2 minutes ago", "2m"}, {time.Hour, "1 hour ago", "1h"}, {24 * time.Hour, "1 day ago", "1d"}, {7 * 24 * time.Hour, "1 week ago", "1w"}, {30 * 24 * time.Hour, "1 month ago", "1mo"}, {365 * 24 * time.Hour, "1 year ago", "1y"},
	} {
		age := ageAt(now, now.Add(-tc.age))
		if age.format(false) != tc.full || age.format(true) != tc.compact {
			t.Fatalf("age %v: %+v", tc.age, age)
		}
	}
}
