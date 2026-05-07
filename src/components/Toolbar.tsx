import { useStore } from "../lib/store";
import { exportReview } from "../lib/exportMarkdown";
import { shutdownServer } from "../lib/api";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

interface Props {
  repoBranch: string | null;
  repoHead: string | null;
  onReload: () => void;
  onCopied?: (commentCount: number) => void;
  onQuit?: () => void;
}

export function Toolbar({
  repoBranch,
  repoHead,
  onReload,
  onCopied,
  onQuit,
}: Props) {
  const {
    comments,
    clearAll,
    showCommitPicker,
    setShowCommitPicker,
    repoPath,
    viewMode,
    setViewMode,
    sidebarOpen,
    setSidebarOpen,
    files,
  } = useStore();
  const [copied, setCopied] = useState(false);
  const repoName = repoPath ? repoPath.split("/").pop() || repoPath : "";

  async function copyReview() {
    const md = exportReview(comments);
    if (!md) {
      alert("No comments to export yet.");
      return;
    }
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onCopied?.(comments.length);
  }

  return (
    <header className="stage-toolbar flex flex-wrap items-center gap-x-2 gap-y-2 px-3 sm:px-4 py-2 border-b border-bg-line z-20">
      {/* Files toggle (mobile only) — opens the sidebar drawer */}
      {!showCommitPicker && files.length > 0 && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="md:hidden text-sm w-8 h-7 rounded border border-bg-line bg-bg-line hover:bg-bg-elev text-fg inline-flex items-center justify-center"
          title="Show file list"
          aria-label="Toggle file list"
        >
          ☰
        </button>
      )}

      {/* Group: identity */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <Logo />
          <span className="font-semibold text-accent">iReview</span>
        </div>
        {repoName && (
          <div className="flex items-center gap-2 min-w-0" title={repoPath}>
            <span className="text-sm font-medium text-fg truncate max-w-[10rem] sm:max-w-none">
              {repoName}
            </span>
            {repoBranch && (
              <span
                className="hidden md:inline-block text-xs px-2 py-0.5 rounded bg-bg-line text-fg font-mono whitespace-nowrap max-w-[14rem] truncate"
                title={`Currently checked-out branch: ${repoBranch}`}
              >
                ⎇ {repoBranch}
              </span>
            )}
            {repoHead && (
              <span
                className="hidden lg:inline text-xs text-fg-dim font-mono whitespace-nowrap"
                title="HEAD commit (current tip of the checked-out branch)"
              >
                @ {repoHead}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right cluster: stays right-anchored. When the toolbar wraps, this whole
          group flows to its own row(s) but `ml-auto` + `justify-end` keep it
          pinned to the right edge instead of left-aligning by default. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 ml-auto justify-end">

      {/* Group: status — chips showing what's currently selected. Hidden while
          the picker is open since the picker itself shows the live draft. Also
          hidden on small viewports where toolbar real estate is precious. */}
      {!showCommitPicker && (
        <>
          <div className="hidden md:flex items-center gap-2">
            <SelectionChips />
          </div>
          <Divider className="hidden md:block" />
        </>
      )}

      {/* Group: scope (which changes to review) */}
      <button
        onClick={() => setShowCommitPicker(!showCommitPicker)}
        className={`text-xs px-2.5 py-1 rounded border inline-flex items-center gap-1 ${
          showCommitPicker
            ? "bg-accent text-accent-on border-accent"
            : "bg-bg-line border-bg-line text-fg hover:bg-bg-elev"
        }`}
        title="Pick which commits / staged / unstaged changes to review"
      >
        <span aria-hidden>{showCommitPicker ? "←" : "⊕"}</span>
        <span>{showCommitPicker ? "Back to diff" : "Pick changes"}</span>
      </button>

      {!showCommitPicker && (
        <>
          <Divider className="hidden sm:block" />

          {/* Group: view mode (only relevant when actually reviewing) */}
          <SegmentedControl
            value={viewMode}
            onChange={(v) => setViewMode(v as "single" | "scroll")}
            options={[
              {
                value: "single",
                label: "Single",
                icon: "▤",
                title: "One file at a time, with Next/Prev",
              },
              {
                value: "scroll",
                label: "Scroll",
                icon: "≡",
                title: "All files in one scroll (GitHub-style)",
              },
            ]}
          />

          <IconButton
            icon="↻"
            title="Reload diff from disk"
            onClick={onReload}
            className="hidden sm:inline-flex"
          />
        </>
      )}

      <Divider />

      {/* Group: review export — primary action */}
      <button
        onClick={copyReview}
        className="text-xs px-3 py-1 rounded bg-accent text-accent-on font-medium hover:opacity-90 inline-flex items-center gap-1.5"
        title="Copy structured Markdown review to clipboard"
      >
        <span aria-hidden className="text-base leading-none -mt-0.5">
          ⎘
        </span>
        {copied ? "Copied!" : `Copy review (${comments.length})`}
      </button>

      <Divider className="hidden sm:block" />

      {/* Group: settings */}
      <ThemeToggle />
      <IconButton
        icon="✕"
        title="Clear comments, reviewed flags, and selection"
        onClick={() => {
          if (
            confirm(
              "Clear all comments, reviewed flags, and the current selection?",
            )
          ) {
            clearAll();
            setShowCommitPicker(true);
          }
        }}
        danger
        className="hidden sm:inline-flex"
      />
      <IconButton
        icon="⏻"
        title="Stop iReview server (close the app)"
        onClick={async () => {
          if (
            !confirm(
              "Stop iReview? You'll lose this session — but your comments and reviewed flags are saved per-repo and will come back next time.",
            )
          )
            return;
          try {
            await shutdownServer();
          } catch {
            // The server may exit before the response makes it back — that's
            // expected. Either way, signal "quit" to the app.
          }
          onQuit?.();
        }}
        danger
      />
      </div>
    </header>
  );
}

function Divider({ className = "" }: { className?: string }) {
  return <div className={`h-6 w-px bg-bg-line mx-1 ${className}`} />;
}

function IconButton({
  icon,
  title,
  onClick,
  danger,
  className = "",
}: {
  icon: string;
  title: string;
  onClick: () => void;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`text-sm w-8 h-7 rounded border border-bg-line bg-bg-line hover:bg-bg-elev inline-flex items-center justify-center ${
        danger ? "text-fg-muted hover:text-red-500" : "text-fg"
      } ${className}`}
    >
      {icon}
    </button>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon: string; title: string }[];
}) {
  return (
    <div className="flex border border-bg-line rounded overflow-hidden text-xs">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            title={o.title}
            className={`px-2 py-1 inline-flex items-center gap-1 ${
              active
                ? "bg-accent text-accent-on font-medium"
                : "bg-bg-line text-fg hover:bg-bg-elev"
            }`}
          >
            <span aria-hidden>{o.icon}</span>
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SelectionChips() {
  const { selection, setShowCommitPicker } = useStore();

  const chips: { key: string; label: string; tone: "commit" | "stage" | "unstage" }[] = [];
  if (selection.shas.length > 0) {
    chips.push({
      key: "commits",
      label: `${selection.shas.length} commit${selection.shas.length === 1 ? "" : "s"}`,
      tone: "commit",
    });
  }
  if (selection.unstaged)
    chips.push({ key: "unstaged", label: "unstaged", tone: "unstage" });
  if (selection.staged)
    chips.push({ key: "staged", label: "staged", tone: "stage" });

  if (chips.length === 0) {
    return (
      <button
        onClick={() => setShowCommitPicker(true)}
        className="text-xs px-2.5 py-1 rounded border border-dashed border-bg-line text-fg-dim hover:text-fg hover:border-fg-muted"
        title="Click to pick changes"
      >
        Nothing selected — click to pick
      </button>
    );
  }

  const tones: Record<string, string> = {
    commit:
      "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-800",
    unstage:
      "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-800",
    stage:
      "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-800",
  };

  return (
    <button
      onClick={() => setShowCommitPicker(true)}
      title="Click to change selection"
      className="flex items-center gap-1.5 group"
    >
      <span className="text-xs text-fg-muted">Reviewing</span>
      {chips.map((c) => (
        <span
          key={c.key}
          className={`text-xs px-2 py-0.5 rounded-full border font-medium ${tones[c.tone]}`}
        >
          {c.label}
        </span>
      ))}
    </button>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof document === "undefined") return "dark";
    const saved = localStorage.getItem("ireview:theme") as
      | "light"
      | "dark"
      | null;
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("ireview:theme", theme);
  }, [theme]);
  return (
    <button
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      className="text-sm w-8 h-7 rounded border border-bg-line bg-bg-line hover:bg-bg-elev text-fg inline-flex items-center justify-center"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
