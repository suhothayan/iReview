import { useState, useMemo } from "react";
import type {
  Comment,
  CommentType,
  DiffFile,
  DiffHunk,
  DiffLine,
} from "../types";
import { useStore } from "../lib/store";
import { CommentForm, CommentBubble } from "./CommentForm";

interface Props {
  file: DiffFile;
  // When true, the component does not own its own scroll — the parent does.
  // Used in scroll-all (GitHub-style) view mode.
  embedded?: boolean;
}

type FormState =
  | { kind: "none" }
  | { kind: "file" }
  | {
      kind: "line";
      // Inclusive range. For single-line comments, startLine === endLine.
      startLine: number;
      endLine: number;
      side: "new" | "old";
    }
  | { kind: "edit"; commentId: string };

export function DiffView({ file, embedded = false }: Props) {
  const {
    comments,
    addComment,
    updateComment,
    deleteComment,
    reviewed,
    toggleReviewed,
    untrackedFiles,
  } = useStore();
  // Untracked files come in as `new file mode 100644` and would otherwise
  // surface as "added" in the file header — same dishonesty the sidebar's
  // `?` badge fixes. Override the label here too so the right pane matches.
  const displayStatus = untrackedFiles.includes(file.path)
    ? "untracked"
    : file.status;
  const [form, setForm] = useState<FormState>({ kind: "none" });

  const fileComments = useMemo(
    () => comments.filter((c) => c.file === file.path),
    [comments, file.path],
  );

  // Map line key -> comments for that line
  const lineComments = useMemo(() => {
    const m = new Map<string, Comment[]>();
    for (const c of fileComments) {
      if (c.startLine === null) continue;
      // Attach to each line in the range
      const end = c.endLine ?? c.startLine;
      for (let l = c.startLine; l <= end; l++) {
        const key = `${c.side}:${l}`;
        const arr = m.get(key) ?? [];
        arr.push(c);
        m.set(key, arr);
      }
    }
    return m;
  }, [fileComments]);

  const fileLevel = fileComments.filter(
    (c) => c.startLine === null && c.file === file.path,
  );

  const isReviewed = !!reviewed[file.path];

  const editingComment =
    form.kind === "edit"
      ? comments.find((c) => c.id === form.commentId) ?? null
      : null;

  return (
    <section
      className={
        embedded
          ? "stage-diff border-b-2 border-bg-line"
          : "flex-1 overflow-y-auto stage-diff"
      }
    >
      <div className="stage-file-header sticky top-0 z-10 border-b border-bg-line px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-3">
        <h2 className="font-mono text-xs sm:text-sm text-fg flex-1 truncate" title={file.path}>
          {file.path}
        </h2>
        <span className="hidden sm:inline text-xs text-fg-muted">{displayStatus}</span>
        <span
          className="hidden lg:inline text-[11px] text-fg-dim italic"
          title="Click any line to comment on it. Hold Shift and click another line to extend the range."
        >
          click to comment · shift-click to extend range
        </span>
        <button
          onClick={() => setForm({ kind: "file" })}
          className="text-xs px-2 py-1 rounded bg-bg-line hover:bg-bg text-fg whitespace-nowrap"
          title="Add a file-level comment"
          aria-label="Add file comment"
        >
          <span className="sm:hidden">+</span>
          <span className="hidden sm:inline">+ File comment</span>
        </button>
        <label
          className="flex items-center gap-1 text-xs text-fg whitespace-nowrap cursor-pointer"
          title="Mark this file as reviewed (struck through in the file list)"
        >
          <input
            type="checkbox"
            checked={isReviewed}
            onChange={() => toggleReviewed(file.path)}
            className="accent-accent"
          />
          <span className="hidden sm:inline">Reviewed</span>
        </label>
      </div>

      {/* File-level comments */}
      {fileLevel.map((c) => (
        <CommentBubble
          key={c.id}
          comment={c}
          onEdit={() => setForm({ kind: "edit", commentId: c.id })}
          onDelete={() => deleteComment(c.id)}
        />
      ))}

      {form.kind === "file" && (
        <CommentForm
          scopeLabel={`File: ${file.path}`}
          onCancel={() => setForm({ kind: "none" })}
          onSave={(body, type) => {
            addComment({
              type,
              body,
              file: file.path,
              startLine: null,
              endLine: null,
              side: "new",
            });
            setForm({ kind: "none" });
          }}
        />
      )}

      {/* Hunks */}
      <div>
        {file.hunks.length === 0 && (
          <div className="px-4 py-6 text-fg-muted text-sm">
            (No textual changes — likely a binary file or rename without content
            change)
          </div>
        )}
        {file.hunks.map((h, i) => (
          <HunkBlock
            key={i}
            hunk={h}
            lineComments={lineComments}
            form={form}
            setForm={setForm}
            onSaveRange={(startLine, endLine, side, body, type) => {
              addComment({
                type,
                body,
                file: file.path,
                startLine,
                endLine,
                side,
              });
              setForm({ kind: "none" });
            }}
            onUpdate={(id, body, type) => {
              updateComment(id, body, type);
              setForm({ kind: "none" });
            }}
            onEdit={(id) => setForm({ kind: "edit", commentId: id })}
            onDelete={(id) => deleteComment(id)}
            editingComment={editingComment}
          />
        ))}
      </div>
    </section>
  );
}

interface HunkProps {
  hunk: DiffHunk;
  lineComments: Map<string, Comment[]>;
  form: FormState;
  setForm: (s: FormState) => void;
  onSaveRange: (
    startLine: number,
    endLine: number,
    side: "new" | "old",
    body: string,
    type: CommentType,
  ) => void;
  onUpdate: (id: string, body: string, type: CommentType) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  editingComment: Comment | null;
}

function HunkBlock(p: HunkProps) {
  return (
    <div className="border-b border-bg-line">
      <div className="hunk-header">@@ {p.hunk.header.trim()}</div>
      {p.hunk.lines.map((ln, i) => (
        <LineRow
          key={i}
          line={ln}
          form={p.form}
          setForm={p.setForm}
          comments={lineCommentsFor(p.lineComments, ln)}
          onSaveRange={p.onSaveRange}
          onUpdate={p.onUpdate}
          onEdit={p.onEdit}
          onDelete={p.onDelete}
          editingComment={p.editingComment}
        />
      ))}
    </div>
  );
}

function lineCommentsFor(map: Map<string, Comment[]>, ln: DiffLine): Comment[] {
  if (ln.kind === "add" && ln.newNo !== null) {
    return map.get(`new:${ln.newNo}`) ?? [];
  }
  if (ln.kind === "del" && ln.oldNo !== null) {
    return map.get(`old:${ln.oldNo}`) ?? [];
  }
  // Context lines have BOTH old and new line numbers. Show comments anchored on
  // either side so a comment created with side='old' on a context line still
  // renders after reload.
  if (ln.kind === "context") {
    const out: Comment[] = [];
    if (ln.newNo !== null) out.push(...(map.get(`new:${ln.newNo}`) ?? []));
    if (ln.oldNo !== null) out.push(...(map.get(`old:${ln.oldNo}`) ?? []));
    return out;
  }
  return [];
}

function LineRow({
  line,
  form,
  setForm,
  comments,
  onSaveRange,
  onUpdate,
  onEdit,
  onDelete,
  editingComment,
}: {
  line: DiffLine;
  form: FormState;
  setForm: (s: FormState) => void;
  comments: Comment[];
  onSaveRange: HunkProps["onSaveRange"];
  onUpdate: HunkProps["onUpdate"];
  onEdit: HunkProps["onEdit"];
  onDelete: HunkProps["onDelete"];
  editingComment: Comment | null;
}) {
  const side: "new" | "old" = line.kind === "del" ? "old" : "new";
  const lineNo = side === "new" ? line.newNo : line.oldNo;

  // The form renders at the END of the active range.
  const isFormHere =
    form.kind === "line" &&
    form.endLine === lineNo &&
    form.side === side &&
    lineNo !== null;

  // Highlight every line in the active range so the user sees what's selected.
  const isInRange =
    form.kind === "line" &&
    form.side === side &&
    lineNo !== null &&
    lineNo >= form.startLine &&
    lineNo <= form.endLine;

  const handleClick = (e: React.MouseEvent) => {
    if (lineNo === null) return;
    // If a comment is being edited, ignore shift-clicks rather than silently
    // discard the in-progress edit. Plain clicks fall through to the regular
    // "start a new line comment" path, which closes the edit form — that's
    // explicit enough.
    if (form.kind === "edit" && e.shiftKey) {
      window.getSelection()?.removeAllRanges();
      return;
    }
    if (
      e.shiftKey &&
      form.kind === "line" &&
      form.side === side
    ) {
      // Extend the range to include this line.
      const start = Math.min(form.startLine, lineNo);
      const end = Math.max(form.endLine, lineNo);
      setForm({ kind: "line", startLine: start, endLine: end, side });
      window.getSelection()?.removeAllRanges();
    } else {
      setForm({ kind: "line", startLine: lineNo, endLine: lineNo, side });
    }
  };

  return (
    <>
      <div
        className={`diff-line ${line.kind} selectable ${
          comments.length > 0 ? "has-comment" : ""
        } ${isInRange ? "in-range" : ""}`}
        onClick={handleClick}
      >
        <div className="gutter">{line.oldNo ?? ""}</div>
        <div className="gutter">{line.newNo ?? ""}</div>
        <div className="content">
          <span className="text-fg-muted mr-2">
            {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
          </span>
          {line.text}
        </div>
      </div>
      {comments
        .filter((c) => {
          // Render bubble/form only at the range's anchor line (endLine).
          // Other lines in the range still get the `has-comment` indicator
          // via the un-filtered `comments` array used for class names above.
          const anchor = c.endLine ?? c.startLine;
          const lineOnSide = c.side === "new" ? line.newNo : line.oldNo;
          return anchor === lineOnSide;
        })
        .map((c) =>
          editingComment && editingComment.id === c.id ? (
            <CommentForm
              key={c.id}
              initial={c}
              scopeLabel={`Editing comment on ${rangeLabel(c.startLine, c.endLine)}`}
              onCancel={() => setForm({ kind: "none" })}
              onSave={(body, type) => onUpdate(c.id, body, type)}
            />
          ) : (
            <CommentBubble
              key={c.id}
              comment={c}
              onEdit={() => onEdit(c.id)}
              onDelete={() => onDelete(c.id)}
            />
          ),
        )}
      {isFormHere && lineNo !== null && form.kind === "line" && (
        <CommentForm
          scopeLabel={
            form.startLine === form.endLine
              ? `Line ${form.startLine} (${side === "new" ? "added/context" : "removed"}) — shift-click another line to extend the range`
              : `Lines ${form.startLine}–${form.endLine} (${side === "new" ? "added/context" : "removed"}) — ${form.endLine - form.startLine + 1} lines selected`
          }
          onCancel={() => setForm({ kind: "none" })}
          onSave={(body, type) =>
            onSaveRange(form.startLine, form.endLine, side, body, type)
          }
        />
      )}
    </>
  );
}

function rangeLabel(start: number | null, end: number | null): string {
  if (start === null) return "(file)";
  if (end === null || end === start) return `line ${start}`;
  return `lines ${start}–${end}`;
}
