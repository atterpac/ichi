package git

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// LoadCommit reads immutable content only. Verification and current refs are
// deliberately separate so they cannot delay displaying the selected commit.
func (r *Repository) LoadCommit(ctx context.Context, hash string) (*CommitDetail, error) {
	format := "%H%x00%h%x00%s%x00%B%x00%an%x00%ae%x00%at%x00%cn%x00%ce%x00%ct%x00%P%x00"
	out, err := r.runContext(ctx, "show", "-s", "--no-show-signature", "--no-color", "--format="+format, "--end-of-options", hash, "--")
	if err != nil {
		return nil, err
	}
	p := strings.Split(out, "\x00")
	if len(p) != 12 {
		return nil, fmt.Errorf("invalid commit metadata")
	}
	at, err := strconv.ParseInt(p[6], 10, 64)
	if err != nil {
		return nil, err
	}
	ct, err := strconv.ParseInt(p[9], 10, 64)
	if err != nil {
		return nil, err
	}
	detail := &CommitDetail{Hash: p[0], ShortHash: p[1], Subject: p[2], Body: p[3], Author: p[4], AuthorEmail: p[5], AuthorDate: time.Unix(at, 0), Committer: p[7], CommitterEmail: p[8], CommitterDate: time.Unix(ct, 0), Parents: strings.Fields(p[10])}
	// One diff walk produces both status records and counts; totals are derived.
	out, err = r.runContext(ctx, "show", "-m", "--first-parent", "--no-show-signature", "--format=", "--raw", "--numstat", "-z", "--no-color", "--no-ext-diff", "--no-textconv", "--find-renames", detail.Hash, "--")
	if err != nil {
		return nil, err
	}
	detail.Files, err = parseCommitFiles(out)
	if err != nil {
		return nil, err
	}
	detail.Stats.FilesChanged = len(detail.Files)
	for _, f := range detail.Files {
		detail.Stats.Insertions += f.Insertions
		detail.Stats.Deletions += f.Deletions
	}
	detail.ParentSubjects = make([]string, len(detail.Parents))
	if len(detail.Parents) > 0 {
		args := []string{"show", "-s", "--no-show-signature", "--no-color", "--format=%H%x00%s%x00"}
		args = append(args, detail.Parents...)
		args = append(args, "--")
		out, err = r.runContext(ctx, args...)
		if err != nil {
			return nil, err
		}
		subjects := make(map[string]string)
		fields := strings.Split(out, "\x00")
		for i := 0; i+1 < len(fields); i += 2 {
			subjects[strings.TrimSpace(fields[i])] = fields[i+1]
		}
		for i, parent := range detail.Parents {
			detail.ParentSubjects[i] = subjects[parent]
		}
	}
	return detail, nil
}

func parseCommitFiles(out string) ([]ChangedFile, error) {
	files := make([]ChangedFile, 0)
	for strings.HasPrefix(out, ":") {
		header, rest, ok := strings.Cut(out, "\x00")
		if !ok {
			return nil, fmt.Errorf("unterminated raw record")
		}
		fields := strings.Fields(header)
		if len(fields) != 5 || fields[4] == "" {
			return nil, fmt.Errorf("invalid raw record")
		}
		path, rest, ok := strings.Cut(rest, "\x00")
		if !ok || path == "" {
			return nil, fmt.Errorf("missing raw path")
		}
		f := ChangedFile{Path: path, Status: FileModified}
		switch fields[4][0] {
		case 'A':
			f.Status = FileAdded
		case 'D':
			f.Status = FileDeleted
		case 'R', 'C':
			f.Status = FileRenamed
			if fields[4][0] == 'C' {
				f.Status = FileCopied
			}
			f.OldPath = path
			f.Path, rest, ok = strings.Cut(rest, "\x00")
			if !ok || f.Path == "" {
				return nil, fmt.Errorf("missing raw destination")
			}
		}
		files = append(files, f)
		out = rest
	}
	counts, err := parseNumstatZ(out)
	if err != nil {
		return nil, err
	}
	if len(counts) != len(files) {
		return nil, fmt.Errorf("commit status/count mismatch")
	}
	for i, count := range counts {
		if count.Path != files[i].Path || count.OldPath != files[i].OldPath {
			return nil, fmt.Errorf("commit path/count mismatch")
		}
		files[i].Insertions = count.Added
		files[i].Deletions = count.Deleted
		files[i].Binary = count.Binary
	}
	return files, nil
}

// CommitMetadata is mutable: refs, branch containment and signature trust may
// change without changing the commit hash. Never store it in the content cache.
type CommitMetadata struct {
	Refs      []string
	Branches  []string
	GPGStatus GPGSignature
}

func (r *Repository) LoadCommitMetadata(ctx context.Context, hash string) (*CommitMetadata, error) {
	out, err := r.runContext(ctx, "show", "-s", "--no-show-signature", "--no-color", "--decorate=short", "--format=%H%x00%D%x00%G?%x00%GK%x00%GS%x00", "--end-of-options", hash, "--")
	if err != nil {
		return nil, err
	}
	parts := strings.Split(out, "\x00")
	if len(parts) != 6 {
		return nil, fmt.Errorf("invalid signature metadata")
	}
	// Parse GPG signature status
	gpgStatus := GPGSignature{}
	if len(parts) > 2 && parts[2] != "" {
		switch parts[2] {
		case "G":
			gpgStatus.Signed = true
			gpgStatus.Valid = true
			gpgStatus.TrustLevel = "good"
		case "B":
			gpgStatus.Signed = true
			gpgStatus.Valid = false
			gpgStatus.TrustLevel = "bad"
		case "U":
			gpgStatus.Signed = true
			gpgStatus.Valid = true
			gpgStatus.TrustLevel = "unknown"
		case "X":
			gpgStatus.Signed = true
			gpgStatus.Valid = true
			gpgStatus.TrustLevel = "expired"
		case "Y":
			gpgStatus.Signed = true
			gpgStatus.Valid = true
			gpgStatus.TrustLevel = "expired_key"
		case "R":
			gpgStatus.Signed = true
			gpgStatus.Valid = false
			gpgStatus.TrustLevel = "revoked"
		case "E":
			gpgStatus.Signed = true
			gpgStatus.Valid = false
			gpgStatus.TrustLevel = "missing_key"
		case "N":
			gpgStatus.Signed = false
		}
		if len(parts) > 3 {
			gpgStatus.KeyID = parts[3]
		}
		if len(parts) > 4 {
			gpgStatus.Signer = parts[4]
		}
	}
	metadata := &CommitMetadata{Refs: parseRefs(parts[1]), GPGStatus: gpgStatus, Branches: []string{}}
	out, err = r.runContext(ctx, "for-each-ref", "--contains="+parts[0], "--format=%(refname:short)%00%(symref)", "refs/heads/", "refs/remotes/")
	if err != nil {
		return nil, err
	}
	for _, line := range strings.Split(out, "\n") {
		name, target, ok := strings.Cut(line, "\x00")
		if ok && name != "" && target == "" {
			metadata.Branches = append(metadata.Branches, name)
		}
	}
	return metadata, nil
}
