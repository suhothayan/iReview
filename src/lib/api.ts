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

export async function fetchRepo(): Promise<RepoInfo> {
  const r = await fetch("/api/repo");
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    if (body && body.kind === "no_repo") {
      throw new NoRepoError(body as NoRepoInfo);
    }
    throw new Error(body.error || "repo error");
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
    throw new Error(j.error || `diff failed (${r.status})`);
  }
  return r.text();
}

export async function fetchCommits(n = 50): Promise<CommitInfo[]> {
  const r = await fetch(`/api/commits?n=${n}`);
  if (!r.ok) throw new Error((await r.json()).error || "commits error");
  const j = await r.json();
  return j.commits;
}
