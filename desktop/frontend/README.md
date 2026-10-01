# Ichi desktop frontend

Vue and TypeScript run in the Wails desktop window. The Go module in `desktop/`
uses `replace github.com/atterpac/ichi => ..`, so clone the whole Ichi repository;
the desktop directory alone is insufficient for backend builds and bindings.

## Setup and development

Use Node `^22.18.0 || >=24.12.0`, pnpm, Go 1.26.1 or newer, and `just`.
Install the Wails CLI version specified by `desktop/go.mod` when regenerating
bindings or packaging. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The browser development server exposes `/index.html` and the design lab pages.
Browser previews have no live desktop Git bridge. Use `just run` from `desktop/`
to build and run the native app.

Native builds require the Wails host dependencies: GTK4 and WebKitGTK 6.0
development libraries on Linux (GTK3 builds require the corresponding GTK3 and
WebKitGTK 4.1 libraries), Xcode command-line tools/SDK on macOS, and WebView2 on
Windows. Distribution recipes additionally use platform packaging tools shown
in `desktop/justfile`, such as NSIS on Windows.

After changing a frontend-facing Go service contract, run `just bindings` from
`desktop/`, then review the generated changes. Do not hand-edit generated
`src/bindings/` files. They are type-checked but excluded from source lint.

## Validation

Run the full desktop gate from `desktop/`:

```sh
just ci
```

It runs frontend type checking, non-fixing lint, generated-theme consistency,
all three frontend test runners, Go formatting checks, Go vet, and Go tests.
The gate does not fix source or regenerate bindings/themes. Existing lint
failures must be addressed by their owning area; a failed gate is not permission
to suppress those diagnostics.

Frontend commands can also be run independently:

```sh
pnpm check              # frontend portion of the desktop gate
pnpm type-check         # Vue, TypeScript, config and unit-test types
pnpm lint:check         # oxlint and ESLint, without fixes
pnpm test               # Vitest, tooling node:test
pnpm test:unit run      # Vue/TS unit suites only
pnpm test:tooling       # build boundaries and theme generation
pnpm check:themes       # verify generated outputs without writing
```

Node runner tests need subprocess access for determinism and generator checks.
`pnpm lint` remains an explicit fixing command for local development.

## Application and lab builds

The finder uses `f:` for filenames and `g:` for literal content searches. Filename
queries run against a normalized Go index of tracked files and untracked files
that Git does not ignore. Only the best eight results cross the desktop bridge.
The index refreshes after Git mutations or repository switches and expires after
five seconds; this prototype does not install a filesystem watcher. It is capped
at 250,000 paths and an estimated 32 MiB of retained data.

Content search is enabled when `rg` is on `PATH` or already bundled beside the
app executable, in `resources/bin`, or in macOS `Resources/bin`. No dependency is
downloaded. It uses literal matching, smart case, Git/ripgrep ignore rules, hidden
files, and no symlink following. Searches have a three-second deadline, skip
files over 1 MiB, and bound result count and output. A content result opens the
file's blame view; its preview includes the matching line and location.

Desktop patch reads stop at 4 MiB or 20,000 raw patch lines, with an error that
keeps file-level actions available. Inspection caches are bounded, and blame,
changes, and stash lists render viewport windows. Graph layouts encode vertical
rails as spans rather than a dense lane grid. Run `go test ./services -bench
'Benchmark(FileSearch|WideGraph)' -benchmem` from `desktop/` to measure the warm
100,000-path search and the 1,000-row, 500-lane layout fixtures.

`pnpm build` checks types before building the application into `frontend/dist`.
`just build-frontend` regenerates bindings, runs that checked build, then copies
only this app output to `desktop/dist` for Go embedding. Type failures stop the
recipe before it replaces embedded assets. `pnpm build-only` is an explicit
unchecked Vite build for tooling/debugging, not the desktop packaging gate.

```sh
pnpm build:labs          # app preview plus every lab entry, in dist-labs
pnpm preview:labs        # serve dist-labs
pnpm sandbox            # develop /sandbox.html
```

Lab output is separate and never copied by the desktop recipe. See
[`src/sandbox/README.md`](src/sandbox/README.md) for individual previews.

## Themes

`pnpm gen:themes` reads local `src/theme/defs/*.yaml` and the exact dado module
selected by `desktop/go.mod`/`go.sum`. Run `go mod download github.com/atterpac/dado`
from `desktop/` first if needed. Commit both generated outputs after a palette
change. `pnpm check:themes` checks that they are current without modifying them.

`DADO_DIR=/path/to/dado pnpm gen:themes` explicitly uses an alternate checkout;
the normal generator does not use sibling checkouts, Go workspaces, or local
module replacements. Local definitions take precedence. Six retained palettes
are checked in locally to preserve the existing picker and saved theme IDs;
their snapshot provenance is recorded in the YAML headers.
