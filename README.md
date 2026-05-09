# iReview

Browser-based local diff review for AI-generated changes.

Point it at a git repository, pick any combination of recent commits + uncommitted work, review the resulting diff like a GitHub pull request, leave typed comments (must-fix / suggestion / note), and click **Copy review** to put a structured Markdown summary on your clipboard — ready to paste back to your coding agent.

## Demo

![demo](./docs/demo.gif)

## Install + run

### Option A — Homebrew (macOS / Linux, recommended)

```bash
brew tap suhothayan/tap
brew install ireview
```

Then, from any subdirectory of a git repo:

```bash
ireview
```

It walks up looking for `.git`, listens on port `3737` by default, and opens your browser automatically. Use `--port N` to override, or pass an explicit path: `ireview /path/to/your/repo`.

### Option B — single binary

Download the binary for your OS from the [Releases](https://github.com/suhothayan/iReview/releases) page and run it directly:

```bash
./ireview /path/to/your/repo
```

On macOS, Gatekeeper will block direct downloads — either install via Homebrew (above) or remove the quarantine flag manually:

```bash
xattr -d com.apple.quarantine ./ireview-macos-arm64
```

**Requires:** `git` installed on your system.

### Option C — from source

```bash
git clone https://github.com/suhothayan/iReview
cd iReview
npm install
IREVIEW_REPO=/path/to/your/repo npm run dev
```

Vite dev server on `:5173`, Express API on `:3737`.

## Features

- **Pick any selection.** Recent commits + uncommitted (staged / unstaged) all in one picker — combined into a single diff.
- **GitHub-style diff viewer.** Unified diff with hunk headers, file tree sidebar, sticky per-file headers, comment count badges.
- **Click to comment.** Click a line to leave a typed comment (must-fix / suggestion / note). **Shift-click** another line on the same side to extend a multi-line range. File-level and review-level comments too.
- **Mark files reviewed.** Per-file checkbox, plus tri-state cascading checkboxes on directories — tick a folder to mark every file inside as reviewed.
- **Two view modes.** **Single** (one file at a time, with Prev / Next nav) or **Scroll all** (continuous scroll, sidebar highlight follows scroll position).
- **Copy review.** Numbered, structured Markdown lands on your clipboard with one click. Paste into your AI agent's chat to apply fixes.
- **Light + dark theme.** CSS variables, theme toggle, honours `prefers-color-scheme` on first load, persists choice.
- **Mobile / tablet friendly.** Toolbar wraps; sidebar becomes a drawer below `md`; nav labels collapse to icons.
- **Per-repo session persistence.** Comments and reviewed flags survive page reloads, keyed by repo path.
- **Quit from the browser.** No terminal needed — click the ⏻ in the toolbar to stop the server cleanly.

## Command-line options

```
ireview [REPO_PATH] [--port N] [--no-open]

Arguments:
  REPO_PATH       Path to a git repository (default: walks up from cwd)

Options:
  -p, --port N    Port to listen on (default: 3737)
      --no-open   Don't auto-open the browser
  -v, --version   Show version
  -h, --help      Show this help
```

## Output format

The exported review is structured Markdown optimized for pasting into AI agent chats:

```
I reviewed your code and have the following comments. Please address them.

Comment types: MUST FIX (must be addressed), SUGGESTION (improvements), NOTE (observations)

1. [MUST FIX] - `src/db.ts:42-50` - this transaction can deadlock under contention
2. [SUGGESTION] - `src/auth.ts:12` - add a more specific error message
3. [SUGGESTION] - `src/auth.ts:50` - prefer Result<> over throwing here
   the calling layer would rather branch on a typed result than wrap a try/catch
4. [NOTE] - `src/auth.ts` - consider extracting this into a dedicated module
```

- Numbered for easy reference (you can ask the agent: "address comment #2")
- File-level comments show as `` `path` ``, line as `` `path:N` ``, range as `` `path:N-M` ``
- Legend only includes types you actually used
- Multi-paragraph bodies indent under the header so they stay inside the list item
- Comments sorted by file (review-level first), then by line

## Building binaries yourself

```bash
# Your platform (auto-detects current OS/arch)
npm run build:binary

# Specific targets
npm run build:binary:macos-arm64
npm run build:binary:macos-x64
npm run build:binary:linux-x64
npm run build:binary:windows-x64

# All four at once
npm run build:binary:all
```

Binaries are ~60 MB each — they bundle Bun's JS runtime + the built React frontend (embedded as base64) + the Express server. **Build prerequisite:** [Bun](https://bun.sh/) on your `$PATH` (or at `~/.bun/bin/bun`). Runtime dependency: `git`.

## Security

iReview binds to `127.0.0.1` only and authenticates the shutdown endpoint with a per-boot token. See [SECURITY.md](./SECURITY.md) to report a vulnerability.

## Architecture

- `server/index.js` — Express + cors. Shells out to `git` via `execFile` (no shell injection surface). Endpoints: `/api/repo`, `/api/diff` (Selection-based), `/api/commits`, `/api/shutdown` (token-protected). Falls back to embedded assets when run as a compiled binary.
- `src/lib/parseDiff.ts` — git unified diff → structured `DiffFile[]`. Tested against fixture diffs (modify / add / delete / rename / multi-hunk / mode-only / binary / quoted paths / no-newline-at-EOF).
- `src/lib/store.ts` — Zustand store. Comments + reviewed flags persisted per repo via explicit `loadSession` / `saveSession`.
- `src/lib/exportMarkdown.ts` — comments → clipboard Markdown.
- `src/lib/tones.ts` — shared color palette for selection chips and badges.
- `src/components/` — `Toolbar`, `FileList` (tree), `DiffView`, `CommentForm`, `CommitPicker`, `ConfirmModal`, `Logo`, screens.
- `src/hooks/` — `useBootRepo`, `useScrollSpy`, `useFileNavigation`.
- `scripts/embed-assets.js` — reads `dist/` after `vite build` and bakes it into `server/embedded-assets.js` for the binary.

## Project scripts

```bash
npm run dev               # Vite + Express, hot reload
npm run build             # build the React app to dist/
npm run start             # serve the built app from Express
npm run typecheck         # tsc --noEmit
npm run test              # vitest run
npm run build:binary      # build the standalone executable
```

## Contributing

PRs welcome. Run `npm run typecheck` and `npm test` before submitting; both should be green.

## License

MIT — see [LICENSE](./LICENSE).
