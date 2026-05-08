import { Logo } from "./Logo";

export function StoppedScreen() {
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
