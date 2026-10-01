package views

import (
	"context"
	"fmt"

	"github.com/atterpac/dado/async"
	"github.com/atterpac/dado/layout"
	"github.com/atterpac/ichi/internal/app"
	"github.com/atterpac/ichi/internal/git"
)

type commitActionKind string

const (
	checkoutCommit   commitActionKind = "checkout"
	cherryPickCommit commitActionKind = "cherry-pick"
	revertCommit     commitActionKind = "revert"
	dropCommit       commitActionKind = "drop"
	rewordCommit     commitActionKind = "reword"
)

type commitAction struct {
	kind                     commitActionKind
	hash, shortHash, subject string
	message                  string
}

func (a commitAction) messages() (title, question, busy, success, failure string) {
	switch a.kind {
	case checkoutCommit:
		return "Checkout", "Checkout", "Checking out", "Checked out", "Checkout Failed"
	case cherryPickCommit:
		return "Cherry Pick", "Cherry-pick", "Cherry-picking", "Cherry-picked", "Cherry-pick Failed"
	case revertCommit:
		return "Revert Commit", "Revert", "Reverting", "Reverted", "Revert Failed"
	case dropCommit:
		return "Drop Commit", "Drop", "Dropping", "Dropped", "Drop Failed"
	case rewordCommit:
		return "Edit Commit Message", "Reword", "Rewording", "Reworded", "Edit Failed"
	default:
		return "Commit", "Update", "Updating", "Updated", "Update Failed"
	}
}

func (a commitAction) apply(repo *git.Repository) error {
	switch a.kind {
	case checkoutCommit:
		return repo.Checkout(a.hash)
	case cherryPickCommit:
		return repo.CherryPick(a.hash)
	case revertCommit:
		return repo.Revert(a.hash)
	case dropCommit:
		return repo.DropCommit(a.hash)
	case rewordCommit:
		return repo.RenameCommit(a.hash, a.message)
	default:
		return fmt.Errorf("unknown commit action %q", a.kind)
	}
}

// Owns one view's mutation lifetime; commit-detail reads have separate owners.
type commitActionOwner struct {
	loader     *async.Loader[struct{}]
	generation uint64
}

func (o *commitActionOwner) stop() {
	o.generation++
	if o.loader != nil {
		o.loader.Cancel()
		o.loader = nil
	}
}

func (o *commitActionOwner) run(repo *git.Repository, action commitAction, refresh func(), complete func(error)) *async.Loader[struct{}] {
	o.stop()
	version := o.generation
	operationRepo := *repo
	_, _, busy, _, _ := action.messages()
	finish := func(err error) {
		if version != o.generation {
			return // The view left; a stopped view cannot reopen dialogs or reload itself.
		}
		o.loader = nil
		// Git can leave a conflict or partial state on failure. Both outcomes need
		// a fresh read using the view's independent read lifetime.
		refresh()
		complete(err)
	}
	o.loader = app.RunAsyncSimple(fmt.Sprintf("%s %s...", busy, action.shortHash),
		func(ctx context.Context) error { return action.apply(operationRepo.WithContext(ctx)) },
		func() { finish(nil) }, finish)
	return o.loader
}

func (o *commitActionOwner) confirm(ui *layout.App, repo *git.Repository, action commitAction, refresh func()) {
	title, question, _, _, _ := action.messages()
	message := fmt.Sprintf("%s commit %s?\n\n%s", question, action.shortHash, action.subject)
	if action.kind == dropCommit {
		message += "\n\nThis will remove the commit from history."
	}
	ShowConfirmModal(ui, title, message, func() {
		o.execute(ui, repo, action, refresh)
	})
}

func (o *commitActionOwner) execute(ui *layout.App, repo *git.Repository, action commitAction, refresh func()) {
	_, _, _, success, failure := action.messages()
	o.run(repo, action, refresh, func(err error) {
		if err != nil {
			ShowErrorModal(ui, failure, err.Error())
		} else {
			app.ToastSuccess(fmt.Sprintf("%s %s", success, action.shortHash))
		}
	})
}
