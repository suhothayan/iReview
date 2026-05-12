# iReview

**AI codes. I review.** — browser-based local diff review for AI-generated code.

Point it at a git repo, pick any combination of recent commits + uncommitted work, and review the resulting diff like a GitHub pull request. Leave typed comments (must-fix / suggestion / note) and click **Copy review** to paste a structured Markdown summary back to your coding agent — Claude Code, Cursor, Copilot, anything.

Website: <https://suhothayan.github.io/iReview/>

## Why iReview

- **vs `git diff`** — you can actually leave typed comments instead of just reading.
- **vs the agent self-reviewing** — don't grade your own homework. A human catches the deadlocks, races, and dumb mistakes the agent confidently shipped.
- **vs a GitHub PR** — works pre-commit on staged + unstaged + recent commits, all locally, no push needed.

## Demo

![demo](./docs/demo.gif)

## Install + run

### Homebrew (macOS / Linux)

```bash
brew tap suhothayan/tap
brew install ireview
```

Then, from any subdirectory of a git repo:

```bash
ireview
```

It walks up looking for `.git`, listens on port `3737` by default, and opens your browser automatically. Use `--port N` to override, or pass an explicit path: `ireview /path/to/your/repo`.

### Windows (PowerShell)

```powershell
irm https://suhothayan.github.io/iReview/install.ps1 | iex
```

Downloads the latest release exe to `%USERPROFILE%\.ireview\` and adds it to your user `PATH`. Open a new terminal afterwards, then `ireview` works from any git repo. You can [view the install script](https://raw.githubusercontent.com/suhothayan/iReview/main/docs/install.ps1) before piping.

<details>
<summary>Other ways to install</summary>

#### Single binary

Download the binary for your OS from the [Releases](https://github.com/suhothayan/iReview/releases) page and run it directly:

```bash
./ireview /path/to/your/repo
```

On macOS, Gatekeeper will block direct downloads — either install via Homebrew (above) or remove the quarantine flag manually:

```bash
xattr -d com.apple.quarantine ./ireview-macos-arm64
```

#### From source

```bash
git clone https://github.com/suhothayan/iReview
cd iReview
npm install
IREVIEW_REPO=/path/to/your/repo npm run dev
```

Vite dev server on `:5173`, Express API on `:3737`.

</details>

**Requires:** `git` installed on your system.

## Features

- **Pick any selection.** Recent commits + uncommitted (staged / unstaged) all in one picker — combined into a single diff.
- **GitHub-style diff viewer.** Unified diff with hunk headers, file tree sidebar, sticky per-file headers, comment count badges.
- **Click to comment.** Click a line for a typed comment (must-fix / suggestion / note). **Shift-click** another line on the same side to extend a multi-line range. File-level and review-level comments too.
- **Mark files reviewed.** Per-file checkbox plus tri-state cascading checkboxes on directories.
- **Two view modes.** **Single** (one file at a time, with Prev / Next nav) or **Scroll all** (continuous scroll, sidebar follows scroll position).
- **Copy review.** Numbered, structured Markdown lands on your clipboard. Paste into your AI agent's chat to apply fixes.
- **Light + dark theme.** Honours `prefers-color-scheme` on first load, persists choice.
- **Comments survive reloads.** Per-repo, no signup, no cloud.
- **Quit from the browser.** Click the ⏻ in the toolbar to stop the server cleanly.

## Command-line options

```
ireview [REPO_PATH] [--port N] [--no-open] [-f FROM] [-t TO]

Arguments:
  REPO_PATH       Path to a git repository (default: walks up from cwd)

Options:
  -p, --port N    Port to listen on (default: 3737)
      --no-open   Don't auto-open the browser
  -f, --from      One endpoint of the picker range (see below)
  -t, --to        The other endpoint (optional; defaults to "unstaged")
  -v, --version   Show version
  -h, --help      Show this help
```

### Pre-selecting a range on launch

The picker's rows form a single ordered list — `unstaged` → `staged` →
`commits` — and `--from` / `--to` pick a contiguous range across it. Most
useful for AI coding agents that want to say "open iReview on what I just
produced".

Either endpoint accepts `unstaged`, `staged`, or anything `git rev-parse`
understands (`HEAD`, `HEAD~N`, branch names, full or short SHAs). A
missing endpoint defaults to `unstaged` — so `--from HEAD~3` means
"everything since HEAD~3 including in-flight work", matching how every
other git command treats a single ref.

```bash
ireview                                # default: all uncommitted work
ireview -f HEAD~3                      # last 3 commits + my dirty edits
ireview -f HEAD                        # last commit + my dirty edits
ireview -f staged                      # staged + unstaged (no commits)
ireview -f HEAD -t HEAD~2              # narrow: just commits, no dirty
ireview -f a1b2c3 -t HEAD              # one specific commit + everything up to HEAD

# Agent-style: review the SHAs you just produced
ireview --from "$(git log -3 --format=%H | tail -1)"
```

`HEAD~N` follows git's first-parent convention but the picker shows
topo-order log, so `--from HEAD~3 --to HEAD` may fill in more than four
commits if merges sit in between — same as what you'd see if you ticked
those two rows in the picker UI.

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

## FAQ

**Does iReview send my code anywhere?**
No. The diff stays on your machine. The server runs on `127.0.0.1`, talks only to your local `git`, and there's no telemetry or analytics. See [server/index.js](./server/index.js).

**Is iReview free? Will it stay free?**
Yes. MIT licensed, open source, no paid tier, no signup.

**Why not just use my agent's built-in review?**
Letting the agent grade its own homework tends to miss the issues you'd catch. iReview keeps a human in the loop without leaving the terminal flow.

**Does it work on Windows?**
Yes — install via the PowerShell one-liner above.

**Can I use it for non-AI code reviews?**
Yes. iReview is just a local diff reviewer — pre-commit reviews, self-reviews, sanity checks all work fine.

## What's new in 0.3.0

- **Picker now auto-applies.** Every click in the picker writes to the selection immediately — no more Apply / Reset buttons. The diff refetches in the background; closing the picker lands you on an already-loaded diff.
- **Unified commit picker.** Unstaged, staged, and recent commits are one ordered list. Pick a contiguous range across all of it with calendar-style click rules: click outside the range to extend, click an endpoint to shrink, click inside to reset.
- **CLI presets for AI agents.** New `--from` / `--to` flags (with `-f` / `-t` short forms) let an agent launch iReview pointed at exactly the range it just produced. Endpoints accept any git ref plus `staged` / `unstaged`. See "Pre-selecting a range on launch" above.
- **Refresh button picks up disk changes.** Re-pulls `/api/repo` so a freshly staged file shows up in the picker without restarting the server.

Older releases: see the [GitHub Releases page](https://github.com/suhothayan/iReview/releases).

## Security

iReview binds to `127.0.0.1` only and authenticates the shutdown endpoint with a per-boot token. See [SECURITY.md](./SECURITY.md) to report a vulnerability.

## Contributing

PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for architecture notes, build instructions, and the project's npm scripts.

Run `npm run typecheck` and `npm test` before submitting; both should be green.

## License

MIT — see [LICENSE](./LICENSE).
