import type { DiffFile, DiffHunk, DiffLine } from "../types";

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

export function parseDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("diff --git ")) {
      const file: DiffFile = {
        path: "",
        oldPath: null,
        newPath: null,
        status: "modified",
        hunks: [],
      };
      let renameFrom: string | null = null;
      let renameTo: string | null = null;
      let sawOldMode = false;
      let sawNewMode = false;
      // Track whether we actually saw the ---/+++ headers. /dev/null is a
      // valid value meaning "this side doesn't exist" — distinct from "header
      // was absent and we should fall back to the diff --git line".
      let sawOldPathHeader = false;
      let sawNewPathHeader = false;

      // Walk header lines until we hit a hunk or the next file.
      i++;
      while (
        i < lines.length &&
        !lines[i].startsWith("@@") &&
        !lines[i].startsWith("diff --git ")
      ) {
        const h = lines[i];
        if (h.startsWith("--- ")) {
          const p = h.slice(4);
          file.oldPath = p === "/dev/null" ? null : stripPrefix(p);
          sawOldPathHeader = true;
        } else if (h.startsWith("+++ ")) {
          const p = h.slice(4);
          file.newPath = p === "/dev/null" ? null : stripPrefix(p);
          sawNewPathHeader = true;
        } else if (h.startsWith("new file mode")) {
          file.status = "added";
        } else if (h.startsWith("deleted file mode")) {
          file.status = "deleted";
        } else if (h.startsWith("rename from ")) {
          renameFrom = h.slice("rename from ".length);
          file.status = "renamed";
        } else if (h.startsWith("rename to ")) {
          renameTo = h.slice("rename to ".length);
          file.status = "renamed";
        } else if (h.startsWith("old mode ")) {
          sawOldMode = true;
        } else if (h.startsWith("new mode ")) {
          sawNewMode = true;
        } else if (h.startsWith("Binary files ") && h.endsWith(" differ")) {
          file.binary = true;
          // Try to recover paths from the "Binary files a/X and b/Y differ" form.
          const m = h.match(/^Binary files (.+) and (.+) differ$/);
          if (m) {
            const a = stripPrefix(m[1]);
            const b = stripPrefix(m[2]);
            if (a !== "/dev/null") file.oldPath = a;
            if (b !== "/dev/null") file.newPath = b;
          }
        }
        i++;
      }

      // Path resolution priority (for each side independently):
      //   1. ---/+++ header if present (including /dev/null which means null).
      //   2. rename from/to (when ---/+++ are absent — 100%-similarity renames).
      //   3. extract from "diff --git a/<old> b/<new>" header.
      // Only fall back when the dedicated header wasn't seen at all.
      if (!sawOldPathHeader && renameFrom) file.oldPath = renameFrom;
      if (!sawNewPathHeader && renameTo) file.newPath = renameTo;

      if (!sawOldPathHeader && !file.oldPath) {
        const headerPaths = extractPathsFromHeader(line);
        if (headerPaths) file.oldPath = headerPaths.oldPath;
      }
      if (!sawNewPathHeader && !file.newPath) {
        const headerPaths = extractPathsFromHeader(line);
        if (headerPaths) file.newPath = headerPaths.newPath;
      }

      // Mode-only changes have no content, no rename, no add/delete — just a
      // mode delta. Mark them so callers can distinguish from a "modified"
      // file that happens to have zero hunks.
      if (
        sawOldMode &&
        sawNewMode &&
        file.status === "modified" &&
        !renameFrom &&
        !renameTo
      ) {
        file.status = "mode-changed";
      }

      file.path = file.newPath || file.oldPath || "(unknown)";

      // Hunks
      while (i < lines.length && lines[i].startsWith("@@")) {
        const m = lines[i].match(HUNK_RE);
        if (!m) {
          i++;
          continue;
        }
        const hunk: DiffHunk = {
          oldStart: Number(m[1]),
          oldLines: m[2] ? Number(m[2]) : 1,
          newStart: Number(m[3]),
          newLines: m[4] ? Number(m[4]) : 1,
          header: m[5] || "",
          lines: [],
        };
        i++;
        let oldNo = hunk.oldStart;
        let newNo = hunk.newStart;
        while (
          i < lines.length &&
          !lines[i].startsWith("@@") &&
          !lines[i].startsWith("diff --git ")
        ) {
          const raw = lines[i];
          if (raw === "" && i === lines.length - 1) {
            i++;
            break;
          }
          // "\ No newline at end of file" — git emits this with one space
          // after the backslash, but be defensive against locale/port variants.
          if (raw.startsWith("\\")) {
            i++;
            continue;
          }
          const marker = raw[0];
          const text = raw.slice(1);
          let dl: DiffLine;
          if (marker === "+") {
            dl = { kind: "add", oldNo: null, newNo, text };
            newNo++;
          } else if (marker === "-") {
            dl = { kind: "del", oldNo, newNo: null, text };
            oldNo++;
          } else {
            dl = { kind: "context", oldNo, newNo, text };
            oldNo++;
            newNo++;
          }
          hunk.lines.push(dl);
          i++;
        }
        file.hunks.push(hunk);
      }

      files.push(file);
    } else {
      i++;
    }
  }

  return files;
}

function stripPrefix(p: string): string {
  if (p.startsWith("a/") || p.startsWith("b/")) return p.slice(2);
  return p;
}

// Extract old + new paths from a "diff --git a/old b/new" header. Handles
// quoted paths with spaces ("diff --git a/old name b/new name") by greedy
// splitting on the literal " b/" boundary, then preferring the LAST such
// boundary so paths containing the substring `b/` work too.
function extractPathsFromHeader(
  line: string,
): { oldPath: string; newPath: string } | null {
  const rest = line.slice("diff --git ".length);
  // Quoted form: "a/x" "b/y"
  const quoted = rest.match(/^"a\/(.+?)" "b\/(.+?)"$/);
  if (quoted) return { oldPath: quoted[1], newPath: quoted[2] };
  if (!rest.startsWith("a/")) return null;
  // Find the last occurrence of " b/" — git always emits a space-then-`b/`
  // separator, and using the LAST match lets paths containing `b/` resolve
  // correctly (e.g. `a/sub/b/foo b/sub/b/foo`).
  const sep = rest.lastIndexOf(" b/");
  if (sep < 0) return null;
  const oldPath = rest.slice("a/".length, sep);
  const newPath = rest.slice(sep + " b/".length);
  return { oldPath, newPath };
}
