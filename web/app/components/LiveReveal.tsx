"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * The hero's right-side visual: a small, self-playing demo of the actual
 * mechanic — a Slack message getting confirmed against a Linear ticket, then
 * credited — with no code or JSON on screen. Reuses the same seeded fixture
 * (Maria / Chen / ENG-412) as the interactive #proof section below, so this
 * reads as a preview of it, not a different story.
 */
export function LiveReveal() {
  const pulseRef = useRef<HTMLDivElement>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pulse = pulseRef.current;
    const ticket = ticketRef.current;
    const result = resultRef.current;
    if (!pulse || !ticket || !result) return;

    if (reduced) {
      gsap.set(pulse, { opacity: 0 });
      gsap.set(result, { opacity: 1, y: 0 });
      return;
    }

    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.4, delay: 0.6 });

    tl.set(pulse, { top: "0%", opacity: 1 })
      .set(result, { opacity: 0, y: 8 })
      .set(ticket, { backgroundColor: "rgba(15,107,79,0)" })
      .to(pulse, { top: "100%", duration: 0.9, ease: "power1.inOut" })
      .to(pulse, { opacity: 0, duration: 0.15 }, "-=0.05")
      .to(ticket, { backgroundColor: "rgba(15,107,79,0.08)", duration: 0.25 }, "-=0.1")
      .to(result, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, "-=0.05")
      .to({}, { duration: 1.9 })
      .to(result, { opacity: 0, y: -6, duration: 0.3, ease: "power2.in" })
      .to(ticket, { backgroundColor: "rgba(15,107,79,0)", duration: 0.3 }, "<");

    return () => {
      tl.kill();
    };
  }, []);

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.25)] sm:p-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-wide text-muted uppercase">
          Live example
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60 motion-reduce:hidden" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          auto-playing
        </span>
      </div>

      <div className="mt-5">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2/50 p-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#611f69] text-[11px] font-semibold text-white">
            S
          </span>
          <div className="min-w-0">
            <p className="text-[13px] leading-snug text-text">
              <span className="font-medium">Maria</span> — &ldquo;looked into this, see{" "}
              <span className="font-mono text-accent">ENG-412</span>, should be a one-line
              fix&rdquo;
            </p>
            <p className="mt-1 text-[11px] text-muted">#eng-help · 10:00am</p>
          </div>
        </div>

        <div className="relative ml-[27px] h-8 w-px bg-border">
          <div
            ref={pulseRef}
            className="absolute -left-[3px] h-[7px] w-[7px] rounded-full bg-accent opacity-0"
          />
        </div>

        <div
          ref={ticketRef}
          className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors"
        >
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#5e6ad2] text-[11px] font-semibold text-white">
            L
          </span>
          <div className="min-w-0">
            <p className="text-[13px] leading-snug text-text">
              <span className="font-mono text-accent">ENG-412</span> — assigned to{" "}
              <span className="font-medium">Chen</span>
            </p>
            <p className="mt-1 text-[11px] text-muted">closed 2h14m later</p>
          </div>
        </div>
      </div>

      <div ref={resultRef} className="mt-4 flex items-center gap-2.5 opacity-0">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m5 13 4 4L19 7"
              stroke="#0f6b4f"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <p className="text-[13px] text-text">
          <span className="font-medium">Confirmed</span> — Maria unblocked Chen
        </p>
        <span className="ml-auto shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white">
          +1 credited
        </span>
      </div>
    </div>
  );
}
