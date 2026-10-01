package views

import (
	"fmt"
	"github.com/atterpac/dado/theme"
	"strings"
	"time"

	"github.com/atterpac/ichi/internal/git"
)

type commitParent struct{ hash, subject string }
type commitPresentation struct {
	body      string
	parents   []commitParent
	signature string // loading, unavailable, unsigned, verified, invalid
}

// Shared facts, independent of widget layout, terminal colors and compactness.
func presentCommit(detail *git.CommitDetail, metadata *git.CommitMetadata, metadataErr error) commitPresentation {
	p := commitPresentation{signature: "loading"}
	p.body = strings.TrimSpace(detail.Body)
	if p.body == detail.Subject {
		p.body = ""
	} else if strings.HasPrefix(p.body, detail.Subject+"\n") {
		p.body = strings.TrimSpace(strings.TrimPrefix(p.body, detail.Subject))
	}
	for i, hash := range detail.Parents {
		subject := ""
		if i < len(detail.ParentSubjects) {
			subject = detail.ParentSubjects[i]
		}
		p.parents = append(p.parents, commitParent{shortCommitHash(hash), subject})
	}
	switch {
	case metadata == nil && metadataErr != nil:
		p.signature = "unavailable"
	case metadata == nil:
	case !metadata.GPGStatus.Signed:
		p.signature = "unsigned"
	case metadata.GPGStatus.Valid:
		p.signature = "verified"
	default:
		p.signature = "invalid"
	}
	return p
}

func shortCommitHash(hash string) string {
	if len(hash) > 7 {
		return hash[:7]
	}
	return hash
}

func isTagRef(ref string) bool { return strings.HasPrefix(ref, "tag:") }

func commitFileStatusTag(status git.FileStatus) string {
	switch status {
	case git.FileAdded:
		return theme.TagSuccess()
	case git.FileDeleted:
		return theme.TagError()
	case git.FileModified:
		return theme.TagWarning()
	case git.FileRenamed, git.FileCopied:
		return theme.TagInfo()
	default:
		return theme.TagFg()
	}
}

func truncateCommitText(text string, limit int) string {
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	if limit <= 0 {
		return ""
	}
	if limit <= 3 {
		return strings.Repeat(".", limit)
	}
	return string(runes[:limit-3]) + "..."
}

type relativeAge struct {
	count         int
	unit, compact string
}

func ageAt(now, date time.Time) relativeAge {
	diff := now.Sub(date)
	if diff < time.Minute {
		return relativeAge{}
	}
	for _, interval := range []struct {
		max, size     time.Duration
		unit, compact string
	}{
		{time.Hour, time.Minute, "minute", "m"},
		{24 * time.Hour, time.Hour, "hour", "h"},
		{7 * 24 * time.Hour, 24 * time.Hour, "day", "d"},
		{30 * 24 * time.Hour, 7 * 24 * time.Hour, "week", "w"},
		{365 * 24 * time.Hour, 30 * 24 * time.Hour, "month", "mo"},
	} {
		if diff < interval.max {
			return relativeAge{int(diff / interval.size), interval.unit, interval.compact}
		}
	}
	return relativeAge{int(diff / (365 * 24 * time.Hour)), "year", "y"}
}

func (age relativeAge) format(compact bool) string {
	if age.unit == "" {
		if compact {
			return "now"
		}
		return "just now"
	}
	if compact {
		return fmt.Sprintf("%d%s", age.count, age.compact)
	}
	unit := age.unit
	if age.count != 1 {
		unit += "s"
	}
	return fmt.Sprintf("%d %s ago", age.count, unit)
}

func relativeTime(date time.Time) string        { return ageAt(time.Now(), date).format(false) }
func relativeTimeCompact(date time.Time) string { return ageAt(time.Now(), date).format(true) }
