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

  it("indents soft-wrapped continuation lines (single newline)", () => {
    const md = exportReview([
      c({
        file: "a.ts",
        startLine: 1,
        body: "Foo\nbar",
      }),
    ]);
    // Every line after the first stays anchored to the list item via the
    // 3-space indent, even when separated by just a single newline.
    expect(md).toContain("1. [SUGGESTION] - `a.ts:1` - Foo\n   bar");
  });

  it("indents both soft-wrap and paragraph-break lines uniformly", () => {
    const md = exportReview([
      c({
        file: "a.ts",
        startLine: 1,
        body: "first line\nsoft-wrap\n\nsecond paragraph",
      }),
    ]);
    expect(md).toContain(
      "1. [SUGGESTION] - `a.ts:1` - first line\n   soft-wrap\n\n   second paragraph",
    );
  });

  it("collapses excessive blank lines between paragraphs", () => {
    const md = exportReview([
      c({
        file: "a.ts",
        startLine: 1,
        body: "first\n\n\n\n\nsecond",
      }),
    ]);
    // 5 newlines (= 4 blank lines) collapse to one paragraph break.
    expect(md).toContain("1. [SUGGESTION] - `a.ts:1` - first\n\n   second");
    expect(md).not.toContain("\n\n\n");
  });

  it("indents items 10+ with 4 spaces (matching marker width)", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      c({
        id: `id${i}`,
        file: "a.ts",
        startLine: i + 1,
        body: "first paragraph\n\nsecond paragraph",
      }),
    );
    const md = exportReview(many);
    // Item 1: 3-space indent.
    expect(md).toContain(
      "1. [SUGGESTION] - `a.ts:1` - first paragraph\n\n   second paragraph",
    );
    // Items 10-12: 4-space indent (matches "10. ").
    expect(md).toContain(
      "10. [SUGGESTION] - `a.ts:10` - first paragraph\n\n    second paragraph",
    );
    expect(md).toContain(
      "11. [SUGGESTION] - `a.ts:11` - first paragraph\n\n    second paragraph",
    );
    expect(md).toContain(
      "12. [SUGGESTION] - `a.ts:12` - first paragraph\n\n    second paragraph",
    );
  });

  it("falls back gracefully on legacy comment types", () => {
    // Pre-rename types: 'issue' → must-fix; 'praise' → note; bogus → suggestion.
    const md = exportReview([
      c({ type: "issue" as never, file: "a.ts", startLine: 1, body: "old issue" }),
      c({ type: "praise" as never, file: "a.ts", startLine: 2, body: "old praise" }),
      c({ type: "bogus" as never, file: "a.ts", startLine: 3, body: "weird" }),
    ]);
    expect(md).not.toContain("[undefined]");
    expect(md).not.toContain("undefined (");
    expect(md).toContain("[MUST FIX]");
    expect(md).toContain("[NOTE]");
    expect(md).toContain("[SUGGESTION]");
  });
});
