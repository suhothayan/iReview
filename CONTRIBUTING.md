# Contributing to iReview

PRs welcome. Please run `npm run typecheck` and `npm test` before submitting — both should be green.

## Project scripts

```bash
npm run dev               # Vite + Express, hot reload
npm run build             # build the React app to dist/
npm run start             # serve the built app from Express
npm run typecheck         # tsc --noEmit
npm run test              # vitest run
npm run build:binary      # build the standalone executable for the current platform
```

## Building binaries

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

Binaries are ~60 MB each — they bundle Bun's JS runtime, the built React frontend (embedded as base64), and the Express server.

**Build prerequisite:** [Bun](https://bun.sh/) on your `$PATH` (or at `~/.bun/bin/bun`).
**Runtime dependency:** `git`.

## Architecture

- `server/index.js` — Express + cors. Shells out to `git` via `execFile` (no shell-injection surface). Endpoints: `/api/repo`, `/api/diff` (Selection-based), `/api/commits`, `/api/shutdown` (token-protected). Falls back to embedded assets when run as a compiled binary.
- `src/lib/parseDiff.ts` — git unified diff → structured `DiffFile[]`. Tested against fixture diffs (modify / add / delete / rename / multi-hunk / mode-only / binary / quoted paths / no-newline-at-EOF).
- `src/lib/store.ts` — Zustand store. Comments + reviewed flags persisted per repo via explicit `loadSession` / `saveSession`.
- `src/lib/exportMarkdown.ts` — comments → clipboard Markdown.
- `src/lib/tones.ts` — shared color palette for selection chips and badges.
- `src/components/` — `Toolbar`, `FileList` (tree), `DiffView`, `CommentForm`, `CommitPicker`, `ConfirmModal`, `Logo`, screens.
- `src/hooks/` — `useBootRepo`, `useScrollSpy`, `useFileNavigation`.
- `scripts/embed-assets.js` — reads `dist/` after `vite build` and bakes it into `server/embedded-assets.js` for the binary.

## Releasing

When cutting a new version:

1. Bump `version` in `package.json`.
2. Update README's "What's new" section.
3. Tag `vX.Y.Z` and push the tag.
4. `npm run build:binary:all` to produce the four platform binaries.
5. `shasum -a 256 ireview-* > SHA256SUMS`.
6. Create a GitHub Release, upload all 5 assets (4 binaries + SHA256SUMS), and write release notes.
7. Update `Formula/ireview.rb` in `suhothayan/homebrew-tap` (version + 3 urls + 3 sha256s) so `brew install` picks up the new release.
