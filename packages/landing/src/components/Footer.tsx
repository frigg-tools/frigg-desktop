import { useT } from '../i18n';
import { REPO_URL } from '../useRelease';
import { IconGithub } from '../icons';

export default function Footer() {
  const { t } = useT();
  return (
    <footer className="border-t border-zinc-900 px-5 py-12 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/15 ring-1 ring-emerald-500/40">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="font-display text-base font-bold tracking-wide text-zinc-100">frigg</span>
          </div>
          <p className="mt-3 max-w-xs text-[13px] text-zinc-500">{t.footer.tagline}</p>
          <p className="mt-1 text-[12px] text-zinc-600">{t.footer.madeWith}</p>
        </div>

        <nav className="flex flex-col gap-2 text-sm text-zinc-400">
          <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-600">
            {t.footer.docs}
          </span>
          <a className="transition-colors hover:text-zinc-100" href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">
            {t.footer.readme}
          </a>
          <a className="transition-colors hover:text-zinc-100" href={`${REPO_URL}/blob/main/DESIGN.md`} target="_blank" rel="noreferrer">
            {t.footer.design}
          </a>
          <a className="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-100" href={REPO_URL} target="_blank" rel="noreferrer">
            <IconGithub className="h-3.5 w-3.5" /> {t.footer.repo}
          </a>
        </nav>
      </div>
    </footer>
  );
}
