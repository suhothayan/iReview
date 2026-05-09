import type { Comment, CommentType } from "../types";

const TYPE_LABELS: Record<CommentType, string> = {
  "must-fix": "MUST FIX",
  suggestion: "SUGGESTION",
  note: "NOTE",
};

const TYPE_DEFS: Record<CommentType, string> = {
  "must-fix": "must be addressed",
  suggestion: "improvements",
  note: "observations",
};

// Resolve a comment's type to a current label, mapping legacy values that
// might still be sitting in someone's localStorage from before the rename
// (`issue` → `must-fix`) or removal (`praise` → `note`). Anything unknown
// falls through to `suggestion` — the safest default.
function resolveType(t: unknown): CommentType {
  if (t === "must-fix" || t === "suggestion" || t === "note") return t;
  if (t === "issue") return "must-fix";
  if (t === "praise") return "note";
  return "suggestion";
}

export function exportReview(comments: Comment[]): string {
  if (comments.length === 0) return "";

  const sorted = [...comments].sort((a, b) => {
    if (a.file === b.file) {
      return (a.startLine ?? 0) - (b.startLine ?? 0);
    }
    if (a.file === null) return -1;
    if (b.file === null) return 1;
    return a.file.localeCompare(b.file);
  });

  const usedTypes = new Set(sorted.map((c) => resolveType(c.type)));
  const legend = Array.from(usedTypes)
    .map((t) => `${TYPE_LABELS[t]} (${TYPE_DEFS[t]})`)
    .join(", ");

  const sections: string[] = [
    "I reviewed your code and have the following comments. Please address them.",
    "",
    `Comment types: ${legend}`,
    "",
  ];

  sorted.forEach((c, idx) => {
    sections.push(formatComment(idx + 1, c));
  });

  return sections.join("\n");
}

// Compact format optimized for LLM consumption:
//   - The first body line stays inline with the header (single line for the
//     common short-comment case — no wasted vertical space).
//   - EVERY subsequent line is indented to align with the start of content
//     after the marker — 3 spaces for items 1–9, 4 for 10–99, etc. — so that
//     CommonMark keeps continuation paragraphs inside the list item.
//   - Blank lines stay blank (no trailing whitespace).
//   - Excess blank lines (3+ consecutive newlines) collapse to one paragraph
//     break.
function formatComment(n: number, c: Comment): string {
  const type = resolveType(c.type);
  const tag = `[${TYPE_LABELS[type]}]`;
  const loc = formatLocation(c);
  const body = c.body.trim().replace(/\n{3,}/g, "\n\n");
  // Width of the marker prefix `${n}. ` — needs matching indent on continuation
  // lines for two-digit list numbers.
  const indent = " ".repeat(`${n}. `.length);

  const lines = body.split("\n");
  const head = `${n}. ${tag} - ${loc} - ${lines[0] ?? ""}`;
  if (lines.length === 1) return head;

  const tail = lines
    .slice(1)
    .map((line) => (line.length === 0 ? "" : indent + line))
    .join("\n");
  return `${head}\n${tail}`;
}

function formatLocation(c: Comment): string {
  if (c.file === null) return "_(review)_";
  if (c.startLine === null) return `\`${c.file}\``;
  if (c.endLine === null || c.endLine === c.startLine) {
    return `\`${c.file}:${c.startLine}\``;
  }
  return `\`${c.file}:${c.startLine}-${c.endLine}\``;
}
