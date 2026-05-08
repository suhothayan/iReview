import { useCallback, useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { fileSectionId } from "../lib/dom";
import type { DiffFile } from "../types";

// In scroll-all view, observe scroll position to set the active file. Click
// handlers can call goToFile() to smooth-scroll a specific section into view
// while temporarily suppressing the spy so the highlight doesn't flicker.
export function useScrollSpy(
  scrollContainerRef: React.RefObject<HTMLDivElement>,
  files: DiffFile[],
  enabled: boolean,
) {
  const activeFile = useStore((s) => s.activeFile);
  const setActiveFile = useStore((s) => s.setActiveFile);
  const programmaticScrollUntil = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      if (Date.now() < programmaticScrollUntil.current) return;
      const containerTop = container.getBoundingClientRect().top;
      const zone = containerTop + 80;
      let best: { path: string; top: number } | null = null;
      for (const f of files) {
        const el = document.getElementById(fileSectionId(f.path));
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= zone) {
          if (!best || top > best.top) best = { path: f.path, top };
        }
      }
      if (!best && files.length > 0) {
        best = { path: files[0].path, top: 0 };
      }
      if (best && best.path !== activeFile) setActiveFile(best.path);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled, files, activeFile, setActiveFile, scrollContainerRef]);

  const goToFile = useCallback(
    (path: string) => {
      setActiveFile(path);
      if (!enabled) return;
      const el = document.getElementById(fileSectionId(path));
      const container = scrollContainerRef.current;
      if (!el || !container) return;
      programmaticScrollUntil.current = Date.now() + 700;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [enabled, scrollContainerRef, setActiveFile],
  );

  return { goToFile };
}
