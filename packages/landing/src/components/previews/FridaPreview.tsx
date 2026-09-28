import { useT } from '../../i18n';
import { AppWindow, Live } from './shared';

export default function FridaPreview() {
  const { t } = useT();

  return (
    <AppWindow title={<span className="normal-case tracking-normal text-zinc-400">{t.previews.frida.title}</span>}>
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2 font-mono text-[10px]">
        <span className="text-zinc-400">Pixel_7_API_35</span>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-300">{t.previews.frida.rooted}</span>
        <span className="ml-auto flex items-center gap-1.5 text-emerald-300">
          <Live label={t.previews.frida.server} />
        </span>
      </div>
      <div className="grid min-h-[205px] grid-cols-2 font-mono text-[10.5px]">
        <div className="border-r border-zinc-800 bg-zinc-950/50 px-3 py-3 leading-[1.8]">
          <p className="text-zinc-600">{t.previews.frida.target}</p>
          <p className="mb-3 truncate rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-300">
            com.example.shop
          </p>
          <p><span className="text-violet-300">Java.perform</span><span className="text-zinc-400">(() =&gt; {'{'}</span></p>
          <p className="pl-2 text-zinc-400">const app = Java.use(</p>
          <p className="pl-3 text-emerald-300">'com.example.shop.Cart'</p>
          <p className="text-zinc-400">); {'}'})</p>
          <button type="button" className="mt-3 rounded bg-emerald-500/15 px-2.5 py-1 text-emerald-300">
            {t.previews.frida.run}
          </button>
        </div>
        <div className="flex min-w-0 flex-col">
          <p className="border-b border-zinc-800 px-3 py-2 text-[9px] uppercase tracking-wider text-zinc-600">
            {t.previews.frida.output}
          </p>
          <div className="space-y-2 px-3 py-3 leading-relaxed">
            <p className="text-zinc-500">[Frida] {t.previews.frida.attached}</p>
            <p className="text-emerald-300">[Cart] item count: 2</p>
            <p className="text-zinc-500">[Frida] {t.previews.frida.waiting}</p>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}
