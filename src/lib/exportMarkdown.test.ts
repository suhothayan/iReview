import { describe, expect, it } from "vitest";
import { exportReview } from "./exportMarkdown";
import type { Comment } from "../types";

const c = (over: Partial<Comment>): Comment => ({
  id: over.id ?? "id",
  type: over.type ?? "suggestion",
  body: over.body ?? "body",
  file: over.file ?? null,
  startLine: over.startLine ?? null,
  endLine: over.endLine ?? null,
  side: over.side ?? "new",
  createdAt: over.createdAt ?? 0,
});

describe("exportReview", () => {
  it("returns empty string when no comments", () => {
    expect(exportReview([])).toBe("");
  });

  it("orders by file alphabetically, then by startLine", () => {
    const md = exportReview([
      c({ id: "1", file: "z.ts", startLine: 10, body: "z10" }),
      c({ id: "2", file: "a.ts", startLine: 50, body: "a50" }),
      c({ id: "3", file: "a.ts", startLine: 5, body: "a5" }),
    ]);
    const lines = md.split("\n").filter((l) => /^\d+\./.test(l));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("`a.ts:5`");
    expect(lines[1]).toContain("`a.ts:50`");
    expect(lines[2]).toContain("`z.ts:10`");
  });

  it("review-level comments (file=null) sort before file comments", () => {
    const md = exportReview([
      c({ id: "1", file: "a.ts", startLine: 1, body: "file" }),
      c({ id: "2", file: null, body: "review" }),
    ]);
    const lines = md.split("\n").filter((l) => /^\d+\./.test(l));
    expect(lines[0]).toContain("(review)");
    expect(lines[1]).toContain("`a.ts:1`");
  });

  it("formats line ranges as 'file:start-end'", () => {
    const md = exportReview([
      c({ file: "x.ts", startLine: 10, endLine: 20, body: "range" }),
    ]);
    expect(md).toContain("`x.ts:10-20`");
  });

  it("formats single line as 'file:N' (when start === end)", () => {
    const md = exportReview([
      c({ file: "x.ts", startLine: 7, endLine: 7, body: "one" }),
    ]);
    expect(md).toContain("`x.ts:7`");
    expect(md).not.toContain("7-7");
  });

  it("formats file-level comment as just 'file'", () => {
    const md = exportReview([
      c({ file: "x.ts", startLine: null, body: "filey" }),
    ]);
    expect(md).toContain("`x.ts`");
    expect(md).not.toContain("`x.ts:`");
  });

  it("only emits legend types that appear in the comments", () => {
    const md = exportReview([c({ type: "must-fix", body: "i" })]);
    expect(md).toContain("MUST FIX");
    expect(md).not.toContain("SUGGESTION");
    expect(md).not.toContain("NOTE");
  });

  it("includes the leading instruction", () => {
    const md = exportReview([c({ body: "hi" })]);
    expect(
      md.startsWith(
        "I reviewed your code and have the following comments. Please address them.",
      ),
    ).toBe(true);
  });

  // ----- new compact-format tests -----

  it("uses [TYPE] tags without bold markers", () => {
    const md = exportReview([
      c({ type: "suggestion", file: "a.ts", startLine: 1, body: "x" }),
    ]);
    expect(md).toContain("[SUGGESTION]");
    expect(md).not.toContain("**[");
    expect(md).not.toContain("**SUGGESTION");
  });

  it("uses '-' separators between marker / tag / location / body", () => {
    const md = exportReview([
      c({ type: "must-fix", file: "a.ts", startLine: 5, body: "fix" }),
    ]);
    // Should look like: `1. [MUST FIX] - \`a.ts:5\` - fix`
    expect(md).toContain("1. [MUST FIX] - `a.ts:5` - fix");
  });

  it("inlines a single-paragraph body on the header line", () => {
    const md = exportReview([
      c({ file: "a.ts", startLine: 1, body: "single paragraph body" }),
    ]);
    const itemLine = md
      .split("\n")
      .find((l) => l.startsWith("1. ")) ?? "";
    expect(itemLine).toBe("1. [SUGGESTION] - `a.ts:1` - single paragraph body");
  });

  it("hoists multi-paragraph bodies into indented continuation blocks", () => {
    const md = exportReview([
      c({
        file: "a.ts",
        startLine: 1,
        body: "first paragraph\n\nsecond paragraph\n\nthird paragraph",
      }),
    ]);
    // First paragraph stays inline with the header.
    expect(md).toContain("1. [SUGGESTION] - `a.ts:1` - first paragraph");
    // Subsequent paragraphs are indented with 3 spaces.
    expect(md).toContain("\n   second paragraph\n");
    expect(md).toContain("\n   third paragraph");
    // And separated by blank lines.
    expect(md).toContain("\n\n   second paragraph");
    expect(md).toContain("\n\n   third paragraph");
  });

  it("preserves whitespace inside a single paragraph (e.g. multi-line code)", () => {
    const md = exportReview([
      c({
        file: "a.ts",
        startLine: 1,
        body: "use\nthis instead",
      }),
    ]);
    // Single paragraph (no blank line splits) is treated as one paragraph;
    // the literal newline ends up inline since there are no separator
    // blank lines. We just assert nothing weird happens.
    expect(md).toContain("1. [SUGGESTION] - `a.ts:1` - use\nthis instead");
  });

  it("collapses excessive blank lines between paragraphs", () => {
    const md = exportReview([
      c({
        file: "a.ts",
        startLine: 1,
        body: "first\n\n\n\n\nsecond",
      }),
    ]);
    // Multiple blank lines collapse into one paragraph break (not 5).
    expect(md).toContain("1. [SUGGESTION] - `a.ts:1` - first\n\n   second");
    expect(md).not.toContain("   \n   ");
  });
});
