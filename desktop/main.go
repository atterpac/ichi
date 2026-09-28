package main

import (
	"context"
	"embed"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/atterpac/ichi/desktop/services"
	"github.com/atterpac/ichi/internal/git"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:dist
var assets embed.FS

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	app := buildApp()
	newMainWindow(app)
	// Quit needs the native event loop. A signal received during startup stays
	// pending in ctx until the application is ready to handle it.
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(_ *application.ApplicationEvent) {
		go func() {
			select {
			case <-ctx.Done():
				// Restore default handling so another Ctrl+C can force termination.
				stop()
				app.Quit()
			case <-app.Context().Done():
				// The window or application menu initiated shutdown.
			}
		}()
	})

	if err := app.Run(); err != nil {
		log.Fatalf("application exited with error: %v", err)
	}
}

// buildApp constructs the Wails application and registers the frontend-facing
// services.
func buildApp() *application.App {
	repo, err := openStartupRepo()
	if err != nil {
		log.Printf("starting without an open repository: %v", err)
	}
	registry := NewServices(repo, nil)

	return application.New(application.Options{
		Name:        "Ichi",
		Description: "A keyboard focused git client",
		Services: []application.Service{
			application.NewService(registry.Repo),
			application.NewService(registry.Graph),
			application.NewService(registry.Worktree),
			application.NewService(registry.Diff),
			application.NewService(registry.Refs),
			application.NewService(registry.Remote),
			application.NewService(registry.Stash),
			application.NewService(registry.Conflict),
			application.NewService(registry.Inspect),
			application.NewService(registry.Completion),
			application.NewService(registry.PR),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})
}

func openStartupRepo() (*git.Repository, error) {
	wd, err := os.Getwd()
	if err != nil {
		return nil, err
	}
	return services.OpenStartupRepository(wd)
}

// newMainWindow opens the primary application window.
func newMainWindow(app *application.App) {
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Main",
		Width:  1280,
		Height: 800,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInsetUnified,
		},
		BackgroundColour: application.NewRGB(6, 7, 15),
		URL:              "/",
	})
}
