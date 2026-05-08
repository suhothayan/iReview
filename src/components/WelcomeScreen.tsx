import type { NoRepoInfo } from "../lib/api";
import { Logo } from "./Logo";

export function WelcomeScreen({ info }: { info: NoRepoInfo }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6">
      <div className="stage-card max-w-xl w-full rounded-lg border border-bg-line p-8">
        <div className="flex items-center gap-2 mb-1">
          <Logo className="w-7 h-7" />
          <div className="text-accent font-semibold text-lg">iReview</div>
        </div>
        <h1 className="text-fg text-xl font-medium mb-3">
          No git repository found
        </h1>
        <p className="text-fg-muted text-sm mb-6">
          iReview reviews diffs from a local git repo, but the path it was
          launched from doesn't contain a <code className="font-mono">.git</code>{" "}
          folder.
        </p>

        <div className="bg-bg-elev rounded p-3 mb-6 border border-bg-line">
          <div className="text-xs text-fg-dim uppercase tracking-wide mb-1">
            {info.explicit ? "You provided" : "Searched from"}
          </div>
          <code className="font-mono text-sm text-fg break-all">
            {info.startedFrom}
          </code>
          {!info.explicit && info.startedFrom !== info.repo && (
            <>
              <div className="text-xs text-fg-dim uppercase tracking-wide mt-3 mb-1">
                Walked up to
              </div>
              <code className="font-mono text-sm text-fg break-all">
                {info.repo}
              </code>
            </>
          )}
        </div>

        <div className="text-fg text-sm font-medium mb-2">To get started:</div>
        <ol className="text-sm text-fg-muted space-y-2 list-decimal pl-5 mb-6">
          <li>Quit iReview (close this tab and stop the binary).</li>
          <li>
            Re-launch it with the path to your repo:
            <pre className="mt-1 bg-bg-elev rounded p-2 font-mono text-xs text-fg overflow-x-auto border border-bg-line">
              ireview /path/to/your/repo
            </pre>
          </li>
        </ol>

        <div className="text-xs text-fg-dim border-t border-bg-line pt-4">
          Tip: launch it from inside any subdirectory of a git repo and it
          finds the repo root automatically — no path argument needed.
        </div>
      </div>
    </div>
  );
}
