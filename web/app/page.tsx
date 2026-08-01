import { LiveReveal } from "./components/LiveReveal";
import { Logo } from "./components/Logo";
import { Nav } from "./components/Nav";
import { PacketDemo } from "./components/PacketDemo";
import {
  CardGrid,
  DetailSection,
  Eyebrow,
  FaqItem,
  FeatureCard,
  SectionHead,
} from "./components/ui";

const PIPELINE = [
  {
    n: "01",
    t: "Trigger",
    d: "A judge speaks an open prompt — “Status check on Daniel,” “What did Marcin ship this week.” Flexible phrasing on top, one narrow pipeline underneath.",
  },
  {
    n: "02",
    t: "Ingest",
    d: "Slack, Linear, GitHub, and the CRM get pulled into one normalized stream. Each record keeps who, what, when, and a permalink. No interpretation yet.",
  },
  {
    n: "03",
    t: "Cluster",
    d: "A few dozen noisy events collapse into the five or six themes that actually mattered that window.",
  },
  {
    n: "04",
    t: "Map",
    d: "Each theme gets 1–2 drafted sentences, every claim welded to the source record it came from.",
  },
  {
    n: "05",
    t: "Render",
    d: "The packet fills out. Every sentence is clickable back to the raw PR, ticket, message, or CRM note.",
  },
];

const FEATURES = [
  {
    title: "The firewall",
    badge: "hard rule",
    body: "No source link, no sentence. A drafted claim with nothing to cite never reaches the packet — checked in code, not left to a prompt instruction.",
  },
  {
    title: "One lane, on purpose",
    badge: "scoped",
    body: "Person + window + cited output. Ask it to rank, score, or compare, and it declines instead of guessing — out of scope is a feature, not a gap.",
  },
  {
    title: "Gathers, doesn't judge",
    badge: "no verdict",
    body: "The agent assembles evidence. The human reads it and decides. Nothing in the response is scored, rated, or ranked — there's no number to screenshot into a review.",
  },
];

const CUT = [
  {
    title: "The monthly voice check-in",
    body: "Un-demoable on a monthly cadence — you can't compress a month into a 3-minute room. It was also the highest-variance thing in the entire pitch.",
  },
  {
    title: "AI judgment on a person",
    body: "An unscoreable output, and any judge would be right to be uncomfortable watching a model rate someone's performance out loud.",
  },
];

const FAQS = [
  {
    q: "What job does this actually kill?",
    a: "A manager loses a full Sunday scrolling GitHub, Linear, and Slack to reconstruct what six people did, then reformatting it into HR's template. That's a chase job, a format job, and a copy-paste job happening at once. Every company over ~20 people pays a human to do this.",
  },
  {
    q: "Why doesn't it just answer anything I ask?",
    a: "Because an agent that wanders outside its lane is the whole risk. Open prompt on the surface, one narrow pipeline underneath — person, window, cited output. Anything else, it says so instead of improvising. A graceful decline in front of a room reads as engineering; a hallucinated paragraph reads as a magic trick.",
  },
  {
    q: "What stops it from making things up?",
    a: "The firewall: no source link, no sentence. Every claim in a packet is welded to the record it was drafted from — a Slack permalink, a Linear ticket, a PR, a CRM note. If a drafted sentence has nothing to cite, it's dropped before it ever renders, not softened with a caveat.",
  },
  {
    q: "Isn't this just a scoring tool with extra steps?",
    a: "No score ever appears, anywhere. The agent's whole job ends at “here's what happened, cited.” Ranking, rating, and comparing people is the one thing it's built to refuse — the human reading the packet is the one who judges, not the agent.",
  },
  {
    q: "Why cut the monthly check-in and the AI verdict?",
    a: "Both were cut for the same reason a demo has to earn: they don't survive a live room. A monthly cadence can't be shown in three minutes, and a model rendering judgment on a named person is an output nobody can score — including the judges. The pipeline that's left is the part that's provably checkable on sight.",
  },
  {
    q: "How do you prove it on stage?",
    a: "You pick the person and the window, and ideally drop a curveball into the real Slack channel seconds before the run. Then a judge clicks one citation and lands on the actual pull request. That's the whole game in a one-shot run — checkable, not just claimed.",
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
                Stop reconstructing{" "}
                <span className="text-accent italic">everyone&rsquo;s week</span> by hand.
              </h1>
              <p
                data-hero-reveal
                className="mt-6 max-w-lg text-[17px] leading-relaxed text-text/70"
              >
                Receipts answers a spoken question about someone&rsquo;s recent work by
                assembling a cited evidence packet from Slack, Linear, GitHub, and your CRM
                &mdash; never a verdict. The agent gathers. The human judges.
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

      {/* The job */}
      <section data-reveal className="py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <Eyebrow>The job</Eyebrow>
          <h2 className="mt-4 font-display text-4xl sm:text-[42px]">
            A full Sunday, three times over.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            Chase job: scroll four tools to find what someone actually did. Format job: turn
            that into HR&rsquo;s template. Copy-paste job: do it again for the next five
            people. Every company over ~20 engineers pays a human to run this loop &mdash;
            that&rsquo;s the shared groan, not a hunch.
          </p>
        </div>
      </section>

      {/* The proof — interactive */}
      <section id="proof" data-reveal className="px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>The proof</Eyebrow>
          <h2 className="mt-4 font-display text-4xl sm:text-[42px]">
            Ask it about someone. Watch it decline what it shouldn&rsquo;t answer.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            This runs the real pipeline, live, against whichever workspace is connected right
            now &mdash; every citation is a real, clickable link. Try a status check, then try
            the curveball.
          </p>
        </div>
        <div className="mt-12">
          <PacketDemo variant="compact" />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" data-reveal className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-xl">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-4 font-display text-4xl">Open prompt on top. One narrow pipeline underneath.</h2>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            {PIPELINE.map((step) => (
              <div key={step.n} className="border-t border-border pt-5">
                <span className="font-mono text-sm text-accent">{step.n}</span>
                <h3 className="mt-2 font-medium text-text">{step.t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The firewall */}
      <section id="firewall" data-reveal className="py-10">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="font-display text-3xl sm:text-4xl">No source link. No sentence.</h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-muted">
            That&rsquo;s the whole rule. It&rsquo;s also what makes a one-shot demo checkable
            on sight instead of taken on faith.
          </p>

          <div className="mx-auto mt-8 max-w-lg rounded-xl border border-border bg-surface p-6 text-left shadow-sm">
            <ol className="space-y-4">
              {[
                "A sentence gets drafted from a cluster of real events.",
                "Every claim in it has to cite the specific record it came from.",
                "No valid citation survives the check → the sentence is dropped before render, not softened.",
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
            A judge clicks one of those links live. It lands on the actual PR or ticket.
          </p>
        </div>
      </section>

      {/* Feature grid */}
      <section data-reveal className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHead
            eyebrow="The guarantees"
            sub="Three rules that keep an open-ended prompt from turning into a wandering agent."
          >
            Narrow on purpose.
          </SectionHead>
          <div className="mt-10">
            <CardGrid columns={3}>
              {FEATURES.map((f) => (
                <FeatureCard key={f.title} title={f.title} badge={f.badge}>
                  {f.body}
                </FeatureCard>
              ))}
            </CardGrid>
          </div>
        </div>
      </section>

      {/* What got cut */}
      <DetailSection
        eyebrow="What we cut, and why"
        heading="Two ideas that don't survive a live room."
        visual={
          <div className="space-y-4">
            {CUT.map((c) => (
              <div key={c.title} className="rounded-xl border border-border bg-surface p-5">
                <p className="text-[13px] font-medium text-text">{c.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{c.body}</p>
              </div>
            ))}
          </div>
        }
      >
        <p>
          The original scope included a monthly voice check-in and letting the agent render
          judgment on a person. Both got cut in the same pass, for the same reason: neither
          one is checkable in a 3-minute demo.
        </p>
        <p>
          What&rsquo;s left is the part that is &mdash; the agent gathers evidence, the human
          judges it. That trade is the whole pitch, not a compromise on the way to it.
        </p>
      </DetailSection>

      {/* Architecture */}
      <DetailSection
        eyebrow="Architecture of the demo"
        heading="Judges own the variable."
        reverse
        band
        visual={
          <div className="rounded-xl border border-border bg-surface p-6 font-mono text-sm">
            <p className="text-muted">1. Judge picks the person</p>
            <p className="mt-2 text-muted">2. Judge picks the window</p>
            <p className="mt-2 text-text">3. Judge drops a curveball in Slack, live</p>
            <p className="mt-3 text-accent">— none of that is scripted by us —</p>
          </div>
        }
      >
        <ul className="space-y-2">
          <li>
            &mdash; Kills the &ldquo;of course it worked, it&rsquo;s your workspace&rdquo;
            objection before it&rsquo;s asked.
          </li>
          <li>&mdash; Anything outside the person + window lane gets a graceful decline, live.</li>
          <li>
            &mdash; A decline reads as engineering. A hallucinated paragraph reads as a magic
            trick &mdash; we&rsquo;d rather show the first one.
          </li>
        </ul>
      </DetailSection>

      {/* The 3 minutes */}
      <section data-reveal className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHead eyebrow="The 3 minutes" sub="The whole pitch, timed.">
            0:00 to close.
          </SectionHead>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-6">
              <p className="font-mono text-xs tracking-wide text-accent uppercase">0:00 – 0:45</p>
              <h3 className="mt-2 font-medium text-text">The job</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                How many hours a manager burns on review archaeology. Ask the room to raise a
                hand if they&rsquo;ve watched it happen. That count, out loud, is the wedge
                validation.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-6">
              <p className="font-mono text-xs tracking-wide text-accent uppercase">0:45 – 3:00</p>
              <h3 className="mt-2 font-medium text-text">Hands off</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                A judge speaks the prompt. The packet renders. Then the moment that wins it: a
                judge clicks a citation and lands on the actual pull request.
              </p>
            </div>
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
          <Eyebrow>The rule</Eyebrow>
          <h2 className="mt-4 font-display text-4xl sm:text-5xl">
            &ldquo;No source link, no sentence.&rdquo;
          </h2>
          <p className="mx-auto mt-6 max-w-md text-sm text-muted">
            That&rsquo;s not a promise about the UI. It&rsquo;s a check in the pipeline. Scroll
            up and try to get it to break its own rule.
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
                Cited evidence packets, assembled from an open prompt. Never a verdict.
              </p>
            </div>
            <div>
              <p className="font-mono text-xs tracking-wide text-muted uppercase">Product</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <a href="#proof" className="hover:text-text">
                    Try it
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
              <p className="font-mono text-xs tracking-wide text-muted uppercase">The rules</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <a href="#firewall" className="hover:text-text">
                    The firewall
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
            <span>A hackathon project. The agent gathers. The human judges.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
