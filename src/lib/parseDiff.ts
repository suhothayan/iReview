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

      // Walk header lines until we hit a hunk or the next file.
      i++;
      while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("diff --git ")) {
        const h = lines[i];
        if (h.startsWith("--- ")) {
          const p = h.slice(4);
          file.oldPath = p === "/dev/null" ? null : stripPrefix(p);
        } else if (h.startsWith("+++ ")) {
          const p = h.slice(4);
          file.newPath = p === "/dev/null" ? null : stripPrefix(p);
        } else if (h.startsWith("new file mode")) {
          file.status = "added";
        } else if (h.startsWith("deleted file mode")) {
          file.status = "deleted";
        } else if (h.startsWith("rename from") || h.startsWith("rename to")) {
          file.status = "renamed";
        }
        i++;
      }

      file.path = file.newPath || file.oldPath || extractPathFromHeader(line) || "(unknown)";

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
          if (raw.startsWith("\\ ")) {
            // "\ No newline at end of file" — skip
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

function extractPathFromHeader(line: string): string | null {
  // diff --git a/foo b/foo
  const m = line.match(/^diff --git a\/(.+) b\//);
  return m ? m[1] : null;
}
