import express from "express";
import cors from "cors";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { embeddedAssets } from "./embedded-assets.js";

const execFileP = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    console.log("iReview v0.1");
    process.exit(0);
  } else if (!a.startsWith("-")) {
    argRepo = a;
  }
}

const PORT = argPort ?? Number(process.env.PORT || 3737);

// Resolve the repo. If the user passed an explicit path (or env var), use it
// as-is — they meant that path. If we're falling back to cwd, walk up parent
// directories looking for a .git so that running from any subdirectory of a
// repo just works (matches git's own behavior).
const REPO_EXPLICIT = !!(argRepo || process.env.IREVIEW_REPO);
const REPO_INITIAL = path.resolve(
  argRepo || process.env.IREVIEW_REPO || process.cwd(),
);
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
app.use(cors());
app.use(express.json({ limit: "10mb" }));

async function git(args) {
  const { stdout } = await execFileP("git", args, {
    cwd: REPO,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
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
      if (!/^[A-Za-z0-9._\/\-~^]+(\.{2,3}[A-Za-z0-9._\/\-~^]+)?$/.test(range)) {
        return res.status(400).json({
          error:
            "invalid range: must be a refspec like 'A..B' or 'A...B' (no flags allowed)",
        });
      }
      args = ["diff", "--no-color", "--unified=3", range, "--"];
    } else {
      const shas = shasParam.split(",").map((s) => s.trim()).filter(Boolean);
      let base = "HEAD";
      let oldest = null;
      let newest = null;
      if (shas.length > 0) {
        const sorted = await sortShasByHistory(shas);
        if (sorted.length === 0)
          return res.status(400).json({ error: "no valid commits found" });
        oldest = sorted[0];
        newest = sorted[sorted.length - 1];
        base = `${oldest}^`;
      }

      if (includeUnstaged) {
        args = ["diff", "--no-color", "--unified=3", base];
      } else if (includeStaged) {
        args = ["diff", "--cached", "--no-color", "--unified=3", base];
      } else if (newest) {
        args = ["diff", "--no-color", "--unified=3", `${base}..${newest}`];
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

async function sortShasByHistory(shas) {
  const out = await git(["log", "--format=%H", "-n", "5000"]);
  const wantSet = new Set(shas);
  const lines = out.split("\n").filter(Boolean);
  const matchedNewestFirst = [];
  for (const full of lines) {
    if (wantSet.has(full)) {
      matchedNewestFirst.push(full);
      continue;
    }
    for (const w of wantSet) {
      if (full.startsWith(w)) {
        matchedNewestFirst.push(full);
        break;
      }
    }
  }
  return matchedNewestFirst.reverse();
}

// Stop the server gracefully. Used by the Quit button in the UI so users
// without a terminal can shut it down.
app.post("/api/shutdown", (_req, res) => {
  res.json({ ok: true, message: "iReview is shutting down" });
  console.log("Shutdown requested via /api/shutdown — exiting.");
  // Give the response a moment to flush before exiting.
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
// embedded assets (compiled binary).
const distDir = path.resolve(__dirname, "..", "dist");
const haveEmbedded = Object.keys(embeddedAssets).length > 0;

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
} else if (haveEmbedded) {
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    const key = req.path === "/" ? "/index.html" : req.path;
    const asset = embeddedAssets[key];
    if (!asset) return next();
    res.type(asset.type).send(Buffer.from(asset.b64, "base64"));
  });
  // SPA fallback
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).end();
    const html = embeddedAssets["/index.html"];
    if (!html) return res.status(404).send("frontend not found");
    res.type(html.type).send(Buffer.from(html.b64, "base64"));
  });
}

const server = app.listen(PORT, () => {
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
