import { useEffect } from "react";

interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Small in-app confirm dialog. Replaces window.confirm so destructive actions
// don't pop a native dialog that clashes with the styled UI and blocks tests.
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="stage-card max-w-md w-[90%] rounded-lg border border-bg-line p-6"
        role="alertdialog"
        aria-modal="true"
      >
        <h2 className="text-fg text-lg font-medium mb-2">{title}</h2>
        <p className="text-fg-muted text-sm mb-5 whitespace-pre-wrap">{body}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded text-fg-muted hover:text-fg"
            title="Press Esc to cancel"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`text-xs px-3 py-1.5 rounded font-medium shadow-sm ${
              destructive
                ? "bg-red-600 text-white hover:opacity-90"
                : "bg-accent text-accent-on hover:opacity-90"
            }`}
            title="Press Enter to confirm"
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
