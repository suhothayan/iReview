import type { Comment, CommentType } from "../types";

const TYPE_LABELS: Record<CommentType, string> = {
  issue: "ISSUE",
  suggestion: "SUGGESTION",
  note: "NOTE",
  praise: "PRAISE",
};

const TYPE_DEFS: Record<CommentType, string> = {
  issue: "problems to fix",
  suggestion: "improvements",
  note: "observations",
  praise: "positive feedback",
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
//   - First body paragraph stays inline with the header (one line for the
//     common short-comment case — no wasted vertical space).
//   - Additional paragraphs drop to indented continuation blocks (3 spaces
//     + blank line separator) so they stay anchored to the list item
//     instead of breaking out of the numbered list.
function formatComment(n: number, c: Comment): string {
  const tag = `[${TYPE_LABELS[c.type]}]`;
  const loc = formatLocation(c);
  const body = c.body.trim();

  const paragraphs = splitParagraphs(body);
  const first = paragraphs[0] ?? "";
  const rest = paragraphs.slice(1);

  const head = `${n}. ${tag} - ${loc} - ${first}`;
  if (rest.length === 0) return head;

  const tail = rest
    .map((p) =>
      p
        .split("\n")
        .map((line) => (line.length === 0 ? "" : LIST_INDENT + line))
        .join("\n"),
    )
    .join("\n\n");

  return `${head}\n\n${tail}`;
}

// Split a body into paragraphs separated by one or more blank lines. Whitespace
// inside a paragraph is preserved (so multi-line code in a single paragraph
// stays on consecutive lines).
function splitParagraphs(body: string): string[] {
  return body
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function formatLocation(c: Comment): string {
  if (c.file === null) return "_(review)_";
  if (c.startLine === null) return `\`${c.file}\``;
  if (c.endLine === null || c.endLine === c.startLine) {
    return `\`${c.file}:${c.startLine}\``;
  }
  return `\`${c.file}:${c.startLine}-${c.endLine}\``;
}
