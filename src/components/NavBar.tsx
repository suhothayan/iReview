// Top + bottom Prev/Next navigator shown in single-file view.
export function NavBar({
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
        <span className="hidden sm:inline">
          File {position} of {total}
        </span>
        <span className="sm:hidden">
          {position}/{total}
        </span>
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
