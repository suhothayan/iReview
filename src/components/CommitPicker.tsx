import { useEffect, useState } from "react";
import {
  errorMessage,
  fetchCommits,
  fetchRepo,
  type CommitInfo,
} from "../lib/api";
import { useStore } from "../lib/store";
import { badgeTone, type SelectionKind } from "../lib/tones";
import { RotateCw } from "lucide-react";

type Row =
  | { kind: "unstaged" }
  | { kind: "staged" }
  | { kind: "commit"; commit: CommitInfo };

export function CommitPicker() {
  const {
    selection,
    setSelection,
    hasStaged,
    hasUnstaged,
    setShowCommitPicker,
    setRepo,
    repoPath,
  } = useStore();

  const [commits, setCommits] = useState<CommitInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Local draft so the user can adjust without triggering a diff fetch on every click.
  const [draft, setDraft] = useState(selection);

  useEffect(() => {
    setDraft(selection);
  }, [selection]);

  // Re-pull commits + repo info from the server. Updates uncommitted state
  // (hasStaged / hasUnstaged) and the commit list, so changes made on disk
  // since the picker mounted (new commits, fresh git add, etc.) show up.
  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const [info, fresh] = await Promise.all([fetchRepo(), fetchCommits(50)]);
      setRepo({
        repoPath: info.repo,
        hasStaged: info.hasStaged,
        hasUnstaged: info.hasUnstaged,
      });
      setCommits(fresh);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchCommits(50)
      .then((c) => {
        if (!cancelled) setCommits(c);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty =
    draft.staged !== selection.staged ||
    draft.unstaged !== selection.unstaged ||
    draft.shas.join(",") !== selection.shas.join(",");

  // Unified range pick across the picker's full ordered list — unstaged
  // (newest, top), staged, then commits[0..N].
  //   - row 0 = unstaged, row 1 = staged, row 2..N+1 = commits[0..N-1]
  //   - Click outside the current range → extend the nearer side to clicked.
  //   - Click an endpoint of the range → shrink by one from that side.
  //   - Click the sole anchor → deselect everything.
  //   - Click an interior row of a multi-row range → reset to clicked.
  function pickRow(rowIdx: number) {
    if (!commits) return;
    setDraft((d) => {
      const selected = collectSelectedRows(d, commits);

      if (selected.length === 0) {
        return rowRangeToDraft(rowIdx, rowIdx, commits, d);
      }

      const minIdx = selected[0];
      const maxIdx = selected[selected.length - 1];

      if (rowIdx < minIdx) return rowRangeToDraft(rowIdx, maxIdx, commits, d);
      if (rowIdx > maxIdx) return rowRangeToDraft(minIdx, rowIdx, commits, d);

      if (selected.length === 1) {
        return { ...d, unstaged: false, staged: false, shas: [] };
      }
      if (rowIdx === minIdx) {
        return rowRangeToDraft(minIdx + 1, maxIdx, commits, d);
      }
      if (rowIdx === maxIdx) {
        return rowRangeToDraft(minIdx, maxIdx - 1, commits, d);
      }
      // Interior click on a multi-row range → reset to clicked (calendar).
      return rowRangeToDraft(rowIdx, rowIdx, commits, d);
    });
  }

  // Build the unified row list: always show uncommitted entries first (even if empty,
  // so the user can see they're absent), then commits.
  const rows: Row[] = [{ kind: "unstaged" }, { kind: "staged" }];
  if (commits) for (const c of commits) rows.push({ kind: "commit", commit: c });

  const apply = () => {
    setSelection(draft);
    setShowCommitPicker(false);
  };
  const reset = () => setDraft(selection);

  const selectedCount =
    draft.shas.length + (draft.staged ? 1 : 0) + (draft.unstaged ? 1 : 0);

  const actions = (
    <Actions
      dirty={dirty}
      refreshing={refreshing}
      onApply={apply}
      onReset={reset}
      onRefresh={refresh}
    />
  );

  return (
    <div className="stage-picker flex-1 flex flex-col overflow-hidden">
      <div className="stage-picker-bar px-4 py-2.5 flex items-center gap-3 border-b border-bg-line">
        <div className="text-sm text-fg font-medium">
          Select changes to review
        </div>
        <div className="flex-1" />
        {actions}
      </div>
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-3 my-2 px-3 py-2 rounded bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 text-xs border border-red-300 dark:border-red-800">
            {error}
          </div>
        )}
        {!commits && !error && rows.length === 0 && (
          <div className="px-3 py-2 text-fg-muted text-xs">Loading…</div>
        )}
        {rows.length > 0 &&
          rows.map((row, i) => {
            if (row.kind === "unstaged") {
              return (
                <PickerRow
                  key="unstaged"
                  checked={draft.unstaged}
                  onToggle={() => pickRow(i)}
                  badge={<Badge kind="unstage">UNSTAGED</Badge>}
                  title="Unstaged changes"
                  subtitle={
                    hasUnstaged
                      ? "working tree vs index"
                      : "no unstaged work yet — future edits will show up here"
                  }
                />
              );
            }
            if (row.kind === "staged") {
              return (
                <PickerRow
                  key="staged"
                  checked={draft.staged}
                  onToggle={() => pickRow(i)}
                  badge={<Badge kind="stage">STAGED</Badge>}
                  title="Staged changes"
                  subtitle={
                    hasStaged
                      ? "index vs HEAD"
                      : "nothing staged yet — future git add work will show up here"
                  }
                />
              );
            }
            const c = row.commit;
            return (
              <PickerRow
                key={c.sha}
                checked={draft.shas.includes(c.sha)}
                onToggle={() => pickRow(i)}
                badge={
                  <code className="text-xs text-fg-muted font-mono">
                    {c.shortSha}
                  </code>
                }
                title={c.subject}
                subtitle={`${c.author} · ${formatDate(c.date)}`}
              />
            );
          })}
      </div>

      {/* Bottom action bar — mirrors the top so the user can apply without scrolling back up */}
      <div className="stage-picker-bar px-4 py-2.5 flex items-center gap-3 border-t border-bg-line">
        <div className="text-xs text-fg-muted">
          {selectedCount === 0
            ? "Nothing selected — pick at least one entry above."
            : `${selectedCount} selected`}
        </div>
        <div className="flex-1" />
        {actions}
      </div>
    </div>
  );
}

function Actions({
  dirty,
  refreshing,
  onApply,
  onReset,
  onRefresh,
}: {
  dirty: boolean;
  refreshing: boolean;
  onApply: () => void;
  onReset: () => void;
  onRefresh: () => void;
}) {
  return (
    <>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="text-xs px-2 py-1 rounded border border-bg-line text-fg-muted hover:text-fg hover:bg-bg-elev disabled:opacity-50 inline-flex items-center gap-1"
        title="Re-pull commits and uncommitted state from disk"
      >
        <RotateCw
          className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
          aria-hidden
        />
        <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
      </button>
      <button
        onClick={onReset}
        disabled={!dirty}
        className="text-xs px-2 py-1 rounded text-fg-muted hover:text-fg disabled:opacity-30"
        title="Discard your unsaved changes and revert to the last applied selection"
      >
        Reset
      </button>
      <button
        onClick={onApply}
        className="text-xs px-3 py-1 rounded bg-accent text-accent-on font-medium hover:opacity-90 shadow-sm"
        title={
          dirty
            ? "Apply this selection and load the diff"
            : "Close the picker (selection unchanged)"
        }
      >
        {dirty ? "Apply" : "Done"}
      </button>
    </>
  );
}

function PickerRow({
  checked,
  onToggle,
  badge,
  title,
  subtitle,
}: {
  checked: boolean;
  onToggle: () => void;
  badge: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <label
      className={`relative flex items-center gap-3 pl-4 pr-4 py-2 border-b border-bg-line/50 transition-colors cursor-pointer hover:bg-bg-elev ${
        checked ? "is-selected" : ""
      }`}
    >
      {checked && (
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent"
        />
      )}
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="accent-accent"
      />
      <div className="w-20 shrink-0 flex items-center justify-start">{badge}</div>
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm truncate ${
            checked ? "text-fg font-medium" : "text-fg"
          }`}
          title={title}
        >
          {title}
        </div>
        <div className="text-xs text-fg-muted truncate italic">{subtitle}</div>
      </div>
    </label>
  );
}

// Map the current draft selection onto its row indices in the unified picker
// list (row 0 = unstaged, row 1 = staged, row 2..N+1 = commits[0..N-1]).
function collectSelectedRows(
  draft: { staged: boolean; unstaged: boolean; shas: string[] },
  commits: CommitInfo[],
): number[] {
  const out: number[] = [];
  if (draft.unstaged) out.push(0);
  if (draft.staged) out.push(1);
  for (const sha of draft.shas) {
    const idx = commits.findIndex((c) => c.sha === sha);
    if (idx >= 0) out.push(idx + 2);
  }
  return out.sort((a, b) => a - b);
}

// Project a contiguous range of row indices back onto the {unstaged, staged,
// shas} shape the rest of the app understands.
function rowRangeToDraft(
  start: number,
  end: number,
  commits: CommitInfo[],
  baseDraft: { staged: boolean; unstaged: boolean; shas: string[] },
): { staged: boolean; unstaged: boolean; shas: string[] } {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  let unstaged = false;
  let staged = false;
  const shas: string[] = [];
  for (let i = lo; i <= hi; i++) {
    if (i === 0) unstaged = true;
    else if (i === 1) staged = true;
    else if (commits[i - 2]) shas.push(commits[i - 2].sha);
  }
  return { ...baseDraft, unstaged, staged, shas };
}

function Badge({
  kind,
  children,
}: {
  kind: SelectionKind;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border font-mono tracking-wide ${badgeTone(kind)}`}
    >
      {children}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (days < 1) return "today";
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return d.toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}
