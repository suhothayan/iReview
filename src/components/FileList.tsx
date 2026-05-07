import { useMemo, useState, useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import type { DiffFile } from "../types";

type DirNode = {
  kind: "dir";
  name: string;
  path: string; // full prefix path (e.g. "src/components")
  children: TreeNode[];
};
type FileNode = {
  kind: "file";
  name: string;
  path: string;
  file: DiffFile;
};
type TreeNode = DirNode | FileNode;

function buildTree(files: DiffFile[]): DirNode {
  const root: DirNode = { kind: "dir", name: "", path: "", children: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let cur: DirNode = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i];
      const segPath = parts.slice(0, i + 1).join("/");
      let next = cur.children.find(
        (c): c is DirNode => c.kind === "dir" && c.name === segment,
      );
      if (!next) {
        next = { kind: "dir", name: segment, path: segPath, children: [] };
        cur.children.push(next);
      }
      cur = next;
    }
    cur.children.push({
      kind: "file",
      name: parts[parts.length - 1],
      path: f.path,
      file: f,
    });
  }
  // Sort: dirs first, then files; alphabetical within.
  function sortRec(node: DirNode) {
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const c of node.children) {
      if (c.kind === "dir") sortRec(c);
    }
  }
  sortRec(root);
  // Collapse single-child dir chains (a/b/c if a only contains b which only contains c).
  function collapseRec(node: DirNode): DirNode {
    node.children = node.children.map((c) =>
      c.kind === "dir" ? collapseChain(c) : c,
    );
    return node;
  }
  function collapseChain(node: DirNode): DirNode {
    let cur = node;
    while (cur.children.length === 1 && cur.children[0].kind === "dir") {
      const onlyChild = cur.children[0];
      cur = {
        kind: "dir",
        name: `${cur.name}/${onlyChild.name}`,
        path: onlyChild.path,
        children: onlyChild.children,
      };
    }
    return collapseRec(cur);
  }
  return collapseRec(root);
}

function allDirPaths(node: DirNode, out: Set<string> = new Set()): Set<string> {
  for (const c of node.children) {
    if (c.kind === "dir") {
      out.add(c.path);
      allDirPaths(c, out);
    }
  }
  return out;
}

function collectFilePaths(node: TreeNode, out: string[] = []): string[] {
  if (node.kind === "file") out.push(node.path);
  else for (const c of node.children) collectFilePaths(c, out);
  return out;
}

interface FileListProps {
  // Called when the user clicks a file row. Defaults to setActiveFile.
  // App passes a custom handler that also smooth-scrolls in scroll-all mode.
  onSelect?: (path: string) => void;
}

export function FileList({ onSelect }: FileListProps = {}) {
  const {
    files,
    activeFile,
    setActiveFile,
    comments,
    reviewed,
    toggleReviewed,
    setFilesReviewed,
  } = useStore();
  const handleSelect = onSelect ?? setActiveFile;

  const tree = useMemo(() => buildTree(files), [files]);

  // Default: all dirs expanded.
  const [expanded, setExpanded] = useState<Set<string>>(() => allDirPaths(tree));

  // When the file set changes, expand any newly-introduced dirs.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const p of allDirPaths(tree)) next.add(p);
      return next;
    });
  }, [tree]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of comments) {
      if (c.file) m[c.file] = (m[c.file] ?? 0) + 1;
    }
    return m;
  }, [comments]);

  function toggleDir(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <aside className="stage-sidebar w-72 shrink-0 border-r border-bg-line overflow-y-auto">
      <div className="h-10 shrink-0 px-3 text-xs uppercase tracking-wide text-fg-muted border-b border-bg-line flex items-center gap-1">
        <span>Files ({files.length})</span>
        <div className="flex-1" />
        <button
          onClick={() => setExpanded(new Set())}
          className="w-7 h-7 rounded text-base text-fg-muted hover:text-fg hover:bg-bg-line inline-flex items-center justify-center"
          title="Collapse all"
          aria-label="Collapse all"
        >
          ⊟
        </button>
        <button
          onClick={() => setExpanded(allDirPaths(tree))}
          className="w-7 h-7 rounded text-base text-fg-muted hover:text-fg hover:bg-bg-line inline-flex items-center justify-center"
          title="Expand all"
          aria-label="Expand all"
        >
          ⊞
        </button>
      </div>
      <ul>
        {tree.children.map((node) => (
          <TreeRow
            key={node.kind === "dir" ? `d:${node.path}` : `f:${node.path}`}
            node={node}
            depth={0}
            expanded={expanded}
            toggleDir={toggleDir}
            activeFile={activeFile}
            setActiveFile={handleSelect}
            counts={counts}
            reviewed={reviewed}
            toggleReviewed={toggleReviewed}
            setFilesReviewed={setFilesReviewed}
          />
        ))}
      </ul>
    </aside>
  );
}

interface RowProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggleDir: (path: string) => void;
  activeFile: string | null;
  setActiveFile: (p: string) => void;
  counts: Record<string, number>;
  reviewed: Record<string, boolean>;
  toggleReviewed: (path: string) => void;
  setFilesReviewed: (paths: string[], reviewed: boolean) => void;
}

function TreeRow(p: RowProps) {
  const indent = { paddingLeft: `${8 + p.depth * 14}px` };

  if (p.node.kind === "dir") {
    const open = p.expanded.has(p.node.path);
    const descendants = collectFilePaths(p.node);
    const reviewedCount = descendants.filter((d) => p.reviewed[d]).length;
    const checkState: "all" | "some" | "none" =
      reviewedCount === 0
        ? "none"
        : reviewedCount === descendants.length
          ? "all"
          : "some";

    const onFolderToggle = () => {
      // If anything is unreviewed, mark all reviewed; otherwise unmark all.
      const target = checkState !== "all";
      p.setFilesReviewed(descendants, target);
    };

    return (
      <>
        <li
          className="flex items-center gap-1 px-2 py-1 text-sm cursor-pointer hover:bg-bg-line text-fg select-none"
          style={indent}
          onClick={() => p.toggleDir(p.node.path)}
        >
          <TriCheckbox
            state={checkState}
            onToggle={onFolderToggle}
            title={
              checkState === "all"
                ? "Unmark all files in this folder"
                : "Mark all files in this folder reviewed"
            }
          />
          <span className="w-3 text-xs text-fg-muted">{open ? "▾" : "▸"}</span>
          <span className="truncate font-medium">{p.node.name}</span>
          <span className="text-[10px] text-fg-muted ml-auto pl-2 shrink-0">
            {reviewedCount}/{descendants.length}
          </span>
        </li>
        {open &&
          p.node.children.map((child) => (
            <TreeRow
              key={child.kind === "dir" ? `d:${child.path}` : `f:${child.path}`}
              node={child}
              depth={p.depth + 1}
              expanded={p.expanded}
              toggleDir={p.toggleDir}
              activeFile={p.activeFile}
              setActiveFile={p.setActiveFile}
              counts={p.counts}
              reviewed={p.reviewed}
              toggleReviewed={p.toggleReviewed}
              setFilesReviewed={p.setFilesReviewed}
            />
          ))}
      </>
    );
  }

  // file
  const f = p.node.file;
  const isActive = p.activeFile === f.path;
  const isReviewed = !!p.reviewed[f.path];
  const count = p.counts[f.path] ?? 0;
  const statusGlyph = (() => {
    switch (f.status) {
      case "added":
        return <span className="text-green-600 dark:text-green-400">A</span>;
      case "deleted":
        return <span className="text-red-600 dark:text-red-400">D</span>;
      case "renamed":
        return <span className="text-yellow-600 dark:text-yellow-400">R</span>;
      default:
        return <span className="text-fg-muted">M</span>;
    }
  })();

  return (
    <li
      className={`flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-bg-line ${
        isActive ? "is-selected" : ""
      }`}
      style={{ paddingLeft: `${8 + p.depth * 14 + 16}px` }}
      onClick={() => p.setActiveFile(f.path)}
    >
      <input
        type="checkbox"
        checked={isReviewed}
        onChange={(e) => {
          e.stopPropagation();
          p.toggleReviewed(f.path);
        }}
        onClick={(e) => e.stopPropagation()}
        className="accent-accent"
        title="Mark file as reviewed"
      />
      <span className="font-mono text-xs w-3 text-center">{statusGlyph}</span>
      <span
        className={`flex-1 truncate ${
          isReviewed ? "line-through text-fg-muted" : "text-fg"
        }`}
        title={f.path}
      >
        {p.node.name}
      </span>
      {count > 0 && (
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent text-accent-on font-medium">
          {count}
        </span>
      )}
    </li>
  );
}

function TriCheckbox({
  state,
  onToggle,
  title,
}: {
  state: "all" | "some" | "none";
  onToggle: () => void;
  title?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === "all"}
      onChange={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onClick={(e) => e.stopPropagation()}
      className="accent-accent"
      title={title}
    />
  );
}
