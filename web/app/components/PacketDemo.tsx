"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Loader2, ArrowRight, RotateCcw } from "lucide-react";
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
interface ChatContext {
  person: string;
  windowDays: number;
  windowLabel: string;
  live: boolean;
}
interface PacketResponse {
  kind: "packet";
  outOfScope: false;
  empty: false;
  live: boolean;
  person: string;
  role?: string;
  windowDays: number;
  windowLabel: string;
  ingestedCount: number;
  noiseDropped: number;
  usedModel: boolean;
  sections: Section[];
  context: ChatContext;
}
interface EmptyResponse {
  kind: "empty";
  outOfScope: false;
  empty: true;
  live: boolean;
  person: string;
  windowDays: number;
  windowLabel: string;
  message: string;
  context: ChatContext;
}
interface AnswerResponse {
  kind: "answer";
  outOfScope: false;
  live: boolean;
  person: string;
  windowDays: number;
  windowLabel: string;
  answer: string;
  citations: Citation[];
  context: ChatContext;
}
interface DeclinedResponse {
  kind: "declined";
  outOfScope: true;
  live: boolean;
  person?: string;
  reason: string;
  message: string;
  context: ChatContext | null;
}
type ApiResult = PacketResponse | EmptyResponse | AnswerResponse | DeclinedResponse;

interface ChatTurn {
  question: string;
  response: ApiResult | null; // null while that turn is in flight
}

interface PacketDemoProps {
  variant?: "compact" | "full";
  // Fires once, whenever the thread transitions between the initial
  // prompt-and-suggestions view and an in-progress conversation — lets a
  // parent page (e.g. /demo) hide its own title/description once chatting
  // starts, without PacketDemo knowing anything about that page's layout.
  onModeChange?: (chatMode: boolean) => void;
}

const FALLBACK_SUGGESTIONS = [
  "Status check on Daniel",
  "What did Marcin ship this week",
  "How's Priya's mobile release going",
];
const CURVEBALL = "Who's my worst engineer?";
const firstName = (name: string) => name.split(" ")[0];

function historyAnswerText(r: ApiResult): string {
  if (r.kind === "packet") return r.sections.map((s) => s.sentence).join(" ");
  if (r.kind === "answer") return r.answer;
  return r.message;
}

const TYPE_MS = 42;
const DELETE_MS = 20;
const HOLD_MS = 1500;
const GAP_MS = 350;

// Cycles the placeholder through example prompts (typed, held, deleted) so
// they read as inspiration rather than buttons — no click target, no extra
// chrome, just what to try next.
function useTypewriterPlaceholder(phrases: string[], enabled: boolean): string {
  const [text, setText] = useState("");

  useEffect(() => {
    // No cleanup-to-blank needed when disabled: the PromptBar this feeds
    // either isn't rendered (chat has started) or has a non-empty value
    // (browsers hide the placeholder anyway), so a stale typed string just
    // sits unseen in state until this re-enables.
    if (!enabled || phrases.length === 0) return;
    let phraseIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timeout: ReturnType<typeof setTimeout>;

    const tick = () => {
      const phrase = phrases[phraseIndex % phrases.length];
      if (!deleting) {
        charIndex += 1;
        setText(phrase.slice(0, charIndex));
        timeout = setTimeout(tick, charIndex === phrase.length ? HOLD_MS : TYPE_MS);
        if (charIndex === phrase.length) deleting = true;
      } else {
        charIndex -= 1;
        setText(phrase.slice(0, charIndex));
        if (charIndex === 0) {
          deleting = false;
          phraseIndex += 1;
          timeout = setTimeout(tick, GAP_MS);
        } else {
          timeout = setTimeout(tick, DELETE_MS);
        }
      }
    };
    timeout = setTimeout(tick, GAP_MS);
    return () => clearTimeout(timeout);
  }, [enabled, phrases]);

  return text;
}

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

export function PacketDemo({ variant = "full", onModeChange }: PacketDemoProps) {
  const [prompt, setPrompt] = useState("");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [stageIndex, setStageIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [context, setContext] = useState<ChatContext | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(FALLBACK_SUGGESTIONS);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const runRef = useRef<(rawPrompt: string) => void>(() => {});
  const messagesRef = useRef<ChatTurn[]>([]);
  const contextRef = useRef<ChatContext | null>(null);
  useEffect(() => {
    messagesRef.current = messages;
    contextRef.current = context;
  });

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
      if (transcript) runRef.current(transcript);
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
    setPrompt("");
    setMessages((prev) => [...prev, { question: p, response: null }]);
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

    const history = messagesRef.current.slice(-4).map((m) => ({
      question: m.question,
      answer: m.response ? historyAnswerText(m.response) : "",
    }));

    const fetchPromise: Promise<ApiResult> = fetch("/api/packet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: p, context: contextRef.current, history }),
    }).then((r) => r.json());

    const [data] = await Promise.all([fetchPromise, stageTimer]);

    setMessages((prev) => {
      const next = [...prev];
      next[next.length - 1] = { question: p, response: data };
      return next;
    });
    setContext(data.context ?? null);
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

  const resetConversation = () => {
    setMessages([]);
    setContext(null);
    setPrompt("");
  };

  const chatMode = messages.length > 0;
  const lastIndex = messages.length - 1;

  useEffect(() => {
    onModeChange?.(chatMode);
    // onModeChange is a caller-supplied callback, not reactive state this
    // component reads from — only re-fire on an actual chatMode flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMode]);

  const placeholderPhrases = useMemo(() => [...suggestions, CURVEBALL], [suggestions]);
  const typedPlaceholder = useTypewriterPlaceholder(placeholderPhrases, !chatMode && prompt.length === 0);

  return (
    <div className="mx-auto w-full max-w-2xl">
      {!chatMode && (
        <>
          <PromptBar
            prompt={prompt}
            setPrompt={setPrompt}
            onSubmit={onSubmit}
            listening={listening}
            toggleMic={toggleMic}
            showMic={variant === "full"}
            loading={loading}
            placeholder={typedPlaceholder}
          />
          {micError && <p className="mt-2 text-center text-xs text-danger">{micError}</p>}
        </>
      )}

      {chatMode && (
        <div>
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={resetConversation}
              className="flex items-center gap-1.5 text-xs text-muted transition hover:text-text"
            >
              <RotateCcw className="h-3 w-3" />
              Start over
            </button>
          </div>

          <div
            className={
              variant === "full"
                ? "space-y-6 pb-32"
                : "max-h-[480px] space-y-6 overflow-y-auto rounded-xl border border-border bg-surface-2/30 p-4 sm:p-5"
            }
          >
            {messages.map((turn, i) => (
              <ChatTurnView key={i} turn={turn} stageIndex={i === lastIndex ? stageIndex : -1} />
            ))}
          </div>

          <form
            onSubmit={onSubmit}
            className={
              variant === "full"
                ? "fixed inset-x-0 bottom-6 z-40 flex justify-center px-6"
                : "mt-3 flex justify-center"
            }
          >
            <div className={variant === "full" ? "w-full max-w-xl" : "w-full"}>
              <PromptBar
                prompt={prompt}
                setPrompt={setPrompt}
                onSubmit={onSubmit}
                listening={listening}
                toggleMic={toggleMic}
                showMic={variant === "full"}
                loading={loading}
                placeholder="Ask a follow-up…"
                elevated={variant === "full"}
              />
            </div>
          </form>
          {micError && <p className="mt-2 text-center text-xs text-danger">{micError}</p>}
        </div>
      )}
    </div>
  );
}

function PromptBar({
  prompt,
  setPrompt,
  onSubmit,
  listening,
  toggleMic,
  showMic,
  loading,
  placeholder = "Ask about someone's recent work…",
  elevated,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  listening: boolean;
  toggleMic: () => void;
  showMic: boolean;
  loading: boolean;
  placeholder?: string;
  elevated?: boolean;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className={`flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 ${
        elevated ? "shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)]" : "shadow-[0_20px_50px_-25px_rgba(0,0,0,0.25)]"
      }`}
    >
      {showMic && (
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
        placeholder={listening ? "Listening…" : placeholder}
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
  );
}

function StageProgress({ stageIndex }: { stageIndex: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {STAGES.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition ${
              i < stageIndex ? "bg-accent/15 text-accent" : i === stageIndex ? "bg-accent text-white" : "bg-surface-2 text-muted"
            }`}
          >
            {s.label}
          </span>
          {i < STAGES.length - 1 && <span className="h-px w-3 bg-border" />}
        </div>
      ))}
    </div>
  );
}

function ChatTurnView({ turn, stageIndex }: { turn: ChatTurn; stageIndex: number }) {
  return (
    <div className="space-y-2.5">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-text px-4 py-2.5 text-[13px] text-white">
          {turn.question}
        </div>
      </div>
      <div className="flex items-start gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">
          R
        </span>
        <div className="min-w-0 flex-1">
          {turn.response === null ? (
            stageIndex >= 0 ? <StageProgress stageIndex={stageIndex} /> : <p className="text-[13px] text-muted">Thinking…</p>
          ) : (
            <ResponseCard result={turn.response} />
          )}
        </div>
      </div>
    </div>
  );
}

function CitationChip({ citation, live }: { citation: Citation; live: boolean }) {
  const meta = SOURCE_META[citation.source];
  const Icon = meta.Icon;
  const chipClass =
    "flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-2.5 py-1 text-[11px] text-muted transition hover:border-accent/40 hover:text-text";
  const label = (
    <>
      <Icon className="h-3 w-3" style={{ color: meta.color }} />
      {meta.label}
    </>
  );
  // Live pulls cite a real permalink in the real workspace — link straight
  // there. The fixture's URLs point at a workspace that doesn't exist, so
  // those route to an internal page that reconstructs the same cited event
  // instead of a dead link.
  return live ? (
    <a href={citation.url} target="_blank" rel="noreferrer" className={chipClass} title={citation.summary}>
      {label}
    </a>
  ) : (
    <Link href={`/evidence/${citation.id}`} target="_blank" className={chipClass} title={citation.summary}>
      {label}
    </Link>
  );
}

function SourceBadge({ live }: { live: boolean }) {
  return (
    <span className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[10px] tracking-wide text-muted uppercase">
      {live ? "Live pull" : "Warm cache"}
    </span>
  );
}

function ResponseCard({ result }: { result: ApiResult }) {
  if (result.kind === "declined") {
    return (
      <div className="max-w-[92%] rounded-2xl rounded-tl-md border border-dashed border-danger/40 bg-danger/5 px-4 py-3">
        <p className="font-mono text-[10px] tracking-wide text-danger uppercase">Out of scope — declined</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text">{result.message}</p>
      </div>
    );
  }

  if (result.kind === "empty") {
    return (
      <div className="max-w-[92%] rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3">
        <p className="text-[13px] leading-relaxed text-text">{result.message}</p>
      </div>
    );
  }

  if (result.kind === "answer") {
    return (
      <div className="max-w-[92%] rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.2)]">
        <p className="text-[13px] leading-relaxed text-text">{result.answer}</p>
        {result.citations.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {result.citations.map((c) => (
              <CitationChip key={c.id} citation={c} live={result.live} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-surface p-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.2)] sm:p-6">
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
              {s.citations.map((c) => (
                <CitationChip key={c.id} citation={c} live={result.live} />
              ))}
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
