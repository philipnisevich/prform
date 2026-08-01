"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Owns both Lenis and GSAP/ScrollTrigger, because the two have to share a clock.
 * Lenis animates scroll position on its own RAF; if ScrollTrigger keeps its own,
 * trigger positions resolve against a stale scroll value and reveals fire early
 * or late. So Lenis runs off the GSAP ticker (autoRaf: false) and pushes every
 * scroll into ScrollTrigger.update.
 *
 * Also wires two reveal systems. [data-reveal] rises into place as each
 * section scrolls into view — that's fine for content below the fold, but the
 * hero is visible at load, so a scroll trigger on it would just fire
 * immediately with no visible stagger. [data-hero-reveal] instead animates in
 * on mount, staggered, so the headline, copy, buttons, and panel arrive in
 * sequence rather than all at once. Doing it here keeps page.tsx a server
 * component.
 */
export function SmoothScroll() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    gsap.registerPlugin(ScrollTrigger);

    const revealCtx = gsap.context(() => {
      const targets = gsap.utils.toArray<HTMLElement>("[data-reveal]");

      targets.forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: reduced ? 0 : 28,
          duration: reduced ? 0 : 0.7,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start: "top 88%",
            once: true,
          },
        });
      });
    });

    const heroCtx = gsap.context(() => {
      const targets = gsap.utils.toArray<HTMLElement>("[data-hero-reveal]");
      if (!targets.length) return;

      gsap.set(targets, { opacity: 0, y: reduced ? 0 : 18 });
      gsap.to(targets, {
        opacity: 1,
        y: 0,
        duration: reduced ? 0 : 0.7,
        ease: "power3.out",
        stagger: reduced ? 0 : 0.12,
        delay: reduced ? 0 : 0.1,
      });
    });

    if (reduced) {
      ScrollTrigger.refresh();
      return () => {
        revealCtx.revert();
        heroCtx.revert();
      };
    }

    const lenis = new Lenis({
      autoRaf: false,
      anchors: { offset: -80 },
      lerp: 0.11,
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
    });

    lenis.on("scroll", ScrollTrigger.update);

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    ScrollTrigger.refresh();

    return () => {
      gsap.ticker.remove(raf);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
      revealCtx.revert();
      heroCtx.revert();
    };
  }, []);

  return null;
}
