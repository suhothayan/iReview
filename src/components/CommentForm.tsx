import { useState, useEffect, useRef } from "react";
import type { Comment, CommentType } from "../types";

interface Props {
  initial?: Comment;
  onSave: (body: string, type: CommentType) => void;
  onCancel: () => void;
  scopeLabel: string;
}

interface TypeOption {
  value: CommentType;
  label: string;          // Title-case label for the toggle
  exportLabel: string;    // ALL-CAPS form shown in CommentBubble + matches export
  // Tailwind classes applied when this option is the active toggle button.
  // Should evoke the same urgency family as the export tag color.
  activeBg: string;
  activeFg: string;
  // Color used for the [LABEL] tag inside CommentBubble when reading.
  bubbleColor: string;
  description: string;
}

const TYPES: TypeOption[] = [
  {
    value: "must-fix",
    label: "Must fix",
    exportLabel: "MUST FIX",
    activeBg: "bg-red-600 dark:bg-red-500",
    activeFg: "text-white",
    bubbleColor: "text-red-600 dark:text-red-400",
    description: "Must be addressed",
  },
  {
    value: "suggestion",
    label: "Suggestion",
    exportLabel: "SUGGESTION",
    activeBg: "bg-accent",
    activeFg: "text-accent-on",
    bubbleColor: "text-blue-600 dark:text-blue-400",
    description: "Improvement to consider",
  },
  {
    value: "note",
    label: "Note",
    exportLabel: "NOTE",
    activeBg: "bg-fg-muted",
    activeFg: "text-bg",
    bubbleColor: "text-fg-muted",
    description: "Observation, no action required",
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
        <span className="truncate" title={scopeLabel}>{scopeLabel}</span>
        <div className="flex-1" />
        <TypeToggle value={type} onChange={setType} />
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
          title="Discard this comment (Esc)"
        >
          Cancel
        </button>
        <button
          disabled={!body.trim()}
          onClick={() => onSave(body.trim(), type)}
          className="text-xs px-3 py-1 rounded bg-accent text-accent-on font-medium disabled:opacity-50"
          title="Save this comment (⌘/Ctrl+Enter)"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// 3-way segmented toggle replacing the old <select>. Active option fills with
// its urgency color; inactive options sit muted in the same row.
function TypeToggle({
  value,
  onChange,
}: {
  value: CommentType;
  onChange: (v: CommentType) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Comment type"
      className="flex border border-bg-line rounded overflow-hidden text-xs"
    >
      {TYPES.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="radio"
            aria-checked={active}
            type="button"
            onClick={() => onChange(t.value)}
            title={t.description}
            className={`px-2.5 py-0.5 ${
              active
                ? `${t.activeBg} ${t.activeFg} font-medium`
                : "bg-bg-line text-fg hover:bg-bg-elev"
            }`}
          >
            {t.label}
          </button>
        );
      })}
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
  const t = TYPES.find((x) => x.value === comment.type) ?? TYPES[1]; // fallback to suggestion
  return (
    <div className="stage-card my-2 mx-2 p-3 rounded border border-bg-line">
      <div className="flex items-center gap-2 mb-1 text-xs">
        <span className={`font-semibold ${t.bubbleColor}`}>
          [{t.exportLabel}]
        </span>
        <div className="flex-1" />
        <button
          onClick={onEdit}
          className="text-fg-muted hover:text-fg"
          title="Edit this comment"
        >
          edit
        </button>
        <button
          onClick={onDelete}
          className="text-fg-muted hover:text-red-500"
          title="Delete this comment"
        >
          delete
        </button>
      </div>
      <div className="text-sm text-fg whitespace-pre-wrap">{comment.body}</div>
    </div>
  );
}
