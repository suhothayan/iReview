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
    const md = exportReview([c({ type: "issue", body: "i" })]);
    expect(md).toContain("ISSUE");
    expect(md).not.toContain("SUGGESTION");
    expect(md).not.toContain("PRAISE");
  });

  it("includes the leading instruction", () => {
    const md = exportReview([c({ body: "hi" })]);
    expect(md.startsWith(
      "I reviewed your code and have the following comments. Please address them.",
    )).toBe(true);
  });
});
