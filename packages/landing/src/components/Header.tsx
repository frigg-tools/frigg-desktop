import { useEffect, useState } from 'react';
import { useT, type Lang } from '../i18n';
import { REPO_URL } from '../useRelease';
import { IconGithub } from '../icons';

function Logo() {
  return (
    <a href="#top" className="flex items-center gap-2.5 group">
      <span className="relative flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 ring-1 ring-emerald-500/40">
        <span className="h-2 w-2 rounded-full bg-emerald-400 pulse-dot" />
        <span className="absolute inset-0 rounded-md bg-emerald-400/20 blur-md group-hover:bg-emerald-400/30 transition-colors" />
      </span>
      <span className="font-display text-lg font-bold tracking-wide text-zinc-100">frigg</span>
    </a>
  );
}

function LangToggle() {
  const { lang, setLang } = useT();
  return (
    <div className="flex items-center rounded-full border border-zinc-800 bg-zinc-900/60 p-0.5 text-[11px] font-medium">
      {(['en', 'pt'] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`rounded-full px-2.5 py-1 uppercase tracking-wider transition-colors ${
            lang === l ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export default function Header() {
  const { t } = useT();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? 'border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-zinc-400 md:flex">
          <a href="#tools" className="transition-colors hover:text-zinc-100">
            {t.nav.tools}
          </a>
          <a href="#how" className="transition-colors hover:text-zinc-100">
            {t.nav.how}
          </a>
          <a href="#download" className="transition-colors hover:text-zinc-100">
            {t.nav.download}
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <LangToggle />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
          >
            <IconGithub className="h-4 w-4" />
            <span className="hidden sm:inline">{t.nav.github}</span>
          </a>
        </div>
      </div>
    </header>
  );
}
