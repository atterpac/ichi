package app

import (
	"context"
	"time"

	"github.com/atterpac/dado/async"
)

// Only the application manager is rendered. Outcome callbacks own feedback,
// so stale/canceled loading indicators cannot emit independent error toasts.
func loadingToast(message string) async.LoadingIndicator {
	manager := GetToastManager()
	if manager == nil {
		return async.Callback(nil, nil)
	}
	indicator := async.ToastWithManager(manager, message)
	return async.Callback(indicator.Show, indicator.Hide)
}

// RunAsync executes a function asynchronously with toast feedback. Work must
// propagate ctx to its subprocess/provider calls; the loader cannot stop work
// that ignores it. Terminal takeover commands are deliberately separate.
func RunAsync[T any](
	message string,
	fn func(ctx context.Context) (T, error),
	onSuccess func(T),
	onError func(error),
) *async.Loader[T] {
	return async.NewLoader[T]().
		WithTimeout(30 * time.Second).
		WithIndicator(loadingToast(message)).
		OnSuccess(onSuccess).
		OnError(onError).
		Run(fn)
}

// RunAsyncSimple executes a void function asynchronously with toast feedback.
func RunAsyncSimple(
	message string,
	fn func(ctx context.Context) error,
	onSuccess func(),
	onError func(error),
) *async.Loader[struct{}] {
	return async.NewLoader[struct{}]().
		WithTimeout(30 * time.Second).
		WithIndicator(loadingToast(message)).
		OnSuccess(func(_ struct{}) {
			if onSuccess != nil {
				onSuccess()
			}
		}).
		OnError(onError).
		Run(func(ctx context.Context) (struct{}, error) {
			return struct{}{}, fn(ctx)
		})
}

// RunAsyncLong executes a long-running function with extended timeout.
func RunAsyncLong[T any](
	message string,
	timeout time.Duration,
	fn func(ctx context.Context) (T, error),
	onSuccess func(T),
	onError func(error),
) *async.Loader[T] {
	return async.NewLoader[T]().
		WithTimeout(timeout).
		WithIndicator(loadingToast(message)).
		OnSuccess(onSuccess).
		OnError(onError).
		Run(fn)
}
