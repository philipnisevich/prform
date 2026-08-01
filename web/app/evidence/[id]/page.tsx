import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CLUSTER_LABELS, eventById } from "../../api/packet/fixture";
import { SOURCE_META } from "@/lib/sources";
import { Logo } from "../../components/Logo";

// Where every citation a packet renders actually points. Real Slack/Linear/
// GitHub/CRM permalinks aren't reachable from a fixture workspace that
// doesn't exist, so this reconstructs the same event the pipeline read
// instead of leaving the citation as a dead link — the firewall's promise
// ("no source link, no sentence") only means something if the link goes
// somewhere real.

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = eventById(id);
  if (!event) notFound();

  const meta = SOURCE_META[event.source];
  const Icon = meta.Icon;
  const theme = CLUSTER_LABELS[event.cluster] ?? event.cluster;
  const when = new Date(event.ts).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-bg pb-24">
      <header className="border-b border-border bg-surface px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/demo" className="text-text">
            <Logo height={16} />
          </Link>
          <span className="font-mono text-[11px] tracking-wide text-muted uppercase">Evidence</span>
        </div>
      </header>

      <main className="mx-auto mt-10 max-w-2xl px-6">
        <Link
          href="/demo"
          className="flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to the console
        </Link>

        <div className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.2)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `${meta.color}1a` }}
              >
                <Icon className="h-4 w-4" style={{ color: meta.color }} />
              </span>
              <div>
                <p className="text-[13px] font-medium text-text">{meta.recordType}</p>
                <p className="text-[11px] text-muted">{when}</p>
              </div>
            </div>
            <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
              {theme}
            </span>
          </div>

          <p className="mt-5 text-[15px] leading-relaxed text-text">{event.summary}</p>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
            <div>
              <p className="text-[13px] font-medium text-text">{event.person.name}</p>
              <p className="text-[11px] text-muted">{event.person.role}</p>
            </div>
            <span className="font-mono text-[11px] text-muted">{event.id}</span>
          </div>
        </div>

        <p className="mt-4 text-center text-[12px] leading-relaxed text-muted">
          Reconstructed from the exact event the pipeline cited — not a live pull. In a connected
          workspace this record is the real {meta.label} permalink:{" "}
          <span className="font-mono">{event.url}</span>
        </p>
      </main>
    </div>
  );
}
