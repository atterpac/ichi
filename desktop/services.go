package main

import (
	"github.com/atterpac/ichi/desktop/services"
	"github.com/atterpac/ichi/internal/git"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// wailsEventEmitter adapts Wails' cancellation-returning API to the services'
// notification contract. A cancelled notification does not undo a Git action.
type wailsEventEmitter struct {
	events *application.EventManager
}

var _ services.EventEmitter = wailsEventEmitter{}

func (e wailsEventEmitter) Emit(name string, data ...any) {
	e.events.Emit(name, data...)
}

type Services = services.Registry

func NewServices(repo *git.Repository, emitter services.EventEmitter) *Services {
	return services.NewRegistry(repo, emitter)
}
