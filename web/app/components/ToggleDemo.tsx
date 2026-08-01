"use client";

import { useState } from "react";

type SourceId = "slack" | "github" | "linear" | "gmail";

const SOURCES: { id: SourceId; label: string }[] = [
  { id: "slack", label: "Slack" },
  { id: "github", label: "GitHub" },
  { id: "linear", label: "Linear" },
  { id: "gmail", label: "Gmail" },
];

/**
 * Mirrors public.run_degradation() in
 * migrations/20260728182007_source-scoped-views.sql exactly: rule (a) needs
 * slack plus a ticket source, rule (b) needs github. This run's one seeded
 * finding (Maria → ENG-412) only ever resolves through rule (a).
 */
function ruleAAvailable(enabled: Set<SourceId>) {
  return enabled.has("slack") && (enabled.has("linear") || enabled.has("github"));
}
function ruleBAvailable(enabled: Set<SourceId>) {
  return enabled.has("github");
}

export function ToggleDemo() {
  const [enabled, setEnabled] = useState<Set<SourceId>>(
    new Set(["slack", "github", "linear", "gmail"]),
  );

  const toggle = (id: SourceId) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const aAvailable = ruleAAvailable(enabled);
  const bAvailable = ruleBAvailable(enabled);
  const confirmed = aAvailable && enabled.has("linear");

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {SOURCES.map((s) => {
          const on = enabled.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              aria-pressed={on}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                on
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-surface text-muted hover:text-text"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-center text-xs text-muted">
        This is the real thing — same finding, same data. Turn a source off and watch it react.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.18)] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold text-text">
              MO
            </span>
            <div>
              <p className="text-[14px] font-medium text-text">Maria Okonkwo</p>
              <p className="text-[11px] text-muted">this run</p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              confirmed ? "bg-accent/15 text-accent" : "bg-[#b8842c]/15 text-[#b8842c]"
            }`}
          >
            {confirmed ? "Confirmed" : "Unconfirmed"}
          </span>
        </div>

        <div className="mt-5">
          {confirmed ? (
            <>
              <p className="text-[15px] leading-relaxed text-text">
                Unblocked <span className="font-medium">Chen</span> on{" "}
                <span className="font-medium">ENG-412</span> — her Slack message landed two
                hours before the ticket closed.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-3 py-1 text-[12px] text-muted">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#611f69] text-[9px] font-semibold text-white">
                    S
                  </span>
                  Slack message
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-3 py-1 text-[12px] text-muted">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#5e6ad2] text-[9px] font-semibold text-white">
                    L
                  </span>
                  Linear ticket
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="text-[15px] leading-relaxed text-text">
                {aAvailable
                  ? "Linear is off, so there's no ticket left to check this against — the rule isn't skipping it, it just has nothing to check."
                  : "No ticket or commit source is turned on at all."}{" "}
                A single-connector tool would now call Maria a low contributor.
              </p>
              <p className="mt-3 text-[13px] text-muted">0 confirmed findings, down from 1.</p>
            </>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] ${
              aAvailable ? "bg-accent/10 text-accent" : "bg-surface-2 text-muted"
            }`}
          >
            {aAvailable ? "✓" : "—"} Can check for unblocks
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] ${
              bAvailable ? "bg-accent/10 text-accent" : "bg-surface-2 text-muted"
            }`}
          >
            {bAvailable ? "✓" : "—"} Can check for reviews
          </span>
        </div>
      </div>
    </div>
  );
}
