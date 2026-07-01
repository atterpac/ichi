package main

import (
	"github.com/atterpac/ichi/desktop/services"
	"github.com/atterpac/ichi/internal/git"
)

type Services = services.Registry

func NewServices(repo *git.Repository, emitter services.EventEmitter) *Services {
	return services.NewRegistry(repo, emitter)
}
