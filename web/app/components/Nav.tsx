import { Logo } from "./Logo";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#proof", label: "Try it" },
  { href: "#firewall", label: "The firewall" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-black/[0.06] bg-white/70 px-2 py-1.5 shadow-[0_2px_20px_-6px_rgba(0,0,0,0.18)] backdrop-blur-md">
        <a href="#top" className="rounded-full px-3 py-1.5 text-text">
          <Logo height={16} />
        </a>

        <nav className="hidden items-center sm:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-3 py-1.5 text-sm text-muted transition hover:bg-black/[0.04] hover:text-text"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <a
          href="/demo"
          className="rounded-full bg-text px-3.5 py-1.5 text-sm font-medium text-white transition hover:opacity-85"
        >
          Judges click here
        </a>
      </div>
    </header>
  );
}
