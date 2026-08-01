import { LiveReveal } from "./components/LiveReveal";
import { Logo } from "./components/Logo";
import { Nav } from "./components/Nav";
import { ToggleDemo } from "./components/ToggleDemo";
import {
  CardGrid,
  DetailSection,
  Eyebrow,
  FaqItem,
  FeatureCard,
  SectionHead,
} from "./components/ui";

const INSFORGE_FEATURES = [
  {
    title: "Attribution engine",
    badge: "Postgres fn",
    body: "confirm_attributions() runs the whole temporal join inside InsForge — the core of the demo, executing where you can read it.",
  },
  {
    title: "Source-scoped views",
    badge: "structural",
    body: "Every read goes through visible_source_event / visible_ticket_state, gated on the run's enabled_sources. Disable Linear and the join has nothing left.",
  },
  {
    title: "Classification cache",
    badge: "content-hash",
    body: "Keyed on message content, not message id. A live re-run after a source toggle re-costs nothing — the LLM never runs twice on the same text.",
  },
  {
    title: "Row Level Security",
    badge: "auth.uid()",
    body: "An engineer sees their own findings, a manager sees direct reports, nobody sees the org. Enforced by policy, not by the UI's good behavior.",
  },
  {
    title: "Storage snapshots",
    badge: "run-snapshots",
    body: "Every run's raw pull can replay from a bucket — deterministic offline demo if the venue wifi or a rate limit gets in the way.",
  },
  {
    title: "Realtime stage stream",
    badge: "realtime.publish",
    body: "run_stage_event rows publish to a per-run channel as the pipeline executes — resolve, harvest, classify, attribute, rank, report, live.",
  },
];

const STACK = [
  {
    name: "HydraDB",
    role: "Cross-source identity resolution",
    body: "Unifies a Slack handle, a GitHub login, and a Linear assignee into one person. Confirmation is impossible without knowing they're the same human — nothing else in the stack can produce this.",
  },
  {
    name: "InsForge",
    role: "The detector itself",
    body: "The attribution engine, the degradation guarantee, the classification cache, access control, and run snapshots all live here — not a results table, the thing that decides what counts as proof.",
  },
  {
    name: "RocketRide Cloud",
    role: "Orchestration and fan-out",
    body: "The public endpoint, bounded-concurrency classification calls, per-message retry on malformed JSON, and stage checkpointing so a crashed run resumes instead of restarting.",
  },
  {
    name: "Pipeshift",
    role: "Message classification",
    body: "Turns \"this message mentions ENG-412\" into \"this message unblocked someone on ENG-412.\" Rule (a) confirms the link; Pipeshift characterizes the help.",
  },
];

const ROADMAP = [
  "Embed harvested messages + tickets (pgvector)",
  "Live stage stream on this page",
  "Nightly scheduled run",
  "Gmail attribution logic",
  "Real reporting-structure RLS demo",
  "Rule (b): PR/file attribution",
];

const FAQS = [
  {
    q: "Isn't this just a database join?",
    a: "Yes — that's the point. \"This message referenced a ticket, it's assigned to someone else, and it closed inside the window\" is a temporal join. Running it as a Postgres function inside InsForge, instead of application code, is what lets us prove the degradation instead of asking you to trust it.",
  },
  {
    q: "How do we know the source toggle above isn't faked?",
    a: "Every read in the attribution path goes through a function gated on the run's enabled_sources — visible_ticket_state, visible_source_event. Disable Linear and the underlying rows are structurally absent from the query, not skipped by an if-statement. The function body is nine lines of SQL; we'll put it on screen.",
  },
  {
    q: "Doesn't this enable manager surveillance?",
    a: "Access is enforced by Row Level Security, not a UI promise. An engineer sees their own findings; a manager sees direct reports; nobody sees the org-wide view. There is no query path that returns it — that's a database guarantee, not a feature flag someone could flip.",
  },
  {
    q: "Why doesn't the divergence score ever show up anywhere?",
    a: "We promise cited findings, not a score — a person is not rankable below two confirmed attributions, so a new hire with two Slack messages can't top a list. The number exists as an internal sort key. It never reaches the response, because a visible score is exactly the kind of dashboard number this project is arguing against.",
  },
  {
    q: "What happens if a workspace only has one connector?",
    a: "The response includes a degraded block naming exactly which confirmation rules can't run and why, instead of silently returning fewer results. A tool that reports its own blind spot, not one that hides it.",
  },
  {
    q: "Does Gmail actually do anything yet?",
    a: "Not yet. It stays in the source toggle so the degradation demo has a fourth lever, but no attribution logic reads from it. We'd rather say that plainly than pretend otherwise.",
  },
  {
    q: "What makes the live re-run fast enough to demo?",
    a: "Classification is cached by message content hash, not by run. Toggling sources and re-running only recomputes the attribution join — milliseconds, not a fresh LLM pass over every message in the window.",
  },
];

export default function Home() {
  return (
    <div id="top" className="flex min-h-screen flex-col">
      <Nav />

      {/* Hero */}
      <section className="hero-art relative isolate min-h-svh">
        <div className="hero-veil flex min-h-svh flex-col justify-center px-6 pt-36 pb-28 sm:pt-44">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            <div>
              <h1
                data-hero-reveal
                className="font-display text-5xl leading-[1.08] sm:text-[58px]"
              >
                Your engineering dashboard is{" "}
                <span className="text-accent italic">lying to you.</span>
              </h1>
              <p
                data-hero-reveal
                className="mt-6 max-w-lg text-[17px] leading-relaxed text-text/70"
              >
                Engineers often unblock a teammate or catch a bug in review, but the person who
                gets credit later is whoever closed the ticket. Witness finds that hidden work
                and gives credit where it&rsquo;s due, confirming every finding against a
                second, independent source before it counts.
              </p>
              <div data-hero-reveal className="mt-8">
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href="/demo"
                    className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
                  >
                    Judges click here
                    <span aria-hidden>→</span>
                  </a>
                  <a
                    href="#how-it-works"
                    className="flex items-center gap-2 rounded-full border border-black/[0.07] bg-white/80 px-5 py-2.5 text-sm font-medium text-text shadow-sm backdrop-blur transition hover:bg-white"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[9px]">
                      ▶
                    </span>
                    How it works
                  </a>
                </div>
              </div>
            </div>

            <div data-hero-reveal className="min-w-0 lg:pl-4">
              <LiveReveal />
            </div>
          </div>
        </div>
      </section>

      {/* The proof — interactive */}
      <section id="proof" data-reveal className="px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>The proof</Eyebrow>
          <h2 className="mt-4 font-display text-4xl sm:text-[42px]">
            Scope it to one connector and watch it happen.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            This reproduces the real rule against the real seeded run: Maria referenced ENG-412
            in Slack; ENG-412 is assigned to Chen; it closed 2h14m later. Turn Linear off.
          </p>
        </div>
        <div className="mt-12">
          <ToggleDemo />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" data-reveal className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-xl">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-4 font-display text-4xl">Harvest broadly. Query narrowly.</h2>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {[
              {
                n: "01",
                t: "Harvest every source",
                d: "HydraDB resolves identities and pulls Slack, GitHub, and Linear into one normalized ledger — regardless of what a later run restricts.",
              },
              {
                n: "02",
                t: "Confirm inside Postgres",
                d: "confirm_attributions() joins the ledger against itself: who a ticket is really assigned to, and when it closed after the message that referenced it.",
              },
              {
                n: "03",
                t: "Report the blind spot too",
                d: "Restrict the sources and the join loses rows to join against — not a branch that decided to hide them. The response says exactly what it can no longer see.",
              },
            ].map((step) => (
              <div key={step.n} className="border-t border-border pt-5">
                <span className="font-mono text-sm text-accent">{step.n}</span>
                <h3 className="mt-2 font-medium text-text">{step.t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The actual rule */}
      <section data-reveal className="py-10">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="font-display text-3xl sm:text-4xl">Not a guess. A rule.</h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-muted">
            Every finding has to clear the same three conditions. If a source is turned off,
            one of them simply can&rsquo;t be checked anymore.
          </p>

          <div className="mx-auto mt-8 max-w-lg rounded-xl border border-border bg-surface p-6 text-left shadow-sm">
            <ol className="space-y-4">
              {[
                "The message names a specific ticket.",
                "That ticket is assigned to someone else.",
                "It closed within the time window after the message.",
              ].map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[12px] font-semibold text-accent">
                    {i + 1}
                  </span>
                  <span className="text-[15px] leading-snug text-text">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <p className="mx-auto mt-4 max-w-md text-sm text-muted">
            All three, every time, no exceptions built in for the demo.
          </p>
        </div>
      </section>

      {/* InsForge feature grid */}
      <section id="stack" data-reveal className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHead
            eyebrow="Built on InsForge"
            sub="Not a results table at the end of the pipeline — the part of the system that carries the argument."
          >
            The database is the detector.
          </SectionHead>
          <div className="mt-10">
            <CardGrid>
              {INSFORGE_FEATURES.map((f) => (
                <FeatureCard key={f.title} title={f.title} badge={f.badge}>
                  {f.body}
                </FeatureCard>
              ))}
            </CardGrid>
          </div>
        </div>
      </section>

      {/* Alternating detail sections */}
      <DetailSection
        eyebrow="Access control"
        heading="Who sees what is a policy, not a promise."
        visual={
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted uppercase">
                  <th className="px-4 py-3 font-normal">Viewer</th>
                  <th className="px-4 py-3 font-normal">Sees</th>
                  <th className="px-4 py-3 font-normal">Enforced by</th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {[
                  ["Engineer", "Their own findings", "auth.uid()"],
                  ["Manager", "Direct reports only", "reports_to()"],
                  ["Anyone else", "Nothing", "no policy grants it"],
                ].map((row) => (
                  <tr key={row[0]} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-text">{row[0]}</td>
                    <td className="px-4 py-3 text-muted">{row[1]}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-muted">{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      >
        <p>
          A tool that produces performance-review-adjacent claims about named people is one
          prompt away from a surveillance product. The answer isn&rsquo;t a promise about our
          UI — it&rsquo;s Row Level Security, enforced at the database, that a manager cannot
          query around.
        </p>
      </DetailSection>

      <DetailSection
        eyebrow="Ranking"
        heading="Findings, not scores."
        reverse
        band
        visual={
          <div className="rounded-xl border border-border bg-surface p-6 font-mono text-sm">
            <p className="text-muted">divergence = invisible / (visible + invisible)</p>
            <p className="mt-3 text-text">
              <span className="text-accent">WHERE</span> confirmed_count &gt;= 2
            </p>
            <p className="mt-3 text-muted">— never rendered in the API response —</p>
          </div>
        }
      >
        <ul className="space-y-2">
          <li>— A new hire with two Slack messages and zero PRs can&rsquo;t top the list.</li>
          <li>— divergence is a sort key computed for ranking, not a field in the response.</li>
          <li>— The pitch says &ldquo;not a score.&rdquo; The schema makes that true.</li>
        </ul>
      </DetailSection>

      {/* Sponsor stack */}
      <section data-reveal className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHead
            eyebrow="The stack"
            sub="Four sponsors, each carrying a piece no other one could."
          >
            Division of labor.
          </SectionHead>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {STACK.map((s) => (
              <div key={s.name} className="rounded-xl border border-border bg-surface p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-mono text-sm font-semibold text-text">{s.name}</h3>
                  <span className="text-right text-xs text-accent">{s.role}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section data-reveal className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <Eyebrow>Roadmap</Eyebrow>
          <h2 className="mt-4 font-display text-4xl">What&rsquo;s scaffolded, not wired.</h2>
          <p className="mt-3 max-w-lg text-[15px] text-muted">
            Honest about the gap: schema and functions exist for these; the pipeline code that
            populates them doesn&rsquo;t, yet.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ROADMAP.map((r) => (
              <div
                key={r}
                className="flex items-center justify-between rounded-xl border border-dashed border-border p-5 text-muted"
              >
                <span className="text-sm">{r}</span>
                <span className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[11px] tracking-wide uppercase">
                  Next
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" data-reveal className="py-20">
        <div className="mx-auto max-w-3xl px-6">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="mt-4 font-display text-4xl">Questions, answered.</h2>
          <div className="mt-8">
            {FAQS.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section data-reveal className="bg-surface-2 py-24 text-center">
        <div className="mx-auto max-w-2xl px-6">
          <Eyebrow>The claim</Eyebrow>
          <h2 className="mt-4 font-display text-4xl sm:text-5xl">
            &ldquo;It becomes a confident, wrong performance review.&rdquo;
          </h2>
          <p className="mx-auto mt-6 max-w-md text-sm text-muted">
            That sentence used to be something you had to take on faith. Scroll up — it isn&rsquo;t
            anymore.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <a
              href="#proof"
              className="rounded-full bg-text px-4 py-2 text-sm font-medium text-white transition hover:opacity-85"
            >
              Run it again
            </a>
            <a href="#faq" className="text-sm font-medium text-text hover:text-accent">
              Read the FAQ →
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer-art relative isolate mt-auto border-t border-border py-16 text-muted">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Logo height={18} className="text-text" />
              <p className="mt-3 max-w-[22ch] text-sm text-muted">
                Cited findings, confirmed against a second source. Never a score.
              </p>
            </div>
            <div>
              <p className="font-mono text-xs tracking-wide text-muted uppercase">Product</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <a href="#proof" className="hover:text-text">
                    The proof
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="hover:text-text">
                    How it works
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-xs tracking-wide text-muted uppercase">Backend</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <a href="#stack" className="hover:text-text">
                    InsForge features
                  </a>
                </li>
                <li>
                  <a href="#stack" className="hover:text-text">
                    Sponsor stack
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-xs tracking-wide text-muted uppercase">More</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <a href="#faq" className="hover:text-text">
                    FAQ
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 flex flex-col-reverse items-center justify-between gap-4 border-t border-border pt-6 text-xs text-muted sm:flex-row">
            <span>A hackathon project built on HydraDB, Pipeshift, RocketRide, and InsForge.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
