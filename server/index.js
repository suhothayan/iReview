import express from "express";
import cors from "cors";
import { execFile, execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { embeddedAssets } from "./embedded-assets.js";
import pkg from "../package.json" with { type: "json" };

const execFileP = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION = pkg.version;

// Parse CLI args + env. Positional arg is the repo path.
//   ireview                            -> review cwd
//   ireview /path/to/repo              -> review that repo
//   ireview --port 4000                -> override port
//   ireview --no-open                  -> don't auto-open browser
//   ireview --from HEAD                -> open the picker on the last commit
//   ireview --from HEAD --to HEAD~2    -> open on a range (last 3 commits)
//   ireview --from staged --to HEAD    -> staged + last commit (range)
//   ireview --from unstaged            -> just my unstaged edits
//   ireview --help                     -> usage
//
// --from and --to accept anything `git rev-parse` understands plus the
// special names `unstaged` and `staged` (the two non-commit picker rows).
const argv = process.argv.slice(2);
let argRepo = null;
let argPort = null;
let argOpen = true;
let argFrom = null;
let argTo = null;
const requireValue = (flag, next) => {
  if (next === undefined || next.startsWith("-")) {
    console.error(`${flag} requires a value (a git ref, "staged", or "unstaged").`);
    process.exit(2);
  }
  return next;
};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--help" || a === "-h") {
    printHelp();
    process.exit(0);
  } else if (a === "--port" || a === "-p") {
    argPort = Number(argv[++i]);
  } else if (a === "--no-open") {
    argOpen = false;
  } else if (a === "--version" || a === "-v") {
    console.log(`iReview v${VERSION}`);
    process.exit(0);
  } else if (a === "--from" || a === "-f") {
    argFrom = requireValue("--from", argv[i + 1]);
    i++;
  } else if (a === "--to" || a === "-t") {
    argTo = requireValue("--to", argv[i + 1]);
    i++;
  } else if (!a.startsWith("-")) {
    argRepo = a;
  }
}

const PORT = argPort ?? Number(process.env.PORT || 3737);

// Resolve the repo. Reject leading-dash paths so a malicious env var like
// IREVIEW_REPO=-x can't be misread as a flag downstream.
const rawRepoArg = argRepo || process.env.IREVIEW_REPO;
if (rawRepoArg && rawRepoArg.startsWith("-")) {
  console.error(
    `Refusing repo path that starts with '-': ${rawRepoArg}. Use an absolute path.`,
  );
  process.exit(2);
}
const REPO_EXPLICIT = !!rawRepoArg;
const REPO_INITIAL = path.resolve(rawRepoArg || process.cwd());
function findGitRoot(start) {
  let cur = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(cur, ".git"))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}
const REPO = REPO_EXPLICIT
  ? REPO_INITIAL
  : findGitRoot(REPO_INITIAL) || REPO_INITIAL;

// Resolve a --from/--to endpoint to a unified picker row index.
//   0           = unstaged
//   1           = staged
//   2..N+1      = commits[0..N-1] in `git log` topo order (matches what the
//                 picker fetches)
// Special-cases the two non-commit row names. Everything else goes through
// `git rev-parse` and then a lookup in the recent-500 log window.
function resolveEndpointToRow(value, log) {
  if (value === "unstaged") return 0;
  if (value === "staged") return 1;
  // Belt-and-suspenders: rev-parse is already invoked via execFile (no shell),
  // but reject leading '-' (looks-like-flag), control chars, and ';' before
  // letting any user-provided string near git.
  if (!/^[A-Za-z0-9_./~^@:-]+$/.test(value) || value.startsWith("-")) {
    console.error(
      `Refusing --from/--to value ${JSON.stringify(value)}: contains characters not allowed in a git ref.`,
    );
    process.exit(2);
  }
  let sha;
  try {
    sha = execFileSync(
      "git",
      ["-C", REPO, "rev-parse", "--verify", "--end-of-options", `${value}^{commit}`],
      { encoding: "utf8" },
    ).trim();
  } catch {
    console.error(
      `Could not resolve ${JSON.stringify(value)} to a commit in ${REPO}. ` +
        `Use a git ref, "staged", or "unstaged".`,
    );
    process.exit(2);
  }
  const idx = log.indexOf(sha);
  if (idx < 0) {
    console.error(
      `${JSON.stringify(value)} resolved to ${sha} but that commit is older ` +
        `than the most recent 500 in this repo. Can't place it on the picker's row axis.`,
    );
    process.exit(2);
  }
  return idx + 2;
}

// Build the preset selection from --from / --to. If either endpoint is
// omitted it defaults to "unstaged" (row 0) — matching how every other
// git tool treats a single ref ("X up to current state"). Order between
// --from and --to doesn't matter — they're sorted into a contiguous range
// and filled in.
function buildPreset() {
  if (argFrom === null && argTo === null) return null;
  if (!fs.existsSync(path.join(REPO, ".git"))) {
    // No repo, no log to resolve against. Let the regular boot path
    // surface the "no_repo" error to the user.
    return null;
  }
  let log;
  try {
    log = execFileSync(
      "git",
      ["-C", REPO, "log", "--pretty=%H", "--max-count=500"],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return null;
  }
  // A missing endpoint defaults to "unstaged" (row 0). `ireview --from HEAD~3`
  // means "everything since HEAD~3 including in-flight work" — matches git
  // convention for a single ref + iReview's "unified list" mental model.
  const fromRow = argFrom === null ? 0 : resolveEndpointToRow(argFrom, log);
  const toRow = argTo === null ? 0 : resolveEndpointToRow(argTo, log);
  const lo = Math.min(fromRow, toRow);
  const hi = Math.max(fromRow, toRow);
  let unstaged = false;
  let staged = false;
  const shas = [];
  for (let i = lo; i <= hi; i++) {
    if (i === 0) unstaged = true;
    else if (i === 1) staged = true;
    else if (log[i - 2]) shas.push(log[i - 2]);
  }
  return { shas, staged, unstaged };
}

// Surfaced to the frontend so it skips the auto-default
// {staged: true, unstaged: true} and opens with exactly what the caller
// asked for. The frontend tracks "preset already applied" per browser
// session (sessionStorage) so it isn't re-applied on a Cmd-R reload that
// would otherwise trample the user's later picker edits — that means
// the server can just return the preset on every /api/repo without
// worrying about cross-tab races.
const PRESET_SELECTION = buildPreset();

// Per-boot token. Required on POST /api/shutdown so a stray browser tab on a
// random localhost site can't kill the server via a forged request. Embedded
// into the served HTML so the legitimate frontend can read it.
const SHUTDOWN_TOKEN = crypto.randomBytes(16).toString("hex");

function printHelp() {
  console.log(`iReview — browser-based local diff review

Usage:
  ireview [REPO_PATH] [--port N] [--no-open] [-f FROM] [-t TO]

Arguments:
  REPO_PATH       Path to a git repository (default: current directory)

Options:
  -p, --port N    Port to listen on (default: 3737)
      --no-open   Don't auto-open the browser
  -f, --from      One endpoint of the picker range. Accepts:
                    "unstaged"   — your working-tree edits
                    "staged"     — your index
                    any git ref  — HEAD, HEAD~N, branch names, SHAs
  -t, --to        The other endpoint (optional). Order between --from and
                  --to doesn't matter; the picker fills everything in
                  between. A missing endpoint defaults to "unstaged".
  -v, --version   Show version
  -h, --help      Show this help

The picker's rows form a single ordered list — unstaged → staged →
commits — and --from / --to pick a contiguous range across all of it,
matching the picker UI. A single endpoint means "from there up to
unstaged" — same as \`git log REF\` includes everything since REF.

Heads up: HEAD~N follows git's first-parent convention, but the picker
shows topo-order log. So --from HEAD~3 --to HEAD may fill in *more*
than four commits if merges sit in between — same as if you ticked the
same two rows in the picker.

Examples:
  ireview                                # default: all my uncommitted work
  ireview -f HEAD~3                      # everything since HEAD~3 + in-flight
  ireview -f HEAD                        # last commit + my dirty edits
  ireview -f staged                      # staged + unstaged (no commits)
  ireview -f HEAD --to HEAD~2            # narrow: last 3 commits only, no dirty
  ireview -f a1b2c3 -t HEAD              # one commit + history up to HEAD

For AI coding agents:
  # I just made N commits and want them reviewed (no dirty work):
  ireview --from HEAD~{N-1} --to HEAD

  # I made commits AND left in-flight edits, review it all:
  ireview --from HEAD~{N-1}

  # I only made staged/unstaged edits (no commit yet):
  ireview --from unstaged

Requires: git on your PATH (the server shells out to it).
`);
}

const app = express();

// Same-origin only. The server binds to 127.0.0.1 below; combined with this
// CORS policy, no cross-origin page (or LAN attacker) can read the diffs.
app.use(
  cors({
    origin: `http://localhost:${PORT}`,
    credentials: false,
  }),
);
app.use(express.json({ limit: "10mb" }));

// All git invocations go through here. Uses execFile (no shell), and refuses
// to call git if any arg starts with '-' unless it's a known-safe option that
// we ourselves added. Validation of user-supplied values (shas, paths, ranges)
// happens at the request handler before reaching this point.
async function git(args) {
  const { stdout } = await execFileP("git", args, {
    cwd: REPO,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

// ----- input validators -----------------------------------------------------

const SHA_RE = /^[0-9a-fA-F]{4,40}$/;
function isValidSha(s) {
  return SHA_RE.test(s);
}

// Refspec like 'A..B' or 'A...B' or just 'A'. Forbids leading '-' anywhere
// (including after the dots) and disallows '..' as a path-traversal segment.
const REF_PART = /[A-Za-z0-9._\/~^][A-Za-z0-9._\/~^]*/;
const REF_PART_STRICT_RE = new RegExp(`^${REF_PART.source}$`);
const RANGE_RE = new RegExp(
  `^${REF_PART.source}(\\.{2,3}${REF_PART.source})?$`,
);
function isValidRange(s) {
  if (!RANGE_RE.test(s)) return false;
  // Reject /^|\.\.\./ refs — git allows them but they smell bad in HTTP input.
  if (s.includes("/..") || s.includes("../")) return false;
  return true;
}

app.get("/api/repo", async (_req, res) => {
  try {
    if (!fs.existsSync(path.join(REPO, ".git"))) {
      return res.status(400).json({
        kind: "no_repo",
        repo: REPO,
        startedFrom: REPO_INITIAL,
        explicit: REPO_EXPLICIT,
        error: `${REPO} is not a git repository`,
      });
    }
    const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    const head = (await git(["rev-parse", "HEAD"])).trim().slice(0, 12);
    const stagedNames = (await git(["diff", "--cached", "--name-only"])).trim();
    const unstagedNames = (await git(["diff", "--name-only"])).trim();
    // Untracked (but not .gitignore'd) files count as "dirty unstaged work"
    // for the picker's purposes — they'll appear in the diff as new-file
    // additions when Unstaged is in the selection. The list is also surfaced
    // so the frontend can render them with a "U" badge instead of "A"
    // (added) — they're not in any commit, just sitting in the working tree.
    // `-z` is required: paths can legitimately contain newlines on Unix.
    const untrackedRaw = await git([
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
    ]);
    const untrackedFiles = untrackedRaw.split("\0").filter(Boolean);
    const hasModified = unstagedNames.length > 0;
    res.json({
      repo: REPO,
      branch,
      head,
      hasStaged: stagedNames.length > 0,
      // `hasUnstaged` reflects "any dirty work in the working tree" — folds
      // tracked-modified and untracked together for the picker's binary state.
      // `hasModified` is the tracked-only slice; the picker uses it to write
      // a more honest subtitle ("working tree vs index" only when truly the
      // case, plus a "(+N untracked)" rider when untracked also exists).
      hasUnstaged: hasModified || untrackedFiles.length > 0,
      hasModified,
      untrackedFiles,
      // The CLI preset (`--from`/`--to`). Returned on every request; the
      // frontend tracks "already applied" per browser session so a Cmd-R
      // reload doesn't trample later picker edits.
      presetSelection: PRESET_SELECTION,
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/api/diff", async (req, res) => {
  const range = req.query.range ? String(req.query.range) : null;
  const shasParam = req.query.shas ? String(req.query.shas) : "";
  const includeStaged = req.query.staged === "1";
  const includeUnstaged = req.query.unstaged === "1";

  try {
    let args;
    if (range) {
      if (!isValidRange(range)) {
        return res.status(400).json({
          error:
            "invalid range: must be a refspec like 'A..B' or 'A...B' (no flags or path-traversal allowed)",
        });
      }
      // '--' separates revs from paths and prevents flag-like values from
      // being misinterpreted by git as options.
      args = ["diff", "--no-color", "--unified=3", range, "--"];
    } else {
      const shas = shasParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      // Validate each sha as hex before letting it anywhere near git.
      const invalid = shas.find((s) => !isValidSha(s));
      if (invalid) {
        return res.status(400).json({
          error: `invalid sha: ${invalid}. Must be 4–40 hex chars.`,
        });
      }

      let base = "HEAD";
      let oldest = null;
      let newest = null;
      if (shas.length > 0) {
        const sorted = await sortShasByHistory(shas);
        if (sorted.length === 0)
          return res.status(400).json({ error: "no valid commits found" });
        if (sorted.length < shas.length) {
          // Some shas weren't on HEAD's history (or beyond the 5000-commit
          // window). Continue with what we found — but log so users know.
          console.warn(
            `[/api/diff] only resolved ${sorted.length}/${shas.length} requested shas via HEAD history`,
          );
        }
        oldest = sorted[0];
        newest = sorted[sorted.length - 1];
        base = await resolveParent(oldest);
      }

      // Resolution priority — when multiple of {unstaged, staged, commits}
      // are set, we collapse to a single git diff:
      //   - includeUnstaged set => `git diff <base>` (working tree vs base).
      //     Implicitly includes staged + any commits between base and HEAD,
      //     which is what users expect when picking commits + dirty edits.
      //   - else includeStaged set => `git diff --cached <base>` (index vs base).
      //     Includes any commits between base and HEAD too, but no dirty edits.
      //   - else commits-only => `git diff <base>..<newest>`.
      //   - else => empty (nothing selected).
      if (includeUnstaged) {
        args = ["diff", "--no-color", "--unified=3", base, "--"];
      } else if (includeStaged) {
        args = ["diff", "--cached", "--no-color", "--unified=3", base, "--"];
      } else if (newest) {
        args = ["diff", "--no-color", "--unified=3", `${base}..${newest}`, "--"];
      } else {
        return res.type("text/plain").send("");
      }
    }
    const diff = await git(args);
    // When unstaged is on, also append synthesized diffs for untracked
    // (but-not-ignored) files. `git diff` doesn't surface these since git
    // doesn't track them yet — we shell out per file to `git diff --no-index`
    // so the output format is byte-identical to what parseDiff already
    // handles for new-file diffs.
    let untrackedDiff = "";
    if (includeUnstaged) {
      untrackedDiff = await untrackedFilesDiff();
    }
    res.type("text/plain").send(diff + untrackedDiff);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// How many untracked files to actually synthesize diffs for. Past this we
// stop inlining content and append a "...and N more" stub so a forgotten
// .gitignore can't melt the box with thousands of concurrent git invocations
// or thousands of MB of "+" lines streamed through V8.
const UNTRACKED_INLINE_LIMIT = 50;
// Per-file size cap. Bigger files get a stub instead of streamed content.
const UNTRACKED_INLINE_MAX_BYTES = 1024 * 1024;
// How many `git diff --no-index` invocations to keep in flight at once.
const UNTRACKED_CONCURRENCY = 8;

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

// Build a minimal one-line unified diff for an untracked file the server
// won't (or shouldn't) read — symlinks, binaries, oversized files, the
// "and N more" overflow placeholder. parseDiff sees a normal new-file entry
// with a single line of context-as-added explaining why.
function stubUntrackedDiff(relPath, note) {
  return (
    `diff --git a/${relPath} b/${relPath}\n` +
    `new file mode 100644\n` +
    `index 0000000..0000000\n` +
    `--- /dev/null\n` +
    `+++ b/${relPath}\n` +
    `@@ -0,0 +1 @@\n` +
    `+${note}\n`
  );
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function synthesizeUntrackedDiff(relPath) {
  const absPath = path.join(REPO, relPath);
  let st;
  try {
    // lstat (not stat) so we *don't* follow symlinks here — a malicious or
    // accidental symlink to /etc/passwd otherwise gets its target dumped
    // into the diff response.
    st = await fs.promises.lstat(absPath);
  } catch {
    return ""; // file disappeared (TOCTOU) — skip cleanly.
  }
  if (st.isSymbolicLink()) {
    let target = "(unreadable)";
    try {
      target = await fs.promises.readlink(absPath);
    } catch {
      // ignore — we never read the target's content anyway.
    }
    return stubUntrackedDiff(relPath, `(symlink → ${target}, not previewed)`);
  }
  if (!st.isFile()) {
    return stubUntrackedDiff(relPath, "(not a regular file, not previewed)");
  }
  if (st.size === 0) {
    return stubUntrackedDiff(relPath, "(empty file)");
  }
  if (st.size > UNTRACKED_INLINE_MAX_BYTES) {
    return stubUntrackedDiff(
      relPath,
      `(file too large to preview: ${formatBytes(st.size)})`,
    );
  }
  // Use `git diff --no-index` for real textual diff. It exits 1 when there
  // IS a diff (which we expect every time), so unwrap that case from the
  // execFile rejection. Anything else — ENOENT (TOCTOU), signal kill — we
  // surface as a stub rather than silently dropping.
  let stdout = "";
  try {
    const r = await execFileP(
      "git",
      ["-C", REPO, "diff", "--no-color", "--no-index", "--", "/dev/null", relPath],
      { maxBuffer: 16 * 1024 * 1024 },
    ).catch((err) => {
      if (err.code === 1 && typeof err.stdout === "string") {
        return { stdout: err.stdout };
      }
      throw err;
    });
    stdout = r.stdout || "";
  } catch {
    return stubUntrackedDiff(relPath, "(could not read file)");
  }
  // Binary detection: git emits a single line, no patch body.
  if (/^Binary files .* differ$/m.test(stdout)) {
    return stubUntrackedDiff(
      relPath,
      `(binary file, ${formatBytes(st.size)})`,
    );
  }
  return stdout;
}

async function untrackedFilesDiff() {
  let raw;
  try {
    raw = await git(["ls-files", "--others", "--exclude-standard", "-z"]);
  } catch {
    return "";
  }
  const paths = raw.split("\0").filter(Boolean);
  if (paths.length === 0) return "";

  // Cap how many we inline. A repo with a forgotten .gitignore (a fresh
  // `node_modules`, build output, etc.) can have thousands of untracked
  // files — diffing them all takes forever and bloats the response. Show
  // the first N and a "and M more" stub for the rest.
  const inlinePaths = paths.slice(0, UNTRACKED_INLINE_LIMIT);
  const fragments = await pool(inlinePaths, UNTRACKED_CONCURRENCY, synthesizeUntrackedDiff);
  let out = fragments.join("");
  if (paths.length > UNTRACKED_INLINE_LIMIT) {
    const extras = paths.length - UNTRACKED_INLINE_LIMIT;
    out += stubUntrackedDiff(
      ".ireview-untracked-overflow",
      `(${extras} more untracked files not previewed — consider adding a .gitignore)`,
    );
  }
  return out;
}

// Returns "<sha>^" when the commit has a parent, otherwise the canonical
// empty-tree SHA-1. Diff'ing a root commit against the empty tree shows
// everything in that commit as "added" — which is what users expect when
// they pick the very first commit in a repo.
const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
async function resolveParent(sha) {
  try {
    // --end-of-options separates the rev from any flags. sha is hex-validated
    // already, but defense in depth.
    await git(["rev-parse", "--verify", "--end-of-options", `${sha}^`]);
    return `${sha}^`;
  } catch {
    return EMPTY_TREE_SHA;
  }
}

// Returns the requested shas ordered oldest -> newest. Falls back to
// `git rev-list --no-walk` for shas outside HEAD's recent log window so
// commits on sibling branches or deep history still resolve.
async function sortShasByHistory(shas) {
  const out = await git(["log", "--format=%H", "-n", "5000"]);
  const wantSet = new Set(shas);
  const lines = out.split("\n").filter(Boolean);
  const matchedNewestFirst = [];
  for (const full of lines) {
    if (wantSet.has(full)) {
      matchedNewestFirst.push(full);
      wantSet.delete(full);
      continue;
    }
    for (const w of [...wantSet]) {
      if (full.startsWith(w)) {
        matchedNewestFirst.push(full);
        wantSet.delete(w);
        break;
      }
    }
  }
  // Anything still in wantSet wasn't on HEAD's recent history. Try resolving
  // each via rev-list --no-walk so we can still place it in the output.
  for (const sha of [...wantSet]) {
    try {
      const resolved = (
        await git([
          "rev-list",
          "--no-walk",
          "--end-of-options",
          sha,
          "--",
        ])
      ).trim();
      if (resolved) matchedNewestFirst.push(resolved.split("\n")[0]);
    } catch {
      // Unresolvable; just drop it.
    }
  }
  // Re-sort by date so the final order is correct even with mixed sources.
  // Use git log --format=%H ${all} for a single-pass topo sort.
  if (matchedNewestFirst.length > 1) {
    try {
      const sortedOut = await git([
        "log",
        "--format=%H",
        "--no-walk",
        "--date-order",
        "--end-of-options",
        ...matchedNewestFirst,
        "--",
      ]);
      const sortedLines = sortedOut.split("\n").filter(Boolean);
      if (sortedLines.length === matchedNewestFirst.length) {
        return sortedLines.reverse(); // log is newest-first; we want oldest-first
      }
    } catch {
      // Fall through to the simpler reverse below.
    }
  }
  return matchedNewestFirst.reverse();
}

// Stop the server gracefully. Used by the Quit button in the UI so users
// without a terminal can shut it down. Token-protected to defeat CSRF.
app.post("/api/shutdown", (req, res) => {
  const token =
    req.headers["x-ireview-token"] || (req.body && req.body.token);
  if (token !== SHUTDOWN_TOKEN) {
    return res.status(403).json({ error: "invalid shutdown token" });
  }
  res.json({ ok: true, message: "iReview is shutting down" });
  console.log("Shutdown requested via /api/shutdown — exiting.");
  setTimeout(() => process.exit(0), 150);
});

app.get("/api/commits", async (req, res) => {
  const n = Math.min(Number(req.query.n || 50), 500);
  try {
    const FS = "\x1f";
    const RS = "\x1e";
    const fmt = ["%H", "%h", "%s", "%an", "%ad"].join(FS) + RS;
    const out = await git([
      "log",
      `--format=${fmt}`,
      "--date=iso-strict",
      "-n",
      String(n),
    ]);
    const records = out
      .split(RS)
      .map((r) => r.trim())
      .filter(Boolean);
    const commits = records.map((r) => {
      const [sha, shortSha, subject, author, date] = r.split(FS);
      return { sha, shortSha, subject, author, date };
    });
    res.json({ commits });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Frontend: prefer dist/ on disk (dev / build-from-source), fall back to
// embedded assets (compiled binary). The shutdown token is injected into the
// served HTML via a meta tag the frontend reads.
const distDir = path.resolve(__dirname, "..", "dist");
const haveEmbedded = Object.keys(embeddedAssets).length > 0;

function serveHtml(html, res) {
  // Inject (or replace) a meta tag carrying the per-boot shutdown token.
  const meta = `<meta name="ireview-shutdown-token" content="${SHUTDOWN_TOKEN}">`;
  const withToken = html.includes('name="ireview-shutdown-token"')
    ? html.replace(
        /<meta name="ireview-shutdown-token"[^>]*>/,
        meta,
      )
    : html.replace("</head>", `  ${meta}\n  </head>`);
  res.type("text/html; charset=utf-8").send(withToken);
}

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false }));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).end();
    const indexPath = path.join(distDir, "index.html");
    fs.readFile(indexPath, "utf8", (err, html) => {
      if (err) return res.status(500).send("frontend not found");
      serveHtml(html, res);
    });
  });
} else if (haveEmbedded) {
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    if (req.path === "/" || req.path === "/index.html") return next();
    const asset = embeddedAssets[req.path];
    if (!asset) return next();
    res.type(asset.type).send(Buffer.from(asset.b64, "base64"));
  });
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).end();
    const html = embeddedAssets["/index.html"];
    if (!html) return res.status(404).send("frontend not found");
    const decoded = Buffer.from(html.b64, "base64").toString("utf8");
    serveHtml(decoded, res);
  });
}

const server = app.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`iReview ready -> ${url}`);
  if (fs.existsSync(path.join(REPO, ".git"))) {
    console.log(`Reviewing repo: ${REPO}`);
    if (!REPO_EXPLICIT && REPO !== REPO_INITIAL) {
      console.log(`(walked up from: ${REPO_INITIAL})`);
    }
  } else {
    console.log(
      `No git repo found at ${REPO_INITIAL}. Re-run with: ireview /path/to/your/repo`,
    );
  }
  if (argOpen) {
    openBrowser(url);
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Try: ireview --port ${PORT + 1}`,
    );
    process.exit(1);
  }
  throw err;
});

function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    // ignore — user can open the URL manually
  }
}
