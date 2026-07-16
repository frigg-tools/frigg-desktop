import { useState } from 'react';
import { useT } from '../i18n';
import { detectArch, formatSize, RELEASES_URL, type Arch, type DmgAsset, useRelease } from '../useRelease';
import { useReveal } from '../useReveal';
import { IconApple } from '../icons';

function CopyableCommand({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(cmd).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      },
      () => {},
    );
  };
  return (
    <button
      onClick={copy}
      className="group flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-left font-mono text-[12.5px] text-zinc-300 transition-colors hover:border-zinc-700"
    >
      <span className="select-none text-emerald-500">$</span>
      <code className="min-w-0 flex-1 truncate">{cmd}</code>
      <span className="shrink-0 text-[11px] uppercase tracking-wider text-zinc-500 group-hover:text-zinc-300">
        {copied ? '✓' : 'copy'}
      </span>
    </button>
  );
}

function ArchCard({
  asset,
  label,
  version,
  recommended,
}: {
  asset: DmgAsset | undefined;
  label: string;
  version: string;
  recommended: boolean;
}) {
  const { t } = useT();
  const disabled = !asset;
  return (
    <a
      href={asset?.url ?? RELEASES_URL}
      target={asset ? undefined : '_blank'}
      rel={asset ? undefined : 'noreferrer'}
      aria-disabled={disabled}
      className={`relative flex flex-col rounded-xl border p-5 transition-all ${
        recommended
          ? 'border-emerald-500/50 bg-emerald-500/5 hover:bg-emerald-500/10'
          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
      } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      {recommended && (
        <span className="absolute right-4 top-4 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
          ✓
        </span>
      )}
      <IconApple className="h-7 w-7 text-zinc-300" />
      <span className="mt-3 font-display text-lg font-semibold text-zinc-100">{label}</span>
      <div className="mt-1 flex items-center gap-3 font-mono text-[11px] text-zinc-500">
        {version && <span>{version}</span>}
        {asset && <span>· {formatSize(asset.size)}</span>}
      </div>
      <span
        className={`mt-5 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${
          recommended
            ? 'bg-emerald-500 text-emerald-950'
            : 'border border-zinc-700 bg-zinc-800/60 text-zinc-200'
        }`}
      >
        <IconApple className="h-4 w-4" />
        {t.hero.downloadGeneric} .dmg
      </span>
    </a>
  );
}

export default function Download() {
  const { t } = useT();
  const rel = useRelease();
  const arch = detectArch();
  const { ref, shown } = useReveal<HTMLDivElement>();

  const version = rel.status === 'ready' ? rel.release.version : '';
  const find = (a: Arch): DmgAsset | undefined =>
    rel.status === 'ready' ? rel.release.assets.find((x) => x.arch === a) : undefined;

  return (
    <section id="download" className="border-t border-zinc-900 px-5 py-24 sm:px-8">
      <div ref={ref} className={`reveal ${shown ? 'in' : ''} mx-auto max-w-5xl`}>
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-400">
            {t.download.eyebrow}
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
            {t.download.title}
          </h2>
          <p className="mt-4 text-zinc-400">{t.download.subtitle}</p>
        </div>

        {rel.status === 'loading' && (
          <p className="mt-10 text-center font-mono text-sm text-zinc-500">{t.download.loading}</p>
        )}

        {rel.status === 'error' && (
          <p className="mt-10 text-center text-sm text-zinc-400">
            {t.download.failed}{' '}
            <a className="text-emerald-400 underline" href={RELEASES_URL} target="_blank" rel="noreferrer">
              {t.download.releasesPage} →
            </a>
          </p>
        )}

        {rel.status !== 'error' && (
          <div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
            <ArchCard asset={find('apple')} label={t.download.apple} version={version} recommended={arch === 'apple'} />
            <ArchCard asset={find('intel')} label={t.download.intel} version={version} recommended={arch === 'intel'} />
          </div>
        )}

        <div className="mx-auto mt-12 grid max-w-2xl gap-6">
          <div>
            <h3 className="font-display text-sm font-semibold text-zinc-200">{t.download.gatekeeperTitle}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-400">{t.download.gatekeeper}</p>
            <div className="mt-3">
              <CopyableCommand cmd="xattr -dr com.apple.quarantine /Applications/Frigg.app" />
            </div>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold text-zinc-200">{t.download.sourceTitle}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-400">{t.download.source}</p>
            <div className="mt-3 grid gap-2">
              <CopyableCommand cmd="git clone https://github.com/frigg-tools/frigg-desktop.git" />
              <CopyableCommand cmd="npm install && npm run desktop" />
            </div>
            <p className="mt-3 text-[12.5px] text-zinc-600">{t.download.otherOs}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
