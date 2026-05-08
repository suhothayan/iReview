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
  label: string;          // Lower-case label shown in the toggle
  exportLabel: string;    // ALL-CAPS form shown in CommentBubble + matches export
  // Toggle pill: Tailwind classes for active background + text, plus the
  // hover tint applied to the inactive state.
  activeBg: string;
  activeText: string;
  hoverBg: string;
  dotActive: string;      // saturated dot color for the active state
  // Color used for the [TYPE] tag inside CommentBubble when reading.
  bubbleColor: string;
  description: string;
}

const TYPES: TypeOption[] = [
  {
    value: "must-fix",
    label: "must fix",
    exportLabel: "MUST FIX",
    activeBg: "bg-red-100 dark:bg-red-950/40",
    activeText: "text-red-700 dark:text-red-300",
    hoverBg: "hover:bg-red-50 dark:hover:bg-red-950/20",
    dotActive: "bg-red-500",
    bubbleColor: "text-red-600 dark:text-red-400",
    description: "Must be addressed",
  },
  {
    value: "suggestion",
    label: "suggestion",
    exportLabel: "SUGGESTION",
    activeBg: "bg-blue-100 dark:bg-blue-950/40",
    activeText: "text-blue-700 dark:text-blue-300",
    hoverBg: "hover:bg-blue-50 dark:hover:bg-blue-950/20",
    dotActive: "bg-blue-500",
    bubbleColor: "text-blue-600 dark:text-blue-400",
    description: "Improvement to consider",
  },
  {
    value: "note",
    label: "note",
    exportLabel: "NOTE",
    activeBg: "bg-bg-line",
    activeText: "text-fg",
    hoverBg: "hover:bg-bg-line/60",
    dotActive: "bg-fg-muted",
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

// 3-way toggle: a translucent "holo" track holds three options. No dots —
// the active option's tinted background carries the meaning. Rounded
// rectangle (not pill) for a sleeker, more modern feel.
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
      className="inline-flex items-center p-0.5 rounded-md backdrop-blur-sm bg-bg/40 border border-bg-line text-xs"
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
            className={`px-2.5 py-0.5 rounded transition-colors ${
              active
                ? `${t.activeBg} ${t.activeText} font-medium shadow-sm`
                : `text-fg-muted hover:text-fg`
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
