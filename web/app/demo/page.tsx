"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "../components/Logo";
import { PacketDemo } from "../components/PacketDemo";

export default function DemoPage() {
  const [chatStarted, setChatStarted] = useState(false);

  return (
    <div className="min-h-screen bg-bg pb-24">
      <header className="border-b border-border bg-surface px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="text-text">
            <Logo height={16} />
          </Link>
          <span className="font-mono text-[11px] tracking-wide text-muted uppercase">
            Judge console
          </span>
        </div>
      </header>

      <main className={`mx-auto max-w-2xl px-6 ${chatStarted ? "mt-8" : "mt-14"}`}>
        {!chatStarted && (
          <>
            <h1 className="text-center font-display text-4xl leading-[1.1] text-text sm:text-[42px]">
              Ask about someone&rsquo;s recent work.
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-center text-[15px] leading-relaxed text-muted">
              Speak the prompt or type it. Pick the person, pick the window — this workspace is
              yours to poke at. Anything outside person-plus-window gets declined, on purpose.
            </p>
          </>
        )}

        <div className={chatStarted ? "" : "mt-10"}>
          <PacketDemo variant="full" onModeChange={setChatStarted} />
        </div>
      </main>
    </div>
  );
}
