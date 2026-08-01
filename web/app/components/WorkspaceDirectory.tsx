"use client";

import { useEffect, useState } from "react";

interface DirectoryPerson {
  name: string;
  role?: string;
}

export function WorkspaceDirectory() {
  const [live, setLive] = useState(false);
  const [people, setPeople] = useState<DirectoryPerson[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/packet/directory")
      .then((r) => r.json())
      .then((data: { live: boolean; people: DirectoryPerson[] }) => {
        if (!cancelled) {
          setLive(data.live);
          setPeople(data.people);
        }
      })
      .catch(() => {
        /* leave the panel empty rather than show something wrong */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-12 rounded-xl border border-border bg-surface p-5">
      <p className="font-mono text-[11px] tracking-wide text-muted uppercase">This workspace</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {people.map((p) => (
          <span
            key={p.name}
            className="flex items-center gap-2 rounded-full border border-border bg-surface-2/60 px-3 py-1.5 text-[13px] text-text"
          >
            {p.name}
            {p.role && <span className="text-[11px] text-muted">{p.role}</span>}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        {live
          ? "Pulled live from the connected Slack, GitHub, and Linear workspace. Every citation the packet renders is a real permalink into it."
          : "Sourced from a warm-cache fixture standing in for a live Slack / Linear / GitHub pull — same pipeline, no venue-wifi dependency. Every citation still resolves to a real page in this app."}
      </p>
    </div>
  );
}
