import type { ReactNode } from "react";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-md border border-border bg-surface-2 px-2.5 py-1 font-mono text-[11px] tracking-wide text-muted uppercase">
      {children}
    </span>
  );
}

/**
 * Section heading in the display serif, with an optional standfirst underneath.
 */
export function SectionHead({
  eyebrow,
  children,
  sub,
}: {
  eyebrow: string;
  children: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 font-display text-4xl leading-[1.1] sm:text-[42px]">{children}</h2>
      {sub && <p className="mt-3 text-[15px] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

/**
 * Hairline grid of cards that reads as one table rather than floating tiles —
 * inner borders only, so the group shares a single outer frame.
 */
export function CardGrid({
  columns = 3,
  children,
}: {
  columns?: 2 | 3 | 4;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid overflow-hidden rounded-xl border border-border bg-surface sm:grid-cols-2 ${
        columns === 3 ? "lg:grid-cols-3" : columns === 4 ? "lg:grid-cols-4" : ""
      }`}
    >
      {children}
    </div>
  );
}

export function FeatureCard({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-border p-6 transition last:border-b-0 hover:bg-surface-2/50 sm:border-r sm:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(3n)]:border-r-0">
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-medium text-text">{title}</h3>
        {badge && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[10px] tracking-wide text-accent uppercase">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

export function DetailSection({
  eyebrow,
  heading,
  children,
  visual,
  reverse = false,
  band = false,
}: {
  eyebrow: string;
  heading: string;
  children: ReactNode;
  visual: ReactNode;
  reverse?: boolean;
  /** Warm cream band, used to break up long runs of white. */
  band?: boolean;
}) {
  return (
    <section className={band ? "bg-surface-2/60 py-24" : "py-24"}>
      <div className="mx-auto max-w-6xl px-6">
        <div
          className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${
            reverse ? "lg:[&>*:first-child]:order-2" : ""
          }`}
        >
          <div>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h2 className="mt-4 font-display text-3xl leading-[1.15] sm:text-4xl">{heading}</h2>
            <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-muted">
              {children}
            </div>
          </div>
          <div>{visual}</div>
        </div>
      </div>
    </section>
  );
}

export function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border-b border-border py-4 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] text-text">
        {q}
        <span className="shrink-0 text-muted transition group-open:rotate-45">+</span>
      </summary>
      <p className="faq-answer mt-2 max-w-2xl text-sm leading-relaxed text-muted">{a}</p>
    </details>
  );
}
