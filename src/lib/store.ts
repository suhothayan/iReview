import { create } from "zustand";
import type { Comment, CommentType, DiffFile } from "../types";

export interface Selection {
  shas: string[];
  staged: boolean;
  unstaged: boolean;
}

export type ViewMode = "single" | "scroll";

interface PersistedSlice {
  comments: Comment[];
  reviewed: Record<string, boolean>;
}

interface State {
  // session
  repoPath: string;
  // The repo for which `comments` and `reviewed` were last hydrated. Persisting
  // is gated on this matching `repoPath` so we never accidentally write the
  // current state under an old repo's key when switching repos, and never
  // write a default slice over a real persisted slice during boot.
  hydratedRepo: string;
  selection: Selection;
  hasStaged: boolean;
  hasUnstaged: boolean;
  // Tracked-modified-only — `hasUnstaged` minus the untracked contribution.
  // Picker uses it to write an honest subtitle for the Unstaged row.
  hasModified: boolean;
  // Working-tree paths that git doesn't yet track. Used by the file list to
  // render them with a "U" badge rather than the "A" added badge.
  untrackedFiles: string[];
  files: DiffFile[];
  loading: boolean;
  error: string | null;
  showCommitPicker: boolean;
  viewMode: ViewMode;
  sidebarOpen: boolean;

  // ui
  activeFile: string | null;

  // persisted per-session
  comments: Comment[];
  reviewed: Record<string, boolean>;

  // actions
  setRepo: (info: {
    repoPath: string;
    hasStaged: boolean;
    hasUnstaged: boolean;
    hasModified: boolean;
    untrackedFiles: string[];
  }) => void;
  setFiles: (files: DiffFile[]) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setActiveFile: (f: string | null) => void;
  setSelection: (s: Selection) => void;
  setShowCommitPicker: (v: boolean) => void;
  setViewMode: (v: ViewMode) => void;
  setSidebarOpen: (v: boolean) => void;

  // Hydrate persisted slice for the given repo. Called once after fetchRepo.
  // After this returns, subsequent state changes get auto-persisted.
  hydrateSession: (repo: string) => void;

  addComment: (c: Omit<Comment, "id" | "createdAt">) => void;
  updateComment: (id: string, body: string, type: CommentType) => void;
  deleteComment: (id: string) => void;

  toggleReviewed: (file: string) => void;
  setFilesReviewed: (files: string[], reviewed: boolean) => void;
  clearAll: () => void;
}

const sessionKey = (repo: string) => `ireview:session:${repo}`;

function loadSession(repo: string): PersistedSlice | null {
  try {
    const raw = localStorage.getItem(sessionKey(repo));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.comments) &&
      parsed.reviewed &&
      typeof parsed.reviewed === "object"
    ) {
      return { comments: parsed.comments, reviewed: parsed.reviewed };
    }
    return null;
  } catch {
    return null;
  }
}

let lastSaveErrorReported = false;
function saveSession(
  repo: string,
  slice: PersistedSlice,
  reportError: (msg: string) => void,
): void {
  try {
    localStorage.setItem(sessionKey(repo), JSON.stringify(slice));
  } catch (err) {
    if (!lastSaveErrorReported) {
      lastSaveErrorReported = true;
      const reason =
        err instanceof Error ? err.message : "localStorage write failed";
      reportError(
        `Could not save your review session (${reason}). Comments may not persist between reloads.`,
      );
    }
  }
}

export const useStore = create<State>()((set, get) => ({
  repoPath: "",
  hydratedRepo: "",
  // Empty until App boot fills in real defaults from /api/repo.
  selection: { shas: [], staged: false, unstaged: false },
  hasStaged: false,
  hasUnstaged: false,
  hasModified: false,
  untrackedFiles: [],
  files: [],
  loading: false,
  error: null,
  showCommitPicker: false,
  viewMode: "single",
  sidebarOpen: false,
  activeFile: null,
  comments: [],
  reviewed: {},

  setRepo: ({ repoPath, hasStaged, hasUnstaged, hasModified, untrackedFiles }) =>
    set({ repoPath, hasStaged, hasUnstaged, hasModified, untrackedFiles }),
  setFiles: (files) =>
    set({
      files,
      activeFile: files.length > 0 ? files[0].path : null,
    }),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
  setActiveFile: (f) => set({ activeFile: f }),
  setSelection: (s) => set({ selection: s }),
  setShowCommitPicker: (v) => set({ showCommitPicker: v }),
  setViewMode: (v) => set({ viewMode: v }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),

  hydrateSession: (repo) => {
    const slice = loadSession(repo);
    set({
      comments: slice?.comments ?? [],
      reviewed: slice?.reviewed ?? {},
      hydratedRepo: repo,
    });
  },

  addComment: (c) =>
    set((s) => ({
      comments: [
        ...s.comments,
        { ...c, id: cryptoRandomId(), createdAt: Date.now() },
      ],
    })),
  updateComment: (id, body, type) =>
    set((s) => ({
      comments: s.comments.map((c) =>
        c.id === id ? { ...c, body, type } : c,
      ),
    })),
  deleteComment: (id) =>
    set((s) => ({ comments: s.comments.filter((c) => c.id !== id) })),

  toggleReviewed: (file) =>
    set((s) => ({ reviewed: { ...s.reviewed, [file]: !s.reviewed[file] } })),

  setFilesReviewed: (paths, reviewed) =>
    set((s) => {
      const next = { ...s.reviewed };
      for (const p of paths) {
        if (reviewed) next[p] = true;
        else delete next[p];
      }
      return { reviewed: next };
    }),

  clearAll: () =>
    set({
      comments: [],
      reviewed: {},
      selection: { shas: [], staged: false, unstaged: false },
    }),
}));

// Persist comments + reviewed to the per-repo key — only after hydration has
// completed for the same repo. This guarantees we never write a default slice
// over a real persisted slice during boot, and never cross-contaminate between
// repos when switching.
let lastSaved: { repo: string; comments: Comment[]; reviewed: Record<string, boolean> } | null = null;
useStore.subscribe((state) => {
  if (!state.repoPath || state.hydratedRepo !== state.repoPath) return;
  // Skip writes when nothing relevant changed.
  if (
    lastSaved &&
    lastSaved.repo === state.repoPath &&
    lastSaved.comments === state.comments &&
    lastSaved.reviewed === state.reviewed
  ) {
    return;
  }
  saveSession(
    state.repoPath,
    { comments: state.comments, reviewed: state.reviewed },
    (msg) => useStore.getState().setError(msg),
  );
  lastSaved = {
    repo: state.repoPath,
    comments: state.comments,
    reviewed: state.reviewed,
  };
});

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
