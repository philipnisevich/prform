/**
 * The Witness mark: a ring with a confirmed check inside — the same glyph the
 * product itself uses for a confirmed attribution. Single source of truth for
 * every placement on the site.
 */
export function Logo({
  height = 18,
  withWordmark = true,
  className = "",
}: {
  height?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  const mark = (
    <svg
      width={height}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={withWordmark}
      role={withWordmark ? undefined : "img"}
      aria-label={withWordmark ? undefined : "Witness"}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="m7.5 12.5 3 3 6-6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (!withWordmark) return <span className={className}>{mark}</span>;

  return (
    <span className={`flex items-center gap-2 ${className}`}>
      {mark}
      <span className="font-mono text-sm tracking-tight">witness</span>
    </span>
  );
}
