package main

import (
	"context"
	"embed"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"

	"github.com/atterpac/ichi/internal/git"
	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:dist
var assets embed.FS

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	_ = ctx

	app := buildApp()
	newMainWindow(app)

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
	root, err := gitWorktreeRoot(wd)
	if err != nil {
		return nil, err
	}
	return git.OpenRepository(root)
}

func gitWorktreeRoot(path string) (string, error) {
	out, err := exec.Command("git", "-C", path, "rev-parse", "--show-toplevel").Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
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
			TitleBar: application.MacTitleBar{
				AppearsTransparent: true,
				HideTitle:          true,
				FullSizeContent:    true,
			},
		},
		BackgroundColour: application.NewRGB(6, 7, 15),
		URL:              "/",
	})
}
