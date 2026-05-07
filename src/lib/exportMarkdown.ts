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

  const header =
    "I reviewed your code and have the following comments. Please address them.";
  const lines: string[] = [header, "", `Comment types: ${legend}`, ""];

  sorted.forEach((c, idx) => {
    const tag = `**[${TYPE_LABELS[c.type]}]**`;
    const loc = formatLocation(c);
    const body = c.body.trim();
    lines.push(`${idx + 1}. ${tag} ${loc} - ${body}`);
  });

  return lines.join("\n");
}

function formatLocation(c: Comment): string {
  if (c.file === null) return "_(review)_";
  if (c.startLine === null) return `\`${c.file}\``;
  if (c.endLine === null || c.endLine === c.startLine) {
    return `\`${c.file}:${c.startLine}\``;
  }
  return `\`${c.file}:${c.startLine}-${c.endLine}\``;
}
