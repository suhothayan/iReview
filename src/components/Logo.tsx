// Inline favicon — same paths as public/favicon.svg, but as a React component
// so it can adapt to theme (currentColor) and inherit the accent CSS variable.
export function Logo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`${className} text-fg`}
    >
      <circle cx="26" cy="26" r="20" stroke="currentColor" strokeWidth="4" />
      <line x1="41" y1="41" x2="56" y2="56" stroke="currentColor" strokeWidth="6" />
      <line x1="9" y1="20" x2="13" y2="20" stroke="#e53e3e" strokeWidth="2.6" />
      <line x1="16" y1="20" x2="36" y2="20" stroke="#e53e3e" strokeWidth="2.6" />
      <line x1="9" y1="28" x2="13" y2="28" stroke="#38a169" strokeWidth="2.6" />
      <line x1="11" y1="26" x2="11" y2="30" stroke="#38a169" strokeWidth="2.6" />
      <line x1="16" y1="28" x2="38" y2="28" stroke="#38a169" strokeWidth="2.6" />
      <line
        x1="16"
        y1="36"
        x2="32"
        y2="36"
        stroke="currentColor"
        strokeWidth="2.4"
        opacity="0.55"
      />
      <circle cx="40" cy="13" r="3.2" fill="rgb(var(--accent))" />
    </svg>
  );
}
