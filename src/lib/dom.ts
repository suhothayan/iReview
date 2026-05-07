// Stable DOM id for the wrapping div around a file's diff section in scroll-all view.
// Used to scroll to / observe specific files.
export function fileSectionId(path: string): string {
  return `file-${btoa(unescape(encodeURIComponent(path))).replace(/[^A-Za-z0-9]/g, "")}`;
}
