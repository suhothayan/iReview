import { useCallback } from "react";
import { useStore } from "../lib/store";
import type { DiffFile } from "../types";

// Single-file mode prev/next navigation. Wraps around at the ends so the user
// never gets stuck — and resets the scroll container's vertical position so
// each new file starts at the top.
export function useFileNavigation(
  files: DiffFile[],
  scrollContainerRef: React.RefObject<HTMLDivElement>,
) {
  const activeFile = useStore((s) => s.activeFile);
  const setActiveFile = useStore((s) => s.setActiveFile);
  const activeIdx = files.findIndex((f) => f.path === activeFile);
  const active = activeIdx >= 0 ? files[activeIdx] : null;

  const goPrev = useCallback(() => {
    if (files.length === 0) return;
    const idx = activeIdx <= 0 ? files.length - 1 : activeIdx - 1;
    setActiveFile(files[idx].path);
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [files, activeIdx, setActiveFile, scrollContainerRef]);

  const goNext = useCallback(() => {
    if (files.length === 0) return;
    const idx = activeIdx < 0 || activeIdx >= files.length - 1 ? 0 : activeIdx + 1;
    setActiveFile(files[idx].path);
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [files, activeIdx, setActiveFile, scrollContainerRef]);

  return { active, activeIdx, goPrev, goNext };
}
