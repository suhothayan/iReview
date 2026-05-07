export type LineKind = "context" | "add" | "del";

export interface DiffLine {
  kind: LineKind;
  // 1-based line numbers in the old/new file. null when not applicable.
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;       // new path (or old if deleted)
  oldPath: string | null;
  newPath: string | null;
  status: "added" | "deleted" | "modified" | "renamed";
  hunks: DiffHunk[];
}

export type CommentType = "issue" | "suggestion" | "note" | "praise";

export interface Comment {
  id: string;
  type: CommentType;
  body: string;
  // scope: review-wide if file is null; file-level if line is null; line/range otherwise.
  file: string | null;
  // For line/range comments: line number on the new file (or old if deleted).
  startLine: number | null;
  endLine: number | null;
  side: "new" | "old";
  createdAt: number;
}
