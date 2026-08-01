"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { SiGithub, SiLinear } from "react-icons/si";
import { FaSlack } from "react-icons/fa";
import { Building2, Mic } from "lucide-react";

/**
 * The hero's right-side visual: a small, self-playing loop of the actual
 * mechanic — a spoken prompt, a pull across four sources, a cluster forming,
 * and one cited sentence rendering. No JSON, no code, just the shape judges
 * will see live at /demo.
 */
export function LiveReveal() {
  const promptRef = useRef<HTMLDivElement>(null);
  const sourcesRef = useRef<HTMLDivElement>(null);
  const clusterRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const prompt = promptRef.current;
    const sources = sourcesRef.current;
    const cluster = clusterRef.current;
    const result = resultRef.current;
    if (!prompt || !sources || !cluster || !result) return;

    const icons = Array.from(sources.querySelectorAll<HTMLElement>("[data-source-icon]"));

    if (reduced) {
      gsap.set([prompt, cluster], { opacity: 1, y: 0 });
      gsap.set(icons, { opacity: 1 });
      gsap.set(result, { opacity: 1, y: 0 });
      return;
    }

    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.5, delay: 0.6 });

    tl.set([prompt, cluster, result], { opacity: 0, y: 8 })
      .set(icons, { opacity: 0.25 })
      .to(prompt, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" })
      .to({}, { duration: 0.35 })
      .to(icons, { opacity: 1, stagger: 0.12, duration: 0.25 })
      .to(cluster, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, "-=0.1")
      .to(result, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, "+=0.15")
      .to({}, { duration: 2.1 })
      .to([prompt, result], { opacity: 0, y: -6, duration: 0.3, ease: "power2.in" })
      .to(cluster, { opacity: 0, duration: 0.3 }, "<")
      .to(icons, { opacity: 0.25, duration: 0.3 }, "<");

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

      <div className="mt-5 space-y-3">
        <div ref={promptRef} className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2/50 p-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15">
            <Mic className="h-3 w-3 text-accent" />
          </span>
          <p className="text-[13px] text-text">&ldquo;Status check on Daniel&rdquo;</p>
        </div>

        <div ref={sourcesRef} className="flex items-center justify-center gap-4 py-1">
          <span data-source-icon>
            <FaSlack className="h-4 w-4" style={{ color: "#611f69" }} />
          </span>
          <span data-source-icon>
            <SiLinear className="h-4 w-4" style={{ color: "#5e6ad2" }} />
          </span>
          <span data-source-icon>
            <SiGithub className="h-4 w-4 text-text" />
          </span>
          <span data-source-icon>
            <Building2 className="h-4 w-4" style={{ color: "#0369a1" }} />
          </span>
        </div>

        <div ref={clusterRef} className="flex justify-center">
          <span className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent">
            Cluster: Auth migration
          </span>
        </div>
      </div>

      <div ref={resultRef} className="mt-4 border-t border-border pt-4 opacity-0">
        <p className="text-[13px] leading-relaxed text-text">
          Migrated session tokens off the legacy cookie format — opened, reviewed twice, merged,
          rolled out.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-2.5 py-1 text-[11px] text-muted">
            <SiLinear className="h-3 w-3" style={{ color: "#5e6ad2" }} />
            ENG-412
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-2.5 py-1 text-[11px] text-muted">
            <SiGithub className="h-3 w-3 text-text" />
            #482
          </span>
        </div>
      </div>
    </div>
  );
}
