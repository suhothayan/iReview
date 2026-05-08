export interface RepoInfo {
  repo: string;
  branch: string;
  head: string;
  hasStaged: boolean;
  hasUnstaged: boolean;
}

export interface NoRepoInfo {
  kind: "no_repo";
  repo: string;
  startedFrom: string;
  explicit: boolean;
  error: string;
}

export class NoRepoError extends Error {
  info: NoRepoInfo;
  constructor(info: NoRepoInfo) {
    super(info.error);
    this.info = info;
  }
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  subject: string;
  author: string;
  date: string;
}

export interface Selection {
  shas: string[];
  staged: boolean;
  unstaged: boolean;
}

// Reads the per-boot shutdown token the server injects as a <meta> tag in
// the served HTML. Used to authenticate POST /api/shutdown so a stray
// localhost site can't kill the server via CSRF.
export function getShutdownToken(): string {
  if (typeof document === "undefined") return "";
  const m = document.querySelector('meta[name="ireview-shutdown-token"]');
  return m?.getAttribute("content") ?? "";
}

// Pulls a human-readable message out of an unknown thrown value.
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export async function fetchRepo(): Promise<RepoInfo> {
  const r = await fetch("/api/repo");
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    if (body && body.kind === "no_repo") {
      throw new NoRepoError(body as NoRepoInfo);
    }
    throw new Error(body.error || `repo error (HTTP ${r.status})`);
  }
  return r.json();
}

export async function fetchDiff(sel: Selection): Promise<string> {
  const params = new URLSearchParams();
  if (sel.shas.length) params.set("shas", sel.shas.join(","));
  if (sel.staged) params.set("staged", "1");
  if (sel.unstaged) params.set("unstaged", "1");
  const r = await fetch(`/api/diff?${params.toString()}`);
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || `diff failed (HTTP ${r.status})`);
  }
  return r.text();
}

export async function fetchCommits(n = 50): Promise<CommitInfo[]> {
  const r = await fetch(`/api/commits?n=${n}`);
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || `commits failed (HTTP ${r.status})`);
  }
  const j = await r.json();
  return j.commits;
}

// Asks the server to exit. Resolves once the response is received; the actual
// process exit happens ~150ms later, server-side.
export async function shutdownServer(): Promise<void> {
  await fetch("/api/shutdown", {
    method: "POST",
    headers: { "X-iReview-Token": getShutdownToken() },
  });
}
