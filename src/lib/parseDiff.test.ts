import { describe, expect, it } from "vitest";
import { parseDiff } from "./parseDiff";

describe("parseDiff", () => {
  it("parses a simple modification with one hunk", () => {
    const diff = `diff --git a/foo.ts b/foo.ts
index abc1234..def5678 100644
--- a/foo.ts
+++ b/foo.ts
@@ -1,3 +1,4 @@
 line one
-line two
+line two updated
+line three new
 line four
`;
    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("foo.ts");
    expect(files[0].status).toBe("modified");
    expect(files[0].hunks).toHaveLength(1);

    const hunk = files[0].hunks[0];
    expect(hunk.oldStart).toBe(1);
    expect(hunk.newStart).toBe(1);
    expect(hunk.lines).toHaveLength(5);

    const kinds = hunk.lines.map((l) => l.kind);
    expect(kinds).toEqual(["context", "del", "add", "add", "context"]);
  });

  it("parses an added file (status='added')", () => {
    const diff = `diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+hello
+world
`;
    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe("added");
    expect(files[0].path).toBe("new.txt");
    expect(files[0].oldPath).toBeNull();
    expect(files[0].newPath).toBe("new.txt");
  });

  it("parses a deleted file (status='deleted')", () => {
    const diff = `diff --git a/gone.txt b/gone.txt
deleted file mode 100644
index 1234567..0000000
--- a/gone.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-bye
-world
`;
    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe("deleted");
    expect(files[0].oldPath).toBe("gone.txt");
    expect(files[0].newPath).toBeNull();
  });

  it("parses a renamed file (status='renamed')", () => {
    const diff = `diff --git a/old/path.ts b/new/path.ts
similarity index 95%
rename from old/path.ts
rename to new/path.ts
index 1234567..7654321 100644
--- a/old/path.ts
+++ b/new/path.ts
@@ -1,3 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 3;
 const z = 4;
`;
    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe("renamed");
    expect(files[0].path).toBe("new/path.ts");
  });

  it("parses multiple files in one diff", () => {
    const diff = `diff --git a/a.ts b/a.ts
index 111..222 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old a
+new a
diff --git a/b.ts b/b.ts
index 333..444 100644
--- a/b.ts
+++ b/b.ts
@@ -1 +1 @@
-old b
+new b
`;
    const files = parseDiff(diff);
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("parses a hunk with multiple ranges", () => {
    const diff = `diff --git a/multi.ts b/multi.ts
index 111..222 100644
--- a/multi.ts
+++ b/multi.ts
@@ -1,3 +1,3 @@
 a
-b
+B
 c
@@ -10,3 +10,3 @@
 x
-y
+Y
 z
`;
    const files = parseDiff(diff);
    expect(files[0].hunks).toHaveLength(2);
    expect(files[0].hunks[0].oldStart).toBe(1);
    expect(files[0].hunks[1].oldStart).toBe(10);
  });

  it("ignores '\\ No newline at end of file' marker", () => {
    const diff = `diff --git a/eof.ts b/eof.ts
index 111..222 100644
--- a/eof.ts
+++ b/eof.ts
@@ -1,1 +1,1 @@
-old
\\ No newline at end of file
+new
\\ No newline at end of file
`;
    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    const lines = files[0].hunks[0].lines;
    expect(lines.map((l) => l.kind)).toEqual(["del", "add"]);
    expect(lines.find((l) => l.kind === "del")?.text).toBe("old");
    expect(lines.find((l) => l.kind === "add")?.text).toBe("new");
  });

  it("handles single-line hunk shorthand (@@ -N +M @@)", () => {
    const diff = `diff --git a/short.ts b/short.ts
index 111..222 100644
--- a/short.ts
+++ b/short.ts
@@ -5 +5 @@
-old
+new
`;
    const files = parseDiff(diff);
    const hunk = files[0].hunks[0];
    expect(hunk.oldStart).toBe(5);
    expect(hunk.oldLines).toBe(1);
    expect(hunk.newStart).toBe(5);
    expect(hunk.newLines).toBe(1);
  });

  it("returns empty array for empty input", () => {
    expect(parseDiff("")).toEqual([]);
    expect(parseDiff("\n")).toEqual([]);
  });

  it("parses a 100%-similarity rename with no ---/+++ lines", () => {
    const diff = `diff --git a/old.txt b/new.txt
similarity index 100%
rename from old.txt
rename to new.txt
`;
    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe("renamed");
    expect(files[0].oldPath).toBe("old.txt");
    expect(files[0].newPath).toBe("new.txt");
    expect(files[0].path).toBe("new.txt");
    expect(files[0].hunks).toEqual([]);
  });

  it("parses a binary-file diff", () => {
    const diff = `diff --git a/logo.png b/logo.png
index abc..def 100644
Binary files a/logo.png and b/logo.png differ
`;
    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("logo.png");
    expect(files[0].oldPath).toBe("logo.png");
    expect(files[0].newPath).toBe("logo.png");
    expect(files[0].binary).toBe(true);
    expect(files[0].hunks).toEqual([]);
  });

  it("parses a binary file addition", () => {
    const diff = `diff --git a/new.bin b/new.bin
new file mode 100644
index 0000000..abc
Binary files /dev/null and b/new.bin differ
`;
    const files = parseDiff(diff);
    expect(files[0].status).toBe("added");
    expect(files[0].binary).toBe(true);
    expect(files[0].path).toBe("new.bin");
  });

  it("parses a mode-only change (no content)", () => {
    const diff = `diff --git a/script.sh b/script.sh
old mode 100644
new mode 100755
`;
    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe("mode-changed");
    expect(files[0].path).toBe("script.sh");
    expect(files[0].hunks).toEqual([]);
  });

  it("handles paths containing 'b/' as a substring", () => {
    const diff = `diff --git a/sub/b/foo b/sub/b/foo
index 111..222 100644
--- a/sub/b/foo
+++ b/sub/b/foo
@@ -1 +1 @@
-old
+new
`;
    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("sub/b/foo");
  });

  it("falls back to header path extraction when ---/+++ are absent", () => {
    const diff = `diff --git a/path/with/many/segments.ts b/path/with/many/segments.ts
old mode 100644
new mode 100755
`;
    const files = parseDiff(diff);
    expect(files[0].path).toBe("path/with/many/segments.ts");
  });

  it("ignores '\\ No newline' marker even without trailing space", () => {
    const diff = `diff --git a/eof.ts b/eof.ts
index 111..222 100644
--- a/eof.ts
+++ b/eof.ts
@@ -1,1 +1,1 @@
-old
\\ No newline at end of file
+new
\\No newline at end of file
`;
    const files = parseDiff(diff);
    const lines = files[0].hunks[0].lines;
    expect(lines.map((l) => l.kind)).toEqual(["del", "add"]);
    expect(lines[0].text).toBe("old");
    expect(lines[1].text).toBe("new");
  });

  it("assigns correct line numbers across context/add/del", () => {
    const diff = `diff --git a/numbers.ts b/numbers.ts
index 111..222 100644
--- a/numbers.ts
+++ b/numbers.ts
@@ -10,4 +10,5 @@
 a
-b
+B1
+B2
 c
 d
`;
    const lines = parseDiff(diff)[0].hunks[0].lines;
    // Expected:  ctx(10/10) del(11/-) add(-/11) add(-/12) ctx(12/13) ctx(13/14)
    expect(lines.map((l) => [l.kind, l.oldNo, l.newNo])).toEqual([
      ["context", 10, 10],
      ["del", 11, null],
      ["add", null, 11],
      ["add", null, 12],
      ["context", 12, 13],
      ["context", 13, 14],
    ]);
  });

  it("handles git-quoted paths in ---/+++ headers (paths with spaces)", () => {
    // git wraps paths in double-quotes when they contain spaces or non-ASCII.
    const diff = `diff --git "a/has space.ts" "b/has space.ts"
index 111..222 100644
--- "a/has space.ts"
+++ "b/has space.ts"
@@ -1 +1 @@
-old
+new
`;
    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("has space.ts");
    expect(files[0].oldPath).toBe("has space.ts");
    expect(files[0].newPath).toBe("has space.ts");
  });
});
