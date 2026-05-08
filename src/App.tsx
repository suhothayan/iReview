import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "./lib/store";
import { fetchDiff, errorMessage } from "./lib/api";
import { parseDiff } from "./lib/parseDiff";
import { fileSectionId } from "./lib/dom";
import { useBootRepo } from "./hooks/useBootRepo";
import { useScrollSpy } from "./hooks/useScrollSpy";
import { useFileNavigation } from "./hooks/useFileNavigation";
import { Toolbar } from "./components/Toolbar";
import { DiffView } from "./components/DiffView";
import { CommitPicker } from "./components/CommitPicker";
import { NavBar } from "./components/NavBar";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { StoppedScreen } from "./components/StoppedScreen";
import { ResponsiveFileList } from "./components/ResponsiveFileList";

export default function App() {
  const repoPath = useStore((s) => s.repoPath);
  const files = useStore((s) => s.files);
  const setFiles = useStore((s) => s.setFiles);
  const selection = useStore((s) => s.selection);
  const setShowCommitPicker = useStore((s) => s.setShowCommitPicker);
  const setLoading = useStore((s) => s.setLoading);
  const setError = useStore((s) => s.setError);
  const error = useStore((s) => s.error);
  const loading = useStore((s) => s.loading);
  const showCommitPicker = useStore((s) => s.showCommitPicker);
  const viewMode = useStore((s) => s.viewMode);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [quitted, setQuitted] = useState(false);

  const { bootDone, noRepo, meta } = useBootRepo();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const text = await fetchDiff(selection);
      setFiles(parseDiff(text));
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [selection, setLoading, setError, setFiles]);

  // Reload diff whenever selection changes (after boot).
  useEffect(() => {
    if (!bootDone) return;
    void reload();
  }, [bootDone, selection, reload]);

  const { active, activeIdx, goPrev, goNext } = useFileNavigation(
    files,
    scrollContainerRef,
  );
  const { goToFile } = useScrollSpy(
    scrollContainerRef,
    files,
    viewMode === "scroll" && !showCommitPicker,
  );

  if (quitted) return <StoppedScreen />;
  if (noRepo) return <WelcomeScreen info={noRepo} />;

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
            title="Dismiss this notification"
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
            {!loading && files.length > 0 && viewMode === "single" && active && (
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
            )}
            {!loading && files.length > 0 && viewMode === "scroll" && (
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
            )}
            {!loading && files.length === 0 && !error && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
                <div className="text-fg-muted text-sm">No changes to review.</div>
                <button
                  onClick={() => setShowCommitPicker(true)}
                  className="px-5 py-2 rounded-md bg-accent text-accent-on font-medium hover:opacity-90 inline-flex items-center gap-2 shadow-sm"
                  title="Open the picker to choose commits / staged / unstaged changes"
                >
                  <span aria-hidden className="text-base leading-none">⊕</span>
                  <span>Pick changes</span>
                </button>
                <div className="text-xs text-fg-dim text-center max-w-md">
                  Pick recent commits, or make some uncommitted edits in{" "}
                  <code className="text-fg-muted">{repoPath}</code>.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
