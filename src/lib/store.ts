import { create } from "zustand";
import type { Comment, CommentType, DiffFile } from "../types";

export interface Selection {
  shas: string[];
  staged: boolean;
  unstaged: boolean;
}

export type ViewMode = "single" | "scroll";

// Subset of state that is persisted per repo.
interface PersistedSlice {
  comments: Comment[];
  reviewed: Record<string, boolean>;
}

interface State {
  // session
  repoPath: string;
  selection: Selection;
  hasStaged: boolean;
  hasUnstaged: boolean;
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

function saveSession(repo: string, slice: PersistedSlice): void {
  try {
    localStorage.setItem(sessionKey(repo), JSON.stringify(slice));
  } catch {
    /* quota / private mode — silently drop */
  }
}

export const useStore = create<State>()((set, get) => ({
  repoPath: "",
  selection: { shas: [], staged: true, unstaged: true },
  hasStaged: false,
  hasUnstaged: false,
  files: [],
  loading: false,
  error: null,
  showCommitPicker: false,
  viewMode: "single",
  sidebarOpen: false,
  activeFile: null,
  comments: [],
  reviewed: {},

  setRepo: ({ repoPath, hasStaged, hasUnstaged }) =>
    set({ repoPath, hasStaged, hasUnstaged }),
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
    if (slice) {
      set({ comments: slice.comments, reviewed: slice.reviewed });
    } else {
      // Ensure clean slate if nothing exists for this repo.
      set({ comments: [], reviewed: {} });
    }
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

// Persist comments + reviewed to the per-repo key whenever they change.
// Wired here (instead of via persist middleware) so we can guarantee the repo
// key is known *before* any read happens.
let lastPersistedRepo = "";
useStore.subscribe((state) => {
  if (!state.repoPath) return;
  if (state.repoPath !== lastPersistedRepo) {
    lastPersistedRepo = state.repoPath;
    return; // first sub fires right after hydrate; don't overwrite
  }
  saveSession(state.repoPath, {
    comments: state.comments,
    reviewed: state.reviewed,
  });
});

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
