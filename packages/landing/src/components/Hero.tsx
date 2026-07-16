import { useT } from '../i18n';
import { detectArch, RELEASES_URL, REPO_URL, useRelease } from '../useRelease';
import { IconApple, IconGithub } from '../icons';
import HeroDemo from './HeroDemo';

export default function Hero() {
  const { t } = useT();
  const rel = useRelease();
  const arch = detectArch();

  const primary =
    rel.status === 'ready'
      ? (rel.release.assets.find((a) => a.arch === arch) ?? rel.release.assets[0])
      : null;
  const href = primary?.url ?? RELEASES_URL;

  return (
    <section id="top" className="relative overflow-hidden px-5 pt-32 pb-20 sm:px-8 sm:pt-40">
      <div className="dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-3 py-1 text-[12px] font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot" />
            {t.hero.eyebrow}
          </div>
          <h1 className="mt-6 font-display text-[2.1rem] font-bold leading-[1.08] tracking-tight text-balance text-zinc-50 sm:text-6xl sm:leading-[1.05]">
            {t.hero.title}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
            {t.hero.subtitle}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href={href}
              target={primary ? undefined : '_blank'}
              rel={primary ? undefined : 'noreferrer'}
              className="group inline-flex items-center gap-2.5 rounded-lg bg-emerald-500 px-5 py-3 font-medium text-emerald-950 shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-400 hover:shadow-emerald-500/30"
            >
              <IconApple className="h-5 w-5" />
              <span>{t.hero.download}</span>
              {rel.status === 'ready' && (
                <span className="rounded bg-emerald-950/20 px-1.5 py-0.5 font-mono text-[11px] text-emerald-900">
                  {rel.release.version}
                </span>
              )}
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-5 py-3 font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
            >
              <IconGithub className="h-5 w-5" />
              {t.hero.viewGithub}
            </a>
          </div>
          <p className="mt-4 text-[13px] text-zinc-600">{t.hero.freeNote}</p>
        </div>

        <div className="relative min-w-0">
          <HeroDemo />
        </div>
      </div>
    </section>
  );
}
