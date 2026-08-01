/**
 * The Receipts mark: a torn-edge receipt strip with two line items — the
 * same shape the product hands back for every claim it makes. Single source
 * of truth for every placement on the site.
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
      aria-label={withWordmark ? undefined : "Receipts"}
    >
      <path
        d="M6 3 L18 3 L18 15 L16.5 17 L15 15 L13.5 17 L12 15 L10.5 17 L9 15 L7.5 17 L6 15 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8.5 7h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M8.5 10.2h4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );

  if (!withWordmark) return <span className={className}>{mark}</span>;

  return (
    <span className={`flex items-center gap-2 ${className}`}>
      {mark}
      <span className="font-mono text-sm tracking-tight">receipts</span>
    </span>
  );
}
