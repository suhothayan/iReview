import { useCallback, useEffect, useState } from "react";
import {
  fetchRepo,
  NoRepoError,
  errorMessage,
  type NoRepoInfo,
} from "../lib/api";
import { useStore } from "../lib/store";

export interface BootMeta {
  branch: string | null;
  head: string | null;
}

// Fetch repo info, hydrate per-repo session, and decide whether to auto-open
// the picker. Encapsulates the side-effect-heavy boot dance so App.tsx is
// just layout glue.
export function useBootRepo() {
  const setRepo = useStore((s) => s.setRepo);
  const setSelection = useStore((s) => s.setSelection);
  const setShowCommitPicker = useStore((s) => s.setShowCommitPicker);
  const setError = useStore((s) => s.setError);

  const [bootDone, setBootDone] = useState(false);
  const [noRepo, setNoRepo] = useState<NoRepoInfo | null>(null);
  const [meta, setMeta] = useState<BootMeta>({ branch: null, head: null });

  // Re-pull /api/repo. Used by the Toolbar Refresh button so the picker
  // subtitles (hasStaged/hasUnstaged) reflect what's on disk right now and
  // so the meta line (branch + HEAD short-sha) is current. Does NOT touch
  // the user's selection — the picker's always-tickable model means the
  // user's tick state is the source of truth, not the server's view of
  // what's currently dirty.
  const refreshRepo = useCallback(async () => {
    try {
      const info = await fetchRepo();
      setNoRepo(null);
      setRepo({
        repoPath: info.repo,
        hasStaged: info.hasStaged,
        hasUnstaged: info.hasUnstaged,
      });
      setMeta({ branch: info.branch, head: info.head });
    } catch (err: unknown) {
      if (err instanceof NoRepoError) {
        setNoRepo(err.info);
        setError(null);
      } else {
        setError(errorMessage(err));
      }
    }
  }, [setRepo, setError]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await fetchRepo();
        if (cancelled) return;
        setNoRepo(null);
        setRepo({
          repoPath: info.repo,
          hasStaged: info.hasStaged,
          hasUnstaged: info.hasUnstaged,
        });
        setMeta({ branch: info.branch, head: info.head });
        useStore.getState().hydrateSession(info.repo);
        // CLI preset (--commits / --staged / --unstaged) wins over the
        // auto-default. Lets an agent launch with a specific set, e.g.
        // `ireview --commits a1b2,c3d4 --staged`.
        if (info.presetSelection) {
          setSelection({
            shas: info.presetSelection.shas,
            staged: info.presetSelection.staged,
            unstaged: info.presetSelection.unstaged,
          });
        } else {
          // Default to "watch all uncommitted work" — staged + unstaged both
          // ticked even on a clean repo. The picker rows are always tickable
          // now, so this just removes the friction of having to pre-tick
          // unstaged before editing files.
          setSelection({
            shas: [],
            staged: true,
            unstaged: true,
          });
          if (!info.hasStaged && !info.hasUnstaged) {
            setShowCommitPicker(true);
          }
        }
        if (!cancelled) setBootDone(true);
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof NoRepoError) {
          setNoRepo(err.info);
          setError(null);
        } else {
          setError(errorMessage(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { bootDone, noRepo, meta, refreshRepo };
}
