import Link from "next/link";
import { Logo } from "../components/Logo";
import { PacketDemo } from "../components/PacketDemo";

const WORKSPACE_PEOPLE = [
  { name: "Daniel Cho", role: "Backend" },
  { name: "Marcin Wozniak", role: "Platform" },
  { name: "Priya Anand", role: "Mobile" },
];

export default function DemoPage() {
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

      <main className="mx-auto mt-14 max-w-2xl px-6">
        <h1 className="text-center font-display text-4xl leading-[1.1] text-text sm:text-[42px]">
          Ask about someone&rsquo;s recent work.
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-center text-[15px] leading-relaxed text-muted">
          Speak the prompt or type it. Pick the person, pick the window — this workspace is
          yours to poke at. Anything outside person-plus-window gets declined, on purpose.
        </p>

        <div className="mt-10">
          <PacketDemo variant="full" />
        </div>

        <div className="mt-12 rounded-xl border border-border bg-surface p-5">
          <p className="font-mono text-[11px] tracking-wide text-muted uppercase">
            This workspace
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {WORKSPACE_PEOPLE.map((p) => (
              <span
                key={p.name}
                className="flex items-center gap-2 rounded-full border border-border bg-surface-2/60 px-3 py-1.5 text-[13px] text-text"
              >
                {p.name}
                <span className="text-[11px] text-muted">{p.role}</span>
              </span>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            Sourced from a warm-cache fixture standing in for a live Slack / Linear / GitHub /
            CRM pull — same pipeline, no venue-wifi dependency. Every citation still resolves to
            a real-shaped permalink.
          </p>
        </div>
      </main>
    </div>
  );
}
