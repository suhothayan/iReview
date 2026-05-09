import express from "express";
import cors from "cors";
import { execFile, spawn } from "node:child_process";
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
//   ireview                 -> review cwd
//   ireview /path/to/repo   -> review that repo
//   ireview --port 4000     -> override port
//   ireview --no-open       -> don't auto-open browser
//   ireview --help          -> usage
const argv = process.argv.slice(2);
let argRepo = null;
let argPort = null;
let argOpen = true;
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

// Per-boot token. Required on POST /api/shutdown so a stray browser tab on a
// random localhost site can't kill the server via a forged request. Embedded
// into the served HTML so the legitimate frontend can read it.
const SHUTDOWN_TOKEN = crypto.randomBytes(16).toString("hex");

function printHelp() {
  console.log(`iReview — browser-based local diff review

Usage:
  ireview [REPO_PATH] [--port N] [--no-open]

Arguments:
  REPO_PATH       Path to a git repository (default: current directory)

Options:
  -p, --port N    Port to listen on (default: 3737)
      --no-open   Don't auto-open the browser
  -v, --version   Show version
  -h, --help      Show this help

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
    res.json({
      repo: REPO,
      branch,
      head,
      hasStaged: stagedNames.length > 0,
      hasUnstaged: unstagedNames.length > 0,
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
    res.type("text/plain").send(diff);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

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
