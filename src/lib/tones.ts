// Shared tone palette for "selection kind" indicators (the orange/blue/yellow
// you see on UNSTAGED / STAGED badges in the picker and on chips in the
// toolbar). Keep these in one place so they don't drift.

export type SelectionKind = "commit" | "stage" | "unstage";

const PALETTE: Record<SelectionKind, string> = {
  commit:
    "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-800",
  unstage:
    "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-800",
  stage:
    "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-800",
};

export function chipTone(kind: SelectionKind): string {
  return PALETTE[kind];
}

// Slightly different shape used for the small "badge" pills inside the picker
// rows (UNSTAGED / STAGED). Same color tokens, lighter weight.
const BADGE_PALETTE: Record<SelectionKind, string> = {
  commit:
    "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700/60",
  unstage:
    "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700/60",
  stage:
    "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700/60",
};

export function badgeTone(kind: SelectionKind): string {
  return BADGE_PALETTE[kind];
}
