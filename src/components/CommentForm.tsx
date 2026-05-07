import { useState, useEffect, useRef } from "react";
import type { Comment, CommentType } from "../types";

interface Props {
  initial?: Comment;
  onSave: (body: string, type: CommentType) => void;
  onCancel: () => void;
  scopeLabel: string;
}

const TYPES: { value: CommentType; label: string; color: string }[] = [
  { value: "issue", label: "Issue", color: "text-red-600 dark:text-red-400" },
  {
    value: "suggestion",
    label: "Suggestion",
    color: "text-blue-600 dark:text-blue-400",
  },
  { value: "note", label: "Note", color: "text-fg-muted" },
  {
    value: "praise",
    label: "Praise",
    color: "text-green-600 dark:text-green-400",
  },
];

export function CommentForm({ initial, onSave, onCancel, scopeLabel }: Props) {
  const [body, setBody] = useState(initial?.body ?? "");
  const [type, setType] = useState<CommentType>(initial?.type ?? "suggestion");
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ta.current?.focus();
  }, []);

  return (
    <div className="stage-card my-2 mx-2 p-3 rounded border border-bg-line">
      <div className="flex items-center gap-2 mb-2 text-xs text-fg-muted">
        <span>{scopeLabel}</span>
        <div className="flex-1" />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CommentType)}
          className="bg-bg-line text-xs rounded px-1.5 py-0.5 text-fg"
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        ref={ta}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            if (body.trim()) onSave(body.trim(), type);
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
        placeholder="Leave a comment… (⌘/Ctrl+Enter to save, Esc to cancel)"
        rows={3}
        className="w-full bg-bg text-fg text-sm rounded p-2 border border-bg-line resize-y font-mono"
      />
      <div className="flex gap-2 justify-end mt-2">
        <button
          onClick={onCancel}
          className="text-xs px-3 py-1 rounded text-fg-muted hover:text-fg"
        >
          Cancel
        </button>
        <button
          disabled={!body.trim()}
          onClick={() => onSave(body.trim(), type)}
          className="text-xs px-3 py-1 rounded bg-accent text-accent-on font-medium disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

export function CommentBubble({
  comment,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = TYPES.find((x) => x.value === comment.type)!;
  return (
    <div className="stage-card my-2 mx-2 p-3 rounded border border-bg-line">
      <div className="flex items-center gap-2 mb-1 text-xs">
        <span className={`font-semibold ${t.color}`}>
          [{t.label.toUpperCase()}]
        </span>
        <div className="flex-1" />
        <button onClick={onEdit} className="text-fg-muted hover:text-fg">
          edit
        </button>
        <button
          onClick={onDelete}
          className="text-fg-muted hover:text-red-500"
        >
          delete
        </button>
      </div>
      <div className="text-sm text-fg whitespace-pre-wrap">{comment.body}</div>
    </div>
  );
}
