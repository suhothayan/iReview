import { useEffect, useCallback, useRef, useState } from "react";
import { useStore } from "./lib/store";
import { fetchDiff, fetchRepo, NoRepoError, type NoRepoInfo } from "./lib/api";
import { parseDiff } from "./lib/parseDiff";
import { fileSectionId } from "./lib/dom";
import { Toolbar } from "./components/Toolbar";
import { FileList } from "./components/FileList";
import { DiffView } from "./components/DiffView";
import { CommitPicker } from "./components/CommitPicker";
import { Logo } from "./components/Logo";

export default function App() {
  const {
    repoPath,
    setRepo,
    setSelection,
    setShowCommitPicker,
    setActiveFile,
    files,
    setFiles,
    activeFile,
    selection,
    setLoading,
    setError,
    error,
    loading,
    showCommitPicker,
    viewMode,
  } = useStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Suppresses the scroll-driven active-file observer briefly after a click in the
  // sidebar, so the sidebar highlight doesn't bounce through intermediate files
  // during the smooth-scroll animation.
  const programmaticScrollUntilRef = useRef(0);
  const [toast, setToast] = useState<string | null>(null);
  const [noRepo, setNoRepo] = useState<NoRepoInfo | null>(null);
  const [quitted, setQuitted] = useState(false);
  const [meta, setMeta] = useState<{ branch: string | null; head: string | null }>({
    branch: null,
    head: null,
  });

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const text = await fetchDiff(selection);
      const parsed = parseDiff(text);
      setFiles(parsed);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [selection, setLoading, setError, setFiles]);

  const [bootDone, setBootDone] = useState(false);

  // Boot: fetch repo info, rehydrate persisted state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await fetchRepo();
        if (cancelled) return;
        setNoRepo(null);
        setRepo({
          repoPath: info.repo,
          hasStaged: info.hasStaged,
          hasUnstaged: info.hasUnstaged,
        });
        setMeta({ branch: info.branch, head: info.head });
        // Hydrate per-repo session BEFORE setting selection/UI defaults so persisted
        // comments and reviewed flags aren't briefly empty.
        useStore.getState().hydrateSession(info.repo);
        // Sensible default: select whatever uncommitted state actually exists.
        // If nothing exists, leave selection empty and pop the picker.
        setSelection({
          shas: [],
          staged: info.hasStaged,
          unstaged: info.hasUnstaged,
        });
        if (!info.hasStaged && !info.hasUnstaged) {
          setShowCommitPicker(true);
        }
        if (!cancelled) setBootDone(true);
      } catch (err: any) {
        if (cancelled) return;
        if (err instanceof NoRepoError) {
          setNoRepo(err.info);
          setError(null);
        } else {
          setError(err.message || String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload diff whenever selection changes (after boot).
  useEffect(() => {
    if (!bootDone) return;
    void reload();
  }, [bootDone, selection, reload]);

  const activeIdx = files.findIndex((f) => f.path === activeFile);
  const active = activeIdx >= 0 ? files[activeIdx] : null;

  const goPrev = useCallback(() => {
    if (files.length === 0) return;
    const idx = activeIdx <= 0 ? files.length - 1 : activeIdx - 1;
    setActiveFile(files[idx].path);
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [files, activeIdx, setActiveFile]);

  const goNext = useCallback(() => {
    if (files.length === 0) return;
    const idx = activeIdx < 0 || activeIdx >= files.length - 1 ? 0 : activeIdx + 1;
    setActiveFile(files[idx].path);
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [files, activeIdx, setActiveFile]);

  // In scroll mode, drive activeFile from current scroll position.
  // Whichever file section is anchored near the top of the scroll container becomes active.
  useEffect(() => {
    if (viewMode !== "scroll") return;
    const container = scrollContainerRef.current;
    if (!container) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      if (Date.now() < programmaticScrollUntilRef.current) return;
      const containerTop = container.getBoundingClientRect().top;
      // Trigger zone: ~80px below the top of the scroll area. Pick the file whose
      // top is the most-recently-passed (greatest top <= zone, closest to it).
      const zone = containerTop + 80;
      let best: { path: string; top: number } | null = null;
      for (const f of files) {
        const el = document.getElementById(fileSectionId(f.path));
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= zone) {
          if (!best || top > best.top) best = { path: f.path, top };
        }
      }
      if (!best && files.length > 0) {
        // Above the first section (e.g. at very top of container).
        best = { path: files[0].path, top: 0 };
      }
      if (best && best.path !== activeFile) setActiveFile(best.path);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    update(); // initial sync
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [viewMode, files, activeFile, setActiveFile]);

  // Click-to-scroll handler used by the sidebar in scroll mode.
  const goToFile = useCallback(
    (path: string) => {
      setActiveFile(path);
      if (viewMode !== "scroll") return;
      const el = document.getElementById(fileSectionId(path));
      const container = scrollContainerRef.current;
      if (!el || !container) return;
      // Lock the scroll-position observer for ~700ms so the sidebar highlight
      // sticks to the clicked target during the smooth-scroll animation.
      programmaticScrollUntilRef.current = Date.now() + 700;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [setActiveFile, viewMode],
  );

  if (quitted) {
    return <StoppedScreen />;
  }
  if (noRepo) {
    return <WelcomeScreen info={noRepo} />;
  }

  return (
    <div className="flex flex-col h-screen">
      <Toolbar
        repoBranch={meta.branch}
        repoHead={meta.head}
        onReload={reload}
        onCopied={(count) =>
          setToast(
            `${count} comment${count === 1 ? "" : "s"} copied to clipboard — paste into your agent's chat to apply.`,
          )
        }
        onQuit={() => setQuitted(true)}
      />
      {toast && (
        <div className="px-4 py-2 bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-100 border-b border-green-300 dark:border-green-800 text-sm flex items-center gap-3">
          <span aria-hidden>✓</span>
          <span className="flex-1">{toast}</span>
          <button
            onClick={() => setToast(null)}
            className="text-xs px-2 py-0.5 rounded hover:bg-green-200 dark:hover:bg-green-900/60"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      {error && (
        <div className="bg-red-900/40 text-red-200 text-sm px-4 py-2 border-b border-red-800">
          {error}
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {showCommitPicker ? (
          <CommitPicker />
        ) : (
          <>
            {files.length > 0 && <ResponsiveFileList goToFile={goToFile} />}
            {loading && (
              <div className="flex-1 flex items-center justify-center text-fg-muted">
                Loading diff…
              </div>
            )}
            {!loading && files.length > 0 && viewMode === "single" && active ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <NavBar
                  position={activeIdx + 1}
                  total={files.length}
                  onPrev={goPrev}
                  onNext={goNext}
                  variant="top"
                />
                <DiffView key={active.path} file={active} />
                <NavBar
                  position={activeIdx + 1}
                  total={files.length}
                  onPrev={goPrev}
                  onNext={goNext}
                  variant="bottom"
                />
              </div>
            ) : null}
            {!loading && files.length > 0 && viewMode === "scroll" ? (
              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto bg-bg"
              >
                {files.map((f) => (
                  <div key={f.path} id={fileSectionId(f.path)}>
                    <DiffView file={f} embedded />
                  </div>
                ))}
                <div className="text-center text-fg-dim text-xs py-6">
                  — end of {files.length} file{files.length === 1 ? "" : "s"} —
                </div>
              </div>
            ) : null}
            {!loading && files.length === 0 && !error ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
                <div className="text-fg-muted text-sm">No changes to review.</div>
                <button
                  onClick={() => setShowCommitPicker(true)}
                  className="px-5 py-2 rounded-md bg-accent text-accent-on font-medium hover:opacity-90 inline-flex items-center gap-2 shadow-sm"
                >
                  <span aria-hidden className="text-base leading-none">⊕</span>
                  <span>Pick changes</span>
                </button>
                <div className="text-xs text-fg-dim text-center max-w-md">
                  Pick recent commits, or make some uncommitted edits in{" "}
                  <code className="text-fg-muted">{repoPath}</code>.
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function NavBar({
  position,
  total,
  onPrev,
  onNext,
  variant,
}: {
  position: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  variant: "top" | "bottom";
}) {
  const borderCls =
    variant === "top" ? "border-b border-bg-line" : "border-t border-bg-line";
  return (
    <div
      className={`h-10 flex items-center gap-3 px-4 ${borderCls} bg-bg-elev shrink-0`}
    >
      <button
        onClick={onPrev}
        className="text-xs px-3 py-1 rounded border border-fg-muted/40 bg-transparent text-fg-muted hover:text-fg hover:border-fg-muted hover:bg-bg inline-flex items-center gap-1"
        title="Previous file"
      >
        <span aria-hidden>←</span>
        <span className="hidden sm:inline">Previous</span>
      </button>
      <div className="text-xs text-fg-muted">
        <span className="hidden sm:inline">File {position} of {total}</span>
        <span className="sm:hidden">{position}/{total}</span>
      </div>
      <div className="flex-1" />
      <button
        onClick={onNext}
        className="text-xs px-3 py-1 rounded bg-accent text-accent-on font-medium hover:opacity-90 inline-flex items-center gap-1 shadow-sm"
        title="Next file"
      >
        <span className="hidden sm:inline">Next</span>
        <span aria-hidden>→</span>
      </button>
    </div>
  );
}

// FileList wrapper that renders inline at md+ and as an overlay drawer below.
function ResponsiveFileList({ goToFile }: { goToFile: (p: string) => void }) {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);

  return (
    <>
      {/* Inline column at md+ (always visible) */}
      <div className="hidden md:flex">
        <FileList
          onSelect={(p) => {
            goToFile(p);
          }}
        />
      </div>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-30 flex">
          <div className="flex">
            <FileList
              onSelect={(p) => {
                goToFile(p);
                setSidebarOpen(false);
              }}
            />
          </div>
          <div
            className="flex-1 bg-black/40"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close file list"
          />
        </div>
      )}
    </>
  );
}

function StoppedScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6">
      <div className="stage-card max-w-md w-full rounded-lg border border-bg-line p-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Logo className="w-7 h-7" />
          <div className="text-accent font-semibold text-lg">iReview</div>
        </div>
        <h1 className="text-fg text-xl font-medium mb-2">Stopped</h1>
        <p className="text-fg-muted text-sm">
          The iReview server has been shut down. You can safely close this tab.
        </p>
        <p className="text-fg-dim text-xs mt-4">
          Your comments and reviewed flags are saved per-repo and will be
          restored next time you launch <code>ireview</code> on the same
          repository.
        </p>
      </div>
    </div>
  );
}

function WelcomeScreen({ info }: { info: NoRepoInfo }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6">
      <div className="stage-card max-w-xl w-full rounded-lg border border-bg-line p-8">
        <div className="flex items-center gap-2 mb-1">
          <Logo className="w-7 h-7" />
          <div className="text-accent font-semibold text-lg">iReview</div>
        </div>
        <h1 className="text-fg text-xl font-medium mb-3">No git repository found</h1>
        <p className="text-fg-muted text-sm mb-6">
          iReview reviews diffs from a local git repo, but the path it was
          launched from doesn't contain a <code className="font-mono">.git</code>{" "}
          folder.
        </p>

        <div className="bg-bg-elev rounded p-3 mb-6 border border-bg-line">
          <div className="text-xs text-fg-dim uppercase tracking-wide mb-1">
            {info.explicit ? "You provided" : "Searched from"}
          </div>
          <code className="font-mono text-sm text-fg break-all">
            {info.startedFrom}
          </code>
          {!info.explicit && info.startedFrom !== info.repo && (
            <>
              <div className="text-xs text-fg-dim uppercase tracking-wide mt-3 mb-1">
                Walked up to
              </div>
              <code className="font-mono text-sm text-fg break-all">
                {info.repo}
              </code>
            </>
          )}
        </div>

        <div className="text-fg text-sm font-medium mb-2">To get started:</div>
        <ol className="text-sm text-fg-muted space-y-2 list-decimal pl-5 mb-6">
          <li>
            Quit iReview (close this tab and stop the binary).
          </li>
          <li>
            Re-launch it with the path to your repo:
            <pre className="mt-1 bg-bg-elev rounded p-2 font-mono text-xs text-fg overflow-x-auto border border-bg-line">
              ireview /path/to/your/repo
            </pre>
          </li>
        </ol>

        <div className="text-xs text-fg-dim border-t border-bg-line pt-4">
          Tip: if you launch it from inside any subdirectory of a git repo, it
          finds the repo root automatically — no path argument needed.
        </div>
      </div>
    </div>
  );
}
