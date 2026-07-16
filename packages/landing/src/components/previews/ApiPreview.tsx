import { useT } from '../../i18n';
import { AppWindow, MethodChip } from './shared';

function Var({ children }: { children: string }) {
  return <span className="rounded bg-violet-500/15 px-1 text-violet-300 ring-1 ring-violet-500/25">{`{{${children}}}`}</span>;
}

export default function ApiPreview() {
  const { t } = useT();
  return (
    <AppWindow title={<span className="normal-case tracking-normal text-zinc-400">{t.previews.api.title}</span>}>
      <div className="flex border-b border-zinc-800 text-[11.5px]">
        {['POST /v2/orders', 'GET /v2/feed', '+ '].map((tab, i) => (
          <span
            key={tab}
            className={`border-r border-zinc-800 px-3 py-2 font-mono ${
              i === 0 ? 'bg-zinc-900 text-zinc-200' : 'text-zinc-500'
            } ${i === 2 ? 'text-zinc-600' : ''}`}
          >
            {tab}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 px-3 py-3">
        <MethodChip method="POST" />
        <div className="flex min-w-0 flex-1 items-center rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 font-mono text-[12px]">
          <span className="truncate text-zinc-300">
            <Var>baseUrl</Var>
            /v2/orders
          </span>
        </div>
        <span className="shrink-0 rounded-md bg-emerald-500 px-3 py-1.5 text-[12px] font-medium text-emerald-950">
          Send
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-zinc-800/60 font-mono text-[11.5px]">
        <div className="bg-zinc-900/60 p-3">
          <div className="mb-1.5 text-[10px] uppercase tracking-widest text-zinc-600">Body · JSON</div>
          <pre className="leading-relaxed text-zinc-400">
            <span className="text-zinc-600">{'{'}</span>
            {'\n  '}
            <span className="text-sky-300">"item"</span>: <Var>sku</Var>,
            {'\n  '}
            <span className="text-sky-300">"qty"</span>: <span className="text-amber-300">2</span>,
            {'\n  '}
            <span className="text-sky-300">"token"</span>: <Var>authToken</Var>
            {'\n'}
            <span className="text-zinc-600">{'}'}</span>
          </pre>
        </div>
        <div className="bg-zinc-900/60 p-3">
          <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-widest">
            <span className="text-zinc-600">Response</span>
            <span className="text-emerald-400">201 · 243ms</span>
          </div>
          <pre className="leading-relaxed text-zinc-400">
            <span className="text-zinc-600">{'{'}</span>
            {'\n  '}
            <span className="text-sky-300">"id"</span>: <span className="text-emerald-300">"ord_8f2"</span>,
            {'\n  '}
            <span className="text-sky-300">"status"</span>: <span className="text-emerald-300">"paid"</span>
            {'\n'}
            <span className="text-zinc-600">{'}'}</span>
          </pre>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-zinc-800 px-3 py-2 text-[11px]">
        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300 ring-1 ring-emerald-500/25">
          ✓ pm.test "status is 201"
        </span>
        <span className="font-mono text-zinc-600">{t.previews.api.env}: staging</span>
      </div>
    </AppWindow>
  );
}
