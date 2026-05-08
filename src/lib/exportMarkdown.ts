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

// Continuation indent for ordered-list items. CommonMark needs at least 3
// spaces so a paragraph aligns with the content after a `1. ` marker; this
// works for both 1- and 2-digit list numbers.
const LIST_INDENT = "   ";

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

  const usedTypes = new Set(sorted.map((c) => c.type));
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
//   - EVERY subsequent line is indented 3 spaces, regardless of whether it
//     was reached by a soft wrap (single newline) or a paragraph break
//     (blank line). Blank lines stay blank (no trailing whitespace) so the
//     paragraph break is preserved.
//   - Excess blank lines (3+ consecutive newlines) collapse to a single
//     paragraph break — the user typed too many returns.
function formatComment(n: number, c: Comment): string {
  const tag = `[${TYPE_LABELS[c.type]}]`;
  const loc = formatLocation(c);
  const body = c.body.trim().replace(/\n{3,}/g, "\n\n");

  const lines = body.split("\n");
  const head = `${n}. ${tag} - ${loc} - ${lines[0] ?? ""}`;
  if (lines.length === 1) return head;

  const tail = lines
    .slice(1)
    .map((line) => (line.length === 0 ? "" : LIST_INDENT + line))
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
