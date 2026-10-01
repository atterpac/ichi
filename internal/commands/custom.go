package commands

import (
	"context"
	"fmt"
	"strings"

	"github.com/atterpac/dado/async"
	"github.com/atterpac/ichi/internal/app"
	"github.com/atterpac/ichi/internal/config"
	ichiexec "github.com/atterpac/ichi/internal/exec"
	"github.com/atterpac/ichi/internal/selection"
	"github.com/atterpac/ichi/internal/views"
)

// RegisterCustom registers user-defined commands from config. Invalid command
// definitions are skipped and returned as warnings. Custom commands override
// builtins of the same name (replacing them in the registry).
func RegisterCustom(cmds []config.CustomCommand) []string {
	var warnings []string
	for _, c := range cmds {
		if err := config.ValidateCommand(c); err != nil {
			warnings = append(warnings, err.Error())
			continue
		}
		cmd := buildCommand(c)
		if err := validateReplacement(cmd); err != nil {
			warnings = append(warnings, err.Error())
			continue
		}
		if c.Key != "" {
			chord, err := parseKeyChord(c.Key)
			if err != nil {
				warnings = append(warnings, fmt.Sprintf("custom command %q: %v", c.Name, err))
				continue
			}
			bindKey(chord, cmd)
		}
		registerOrReplace(cmd)
	}
	return warnings
}

// registerOrReplace adds cmd, replacing any existing command with the same name
// (custom commands override builtins).
// Replacing a primary name removes aliases owned by the old command. New
// commands may replace an alias as a primary name, but never hijack unrelated
// primary names or aliases through their new alias list.
func validateReplacement(cmd *Command) error {
	existing := registry[cmd.Name]
	for _, alias := range cmd.Aliases {
		if alias == cmd.Name {
			continue
		}
		owner := registry[alias]
		if owner != nil && (existing == nil || existing.Name != cmd.Name || owner != existing) {
			return fmt.Errorf("command %q alias %q belongs to %q", cmd.Name, alias, owner.Name)
		}
	}
	return nil
}

func registerOrReplace(cmd *Command) {
	existing := registry[cmd.Name]
	if existing != nil && existing.Name == cmd.Name {
		for name, owner := range registry {
			if owner == existing {
				delete(registry, name)
			}
		}
		for i, c := range allCommands {
			if c == existing {
				allCommands[i] = cmd
				break
			}
		}
	} else {
		allCommands = append(allCommands, cmd)
	}
	registry[cmd.Name] = cmd
	for _, alias := range cmd.Aliases {
		registry[alias] = cmd
	}
}

func buildCommand(c config.CustomCommand) *Command {
	desc := c.Description
	if desc == "" {
		desc = "Custom: " + c.Command
	}
	return &Command{
		Name:        c.Name,
		Aliases:     c.Aliases,
		Description: desc,
		Handler:     customHandler(c),
	}
}

func customHandler(c config.CustomCommand) Handler {
	return func(ctx *Context, args []string) error {
		sel := ctx.Selection()
		if err := checkRequires(c.Requires, sel); err != nil {
			return fmt.Errorf("%s: %w", c.Name, err)
		}

		expanded, err := Expand(c.Command, sel, ctx.Repo, args)
		if err != nil {
			return fmt.Errorf("%s: %w", c.Name, err)
		}

		run := func() { runCustom(ctx, c, expanded) }
		if c.Confirm {
			// Defer the modal until after the command-submit handler returns and
			// restores focus to the underlying view. A modal captures the
			// currently-focused widget on push and restores it on dismiss; if we
			// showed it inline here, it would capture the (now hidden) command bar
			// and cancelling would leave the app unfocused.
			go ctx.App.QueueUpdateDraw(func() {
				views.ShowConfirmModal(ctx.App, c.Name,
					fmt.Sprintf("Run:\n%s", expanded), run)
			})
			return nil
		}
		run()
		return nil
	}
}

func checkRequires(requires string, sel *selection.Context) error {
	switch requires {
	case "commit":
		if !sel.HasCommit() {
			return fmt.Errorf("no commit selected")
		}
	case "branch":
		if !sel.HasBranch() {
			return fmt.Errorf("no branch selected")
		}
	case "file":
		if !sel.HasFile() {
			return fmt.Errorf("no file selected")
		}
	case "stash":
		if !sel.HasStash() {
			return fmt.Errorf("no stash selected")
		}
	}
	return nil
}

func runCustom(ctx *Context, c config.CustomCommand, command string) {
	repoRoot := ctx.Repo.Path()
	if c.View == "editor" {
		ctx.App.Suspend(func() {
			if err := ichiexec.RunShellInteractive(repoRoot, command); err != nil {
				app.ToastError(err.Error())
			}
		})
		return
	}
	runCustomAsync(c.Name, repoRoot, command, func(out string) {
		switch c.View {
		case "pager", "diff":
			ctx.App.Pages().Push(views.NewOutputView(ctx.App, c.Name, out, c.View == "diff"))
			ctx.App.Crumbs().SetPath([]string{c.Name})
		case "commit", "graph":
			ref := firstToken(out)
			if ref == "" {
				app.ToastError(fmt.Sprintf("%s: command produced no commit ref", c.Name))
				return
			}
			ctx.App.Pages().Push(views.NewCommitView(ctx.App, ctx.Repo, ref))
			ctx.App.Crumbs().SetPath([]string{c.Name, ref})
		case "branch":
			ctx.App.Pages().Push(views.NewBranchesView(ctx.App, ctx.Repo))
			ctx.App.Crumbs().SetPath([]string{"Branches"})
		default:
			message := strings.TrimSpace(out)
			if message == "" {
				message = c.Name + " done"
			}
			app.ToastSuccess(message)
		}
	}, func(err error) { views.ShowErrorModal(ctx.App, c.Name+" failed", err.Error()) })
}

// All noninteractive output modes share one cancellable execution lifecycle;
// dado's loader dispatches the result callbacks onto the UI queue.
func runCustomAsync(name, repoRoot, command string, onOutput func(string), onError func(error)) *async.Loader[string] {
	return app.RunAsync("Running "+name+"...", func(ctx context.Context) (string, error) {
		out, errOut, err := ichiexec.RunShell(ctx, repoRoot, command)
		if err != nil {
			return "", fmt.Errorf("%s: %w", strings.TrimSpace(errOut), err)
		}
		return out, nil
	}, onOutput, onError)
}

// firstToken returns the first whitespace-delimited token of s.
func firstToken(s string) string {
	return strings.TrimSpace(strings.SplitN(strings.TrimSpace(s), "\n", 2)[0])
}
