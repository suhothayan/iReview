// Stable DOM id for the wrapping div around a file's diff section in scroll-all view.
// Used to scroll to / observe specific files.
//
// btoa() doesn't accept arbitrary unicode, so encode UTF-8 first via TextEncoder
// (replaces the deprecated `unescape(encodeURIComponent(...))` idiom). Strip any
// non-alphanumerics so the result is a safe HTML id even with an unusual hash
// character set.
export function fileSectionId(path: string): string {
  const bytes = new TextEncoder().encode(path);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `file-${btoa(binary).replace(/[^A-Za-z0-9]/g, "")}`;
}
