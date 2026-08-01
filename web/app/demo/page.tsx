"use client";

import { useEffect, useState } from "react";
import { Logo } from "../components/Logo";
import { AnimatedAIChat } from "@/components/ui/animated-ai-chat";
import { SiGithub, SiLinear } from "react-icons/si";
import { FaSlack } from "react-icons/fa";
import { SendIcon } from "lucide-react";
import type { IconType } from "react-icons";

type SourceId = "slack" | "github" | "linear";
const SOURCES: { id: SourceId; label: string; icon: IconType; color: string }[] = [
  { id: "slack", label: "Slack", icon: FaSlack, color: "#4A154B" },
  { id: "github", label: "GitHub", icon: SiGithub, color: "#181717" },
  { id: "linear", label: "Linear", icon: SiLinear, color: "#5E6AD2" },
];
const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

interface Evidence {
  source: string;
  ref: string;
  url: string | null;
  note: string;
}
interface Finding {
  claim: string;
  rule: string;
  evidence: Evidence[];
}
interface PersonResult {
  person: { id: string; display_name: string };
  visible: { prs: number; tickets_closed: number; commits: number };
  invisible: { confirmed_unblocks: number; reviews: number; triage: number };
  findings: Finding[];
  helped_by: Finding[];
}
interface RunResult {
  run_id: string;
  enabled_sources: string[];
  degraded: { rules_available: string[]; rules_unavailable: string[]; note: string | null };
  people: PersonResult[];
}

interface ChatTurn {
  question: string;
  answer: string | null; // null while that turn's answer is loading
  evidence: Evidence[];
}

export default function DemoPage() {
  const [enabled, setEnabled] = useState<Set<SourceId>>(new Set(["slack", "github", "linear"]));
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The whole conversation, oldest first. Present (length > 0) is what puts
  // the page in chat mode — a real multi-turn thread, not a single Q&A.
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [openEvidence, setOpenEvidence] = useState<Set<number>>(new Set());
  const [followUp, setFollowUp] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const sources = Array.from(enabled);
    if (sources.length === 0) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sources }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "request failed");
        if (!cancelled) setResult(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // Most surprising first: highest confirmed ghost work leads, the visibly
  // "safe" people (nothing hidden) trail — the reveal reads top to bottom.
  const allPeople = [...(result?.people ?? [])].sort(
    (a, b) => b.invisible.confirmed_unblocks - a.invisible.confirmed_unblocks,
  );
  const shortcuts = allPeople.map((p) => ({ id: p.person.display_name, name: p.person.display_name }));

  // Present once the first message lands — chat is the only thing on screen
  // (no input, no toggles) until resetToOverview clears the conversation.
  const chatMode = messages.length > 0;
  const resetToOverview = () => {
    setMessages([]);
    setOpenEvidence(new Set());
    setFollowUp("");
  };

  const appendTurn = (question: string) => setMessages((prev) => [...prev, { question, answer: null, evidence: [] }]);
  const resolveLastTurn = (answer: string, evidence: Evidence[]) =>
    setMessages((prev) => {
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], answer, evidence };
      return next;
    });

  // Every citable fact about a person, combined: things they did for someone
  // else, and confirmed instances where a teammate unblocked them. Ensures
  // "See evidence" has something real for everyone with any confirmed
  // activity on either side — not just people who happen to be the helper.
  const allEvidence = (person: PersonResult): Evidence[] => [
    ...person.findings.flatMap((f) => f.evidence),
    ...person.helped_by.flatMap((f) => f.evidence),
  ];

  const askAboutPerson = async (personName: string) => {
    const person = allPeople.find((p) => p.person.display_name === personName);
    if (!person) return;
    appendTurn(`Tell me about ${personName}`);
    setAiLoading(true);
    try {
      const res = await fetch("/api/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: person.person.display_name,
          visible: person.visible,
          invisible: person.invisible,
          findings: person.findings.map((f) => ({ claim: f.claim })),
          helped_by: person.helped_by.map((f) => ({ claim: f.claim })),
        }),
      });
      const data = await res.json();
      if (res.ok) resolveLastTurn(data.insight, allEvidence(person));
    } finally {
      setAiLoading(false);
    }
  };

  // Exact-name match is free and instant; anything else (a real question, or
  // a follow-up like "why doesn't he get credit for it") goes to the AI
  // query route with the recent conversation for context, resolved against
  // the actual team data — never invents a person.
  const askQuestion = async (query: string) => {
    const lower = query.toLowerCase();
    const match = allPeople.find((p) => p.person.display_name.toLowerCase().includes(lower));
    if (match) {
      await askAboutPerson(match.person.display_name);
      return;
    }
    if (allPeople.length === 0) return;
    const history = messages.slice(-3).map((m) => ({ question: m.question, answer: m.answer }));
    appendTurn(query);
    setAiLoading(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          history,
          people: allPeople.map((p) => ({
            display_name: p.person.display_name,
            visible: p.visible,
            invisible: p.invisible,
            findings: p.findings.map((f) => ({ claim: f.claim })),
            helped_by: p.helped_by.map((f) => ({ claim: f.claim })),
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const person = data.person_name ? allPeople.find((p) => p.person.display_name === data.person_name) : null;
        resolveLastTurn(data.answer, person ? allEvidence(person) : []);
      }
    } finally {
      setAiLoading(false);
    }
  };

  const submitFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    const query = followUp.trim();
    if (!query || aiLoading) return;
    setFollowUp("");
    askQuestion(query);
  };

  const toggleEvidence = (index: number) =>
    setOpenEvidence((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <div className="min-h-screen bg-bg pb-24">
      <header className="border-b border-border bg-surface px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          {chatMode ? (
            <button
              type="button"
              onClick={resetToOverview}
              className="flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-text"
            >
              ← Back to team overview
            </button>
          ) : (
            <a href="/" className="text-text">
              <Logo height={16} />
            </a>
          )}
          <span className="font-mono text-[11px] tracking-wide text-muted uppercase">Manager review — Q3</span>
        </div>
      </header>

      {chatMode ? (
        <>
          <main className="mx-auto mt-10 max-w-2xl px-6 pb-28">
            <div className="space-y-6">
              {messages.map((turn, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-text px-4 py-2.5 text-[14px] text-white">
                      {turn.question}
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">
                      W
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-2.5 text-[14px] leading-relaxed text-text shadow-[0_10px_30px_-20px_rgba(0,0,0,0.2)]">
                        {turn.answer === null ? <span className="text-muted">Thinking…</span> : turn.answer}
                      </div>

                      {turn.answer !== null && (
                        <div className="mt-2 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(turn.answer!)}
                            className="text-xs text-muted transition hover:text-text"
                          >
                            Copy
                          </button>
                          {turn.evidence.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleEvidence(i)}
                              className="text-xs font-medium text-accent hover:underline"
                            >
                              {openEvidence.has(i) ? "Hide evidence" : "See evidence"}
                            </button>
                          )}
                        </div>
                      )}

                      {turn.answer !== null && openEvidence.has(i) && turn.evidence.length > 0 && (
                        <div className="mt-2 max-w-[85%]">
                          <EvidenceBadges evidence={turn.evidence} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </main>

          <form
            onSubmit={submitFollowUp}
            className="fixed inset-x-0 bottom-6 flex justify-center px-6"
          >
            <div className="flex w-full max-w-xl items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.3)]">
              <input
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="Ask a follow-up…"
                className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted"
                style={{ outline: "none" }}
              />
              <button
                type="submit"
                disabled={!followUp.trim() || aiLoading}
                className={`flex shrink-0 items-center justify-center rounded-full p-2 transition ${
                  followUp.trim() && !aiLoading ? "bg-text text-white" : "bg-surface-2 text-muted"
                }`}
              >
                <SendIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        </>
      ) : (
        <main className="mx-auto mt-10 max-w-4xl px-6">
          <h1 className="font-display text-4xl leading-[1.1] text-text sm:text-[42px]">
            Team performance, this quarter
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
            Pull up a report, or review the whole team at once.
          </p>

          <div className="mt-6">
            <AnimatedAIChat
              people={shortcuts}
              selectedId={null}
              loading={loading}
              onSelectPerson={askAboutPerson}
              onQuery={askQuestion}
            />
          </div>

          {loading && (
            <div className="mt-4 flex flex-wrap items-center gap-4">
              {SOURCES.filter((s) => enabled.has(s.id)).map((s) => {
                const Icon = s.icon;
                return (
                  <span key={s.id} className="flex items-center gap-1.5 text-xs text-muted">
                    <Icon className="h-3.5 w-3.5 animate-pulse" style={{ color: s.color }} />
                    Checks {s.label}
                  </span>
                );
              })}
            </div>
          )}

          {result?.degraded.note && (
            <div className="mt-5 rounded-lg border border-[#b8842c]/30 bg-[#b8842c]/10 px-4 py-3 text-[13px] leading-relaxed text-[#8a6420]">
              {result.degraded.note}
            </div>
          )}
          {error && (
            <div className="mt-5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              {error}
            </div>
          )}
        </main>
      )}
    </div>
  );
}

function EvidenceBadges({ evidence }: { evidence: Evidence[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {evidence.map((e, j) => {
        const src = SOURCE_BY_ID[e.source];
        const Icon = src?.icon;
        const content = (
          <>
            {Icon && <Icon className="h-3 w-3" style={{ color: src.color }} />}
            {e.source}: {e.ref}
          </>
        );
        return e.url ? (
          <a
            key={j}
            href={e.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-surface-2"
          >
            {content}
          </a>
        ) : (
          <span
            key={j}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted"
          >
            {content}
          </span>
        );
      })}
    </div>
  );
}
