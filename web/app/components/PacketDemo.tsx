"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Loader2, ArrowRight } from "lucide-react";
import { SOURCE_META, type SourceId } from "@/lib/sources";

const STAGES = [
  { id: "ingest", label: "Ingest" },
  { id: "cluster", label: "Cluster" },
  { id: "map", label: "Map" },
  { id: "render", label: "Render" },
] as const;

interface Citation {
  id: string;
  source: SourceId;
  url: string;
  ts: string;
  summary: string;
}
interface Section {
  cluster: string;
  theme: string;
  sentence: string;
  citations: Citation[];
}
interface PacketResult {
  outOfScope: false;
  empty: boolean;
  live: boolean;
  prompt: string;
  person: string;
  role?: string;
  windowLabel: string;
  ingestedCount: number;
  noiseDropped: number;
  usedModel: boolean;
  message?: string;
  sections: Section[];
}
interface OutOfScopeResult {
  outOfScope: true;
  live: boolean;
  prompt: string;
  person?: string;
  reason: string;
  message: string;
}
type ApiResult = PacketResult | OutOfScopeResult;

interface PacketDemoProps {
  variant?: "compact" | "full";
}

const FALLBACK_SUGGESTIONS = [
  "Status check on Daniel",
  "What did Marcin ship this week",
  "How's Priya's mobile release going",
];
const CURVEBALL = "Who's my worst engineer?";
const firstName = (name: string) => name.split(" ")[0];

// Minimal shape of the Web Speech API — not in the default TS lib, and only
// a subset is used here (start/stop plus the one result we read).
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function PacketDemo({ variant = "full" }: PacketDemoProps) {
  const [prompt, setPrompt] = useState("");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [stageIndex, setStageIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(FALLBACK_SUGGESTIONS);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const runRef = useRef<(rawPrompt: string) => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/packet/directory")
      .then((r) => r.json())
      .then((data: { live: boolean; people: { name: string }[] }) => {
        if (cancelled || !data.live || data.people.length === 0) return;
        const names = data.people.map((p) => firstName(p.name));
        const [a, b = a, c = a] = names;
        setSuggestions([`Status check on ${a}`, `What did ${b} ship this week`, `How's ${c} doing`]);
      })
      .catch(() => {
        /* fixture suggestions are already the default state */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (variant !== "full") return;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (ev) => {
      const transcript = ev.results[0]?.[0]?.transcript;
      if (transcript) {
        setPrompt(transcript);
        runRef.current(transcript);
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    // Assigned to a ref, not state — constructing the recognition object is
    // the only thing this effect does; nothing here needs a render.
    recognitionRef.current = recognition;
  }, [variant]);

  const toggleMic = () => {
    if (!recognitionRef.current) {
      setMicError("Voice input isn't supported in this browser — type the prompt instead.");
      return;
    }
    setMicError(null);
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setListening(true);
      recognitionRef.current.start();
    }
  };

  const run = async (rawPrompt: string) => {
    const p = rawPrompt.trim();
    if (!p || loading) return;
    setLoading(true);
    setResult(null);
    setStageIndex(0);

    const minStageMs = variant === "full" ? 420 : 260;
    const stageTimer = new Promise<void>((resolve) => {
      let i = 0;
      const tick = () => {
        i += 1;
        if (i < STAGES.length) {
          setStageIndex(i);
          setTimeout(tick, minStageMs);
        } else {
          resolve();
        }
      };
      setTimeout(tick, minStageMs);
    });

    const fetchPromise = fetch("/api/packet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: p }),
    }).then((r) => r.json());

    const [data] = await Promise.all([fetchPromise, stageTimer]);
    setResult(data);
    setStageIndex(-1);
    setLoading(false);
  };
  useEffect(() => {
    runRef.current = run;
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    run(prompt);
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <form onSubmit={onSubmit} className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 shadow-[0_20px_50px_-25px_rgba(0,0,0,0.25)]">
        {variant === "full" && (
          <button
            type="button"
            onClick={toggleMic}
            title="Speak the prompt"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
              listening ? "bg-accent text-white" : "bg-surface-2 text-text hover:bg-border"
            }`}
          >
            <Mic className="h-4 w-4" />
          </button>
        )}
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={listening ? "Listening…" : "Ask about someone's recent work…"}
          className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted"
          style={{ outline: "none" }}
        />
        <button
          type="submit"
          disabled={!prompt.trim() || loading}
          className={`flex shrink-0 items-center justify-center rounded-full p-2 transition ${
            prompt.trim() && !loading ? "bg-text text-white" : "bg-surface-2 text-muted"
          }`}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
        </button>
      </form>
      {micError && <p className="mt-2 text-center text-xs text-danger">{micError}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setPrompt(s);
              run(s);
            }}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted transition hover:text-text"
          >
            {s}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setPrompt(CURVEBALL);
            run(CURVEBALL);
          }}
          className="rounded-full border border-dashed border-danger/50 bg-danger/5 px-3 py-1.5 text-xs text-danger transition hover:bg-danger/10"
          title="Try to break it — this one's out of scope on purpose"
        >
          {CURVEBALL}
        </button>
      </div>

      {stageIndex >= 0 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {STAGES.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                  i < stageIndex
                    ? "bg-accent/15 text-accent"
                    : i === stageIndex
                      ? "bg-accent text-white"
                      : "bg-surface-2 text-muted"
                }`}
              >
                {s.label}
              </span>
              {i < STAGES.length - 1 && <span className="h-px w-4 bg-border" />}
            </div>
          ))}
        </div>
      )}

      {result && !loading && <PacketResultView result={result} />}
    </div>
  );
}

function SourceBadge({ live }: { live: boolean }) {
  return (
    <span className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[10px] tracking-wide text-muted uppercase">
      {live ? "Live pull" : "Warm cache"}
    </span>
  );
}

function PacketResultView({ result }: { result: ApiResult }) {
  if (result.outOfScope) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-danger/40 bg-danger/5 p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[11px] tracking-wide text-danger uppercase">Out of scope — declined</p>
          <SourceBadge live={result.live} />
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-text">{result.message}</p>
      </div>
    );
  }

  if (result.empty) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <p className="text-[14px] leading-relaxed text-text">{result.message}</p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.2)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
        <div>
          <p className="text-[15px] font-medium text-text">{result.person}</p>
          <p className="text-[11px] text-muted">
            {result.windowLabel} · {result.ingestedCount} events seen, {result.noiseDropped} dropped as noise
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SourceBadge live={result.live} />
          <span className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[10px] tracking-wide text-muted uppercase">
            {result.usedModel ? "Model-drafted" : "Template-drafted"}
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-5">
        {result.sections.map((s) => (
          <div key={s.cluster}>
            <p className="text-[12px] font-medium text-accent">{s.theme}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-text">{s.sentence}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {s.citations.map((c) => {
                const meta = SOURCE_META[c.source];
                const Icon = meta.Icon;
                const chipClass =
                  "flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-2.5 py-1 text-[11px] text-muted transition hover:border-accent/40 hover:text-text";
                const label = (
                  <>
                    <Icon className="h-3 w-3" style={{ color: meta.color }} />
                    {meta.label}
                  </>
                );
                // Live pulls cite a real permalink in the real workspace —
                // link straight there. The fixture's URLs point at a
                // workspace that doesn't exist, so those route to an
                // internal page that reconstructs the same cited event
                // instead of a dead link.
                return result.live ? (
                  <a key={c.id} href={c.url} target="_blank" rel="noreferrer" className={chipClass} title={c.summary}>
                    {label}
                  </a>
                ) : (
                  <Link key={c.id} href={`/evidence/${c.id}`} target="_blank" className={chipClass} title={c.summary}>
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-5 border-t border-border pt-3 text-[11px] text-muted">
        No source link, no sentence — every line above traces to something clickable.
      </p>
    </div>
  );
}
