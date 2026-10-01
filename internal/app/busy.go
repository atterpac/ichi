package app

import (
	"context"

	"github.com/atterpac/dado/anim"
	"github.com/atterpac/dado/async"
	"github.com/atterpac/dado/layout"
	"github.com/atterpac/ichi/internal/git"
)

var circleFrames = []string{"◐", "◓", "◑", "◒"}

func BusyIndicator(sb *layout.StatusBar, msg string) async.LoadingIndicator {
	var cancel func()
	frame := 0
	showing := false

	return async.Callback(
		func() { // Show
			showing = true
			sb.ClearSections().AddSection(layout.StatusSection{Icon: circleFrames[frame], Text: msg})
			cancel = anim.Subscribe(0, func() {
				if !showing {
					return
				}
				frame = (frame + 1) % len(circleFrames)
				sb.ClearSections()
				sb.AddSection(layout.StatusSection{Icon: circleFrames[frame], Text: msg})
			})
		},
		func() { // Hide
			showing = false
			if cancel != nil {
				cancel()
				cancel = nil
			}
			sb.ClearSections()
		},
	)
}

// RunBusy supplies work with a context-bound repository clone. The returned
// loader owns cancellation; outcome refresh always reads the current repository.
func RunBusy(sb *layout.StatusBar, repo *git.Repository, busyMsg, okMsg string, work func(*git.Repository) error) *async.Loader[struct{}] {
	operationRepo := *repo
	return async.NewLoader[struct{}]().
		WithIndicator(BusyIndicator(sb, busyMsg)).
		OnSuccess(func(struct{}) {
			if err := UpdateStatusBar(sb, repo); err != nil {
				ToastError(err.Error())
			}
			ToastSuccess(okMsg)
		}).
		OnError(func(err error) {
			UpdateStatusBar(sb, repo)
			ToastError(err.Error())
		}).
		Run(func(ctx context.Context) (struct{}, error) { return struct{}{}, work(operationRepo.WithContext(ctx)) })
}
