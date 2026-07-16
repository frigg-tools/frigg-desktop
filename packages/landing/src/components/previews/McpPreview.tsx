import { useT } from '../../i18n';
import { AppWindow } from './shared';

export default function McpPreview() {
  const { t } = useT();
  return (
    <AppWindow title={<span className="normal-case tracking-normal text-zinc-400">{t.previews.mcp.title}</span>}>
      <div className="space-y-2.5 p-3.5 text-[12px]">
        <div className="flex justify-end">
          <span className="max-w-[80%] rounded-lg rounded-br-sm bg-zinc-800/70 px-3 py-2 text-zinc-200">
            {t.previews.mcp.ask}
          </span>
        </div>

        <div className="space-y-1.5">
          {[
            { tool: 'frigg_list_traffic', arg: '{ host: "pay.acme.dev" }', out: '3 requests · 1 failing (500)' },
            { tool: 'frigg_create_mock_rule', arg: '{ match: "/charges/*", status: 200 }', out: '✓ rule created · ⚡ on' },
          ].map((c) => (
            <div key={c.tool} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 font-mono">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-emerald-400">tool</span>
                <span className="text-emerald-300">{c.tool}</span>
              </div>
              <div className="mt-1 truncate text-[11px] text-zinc-500">{c.arg}</div>
              <div className="mt-1 text-[11px] text-zinc-300">→ {c.out}</div>
            </div>
          ))}
        </div>

        <div className="flex justify-start">
          <span className="max-w-[85%] rounded-lg rounded-bl-sm bg-zinc-900/80 px-3 py-2 text-zinc-300 ring-1 ring-zinc-800">
            {t.previews.mcp.reply}
          </span>
        </div>
      </div>
    </AppWindow>
  );
}
