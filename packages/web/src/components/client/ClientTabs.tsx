import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import { methodTextColor } from '../MethodBadge';
import { CloseIcon } from './shared';

export default function ClientTabs() {
  const t = useT();
  const requests = useAppStore((s) => s.apiRequests);
  const openTabIds = useAppStore((s) => s.openTabIds);
  const selectedApiRequestId = useAppStore((s) => s.selectedApiRequestId);
  const selectApiRequest = useAppStore((s) => s.selectApiRequest);
  const closeTab = useAppStore((s) => s.closeTab);

  if (openTabIds.length === 0) return null;

  const byId = new Map(requests.map((r) => [r.id, r] as const));

  return (
    <div className="flex shrink-0 items-stretch overflow-x-auto border-b border-zinc-800/80 bg-zinc-950/40">
      {openTabIds.map((id) => {
        const request = byId.get(id);
        if (!request) return null;
        const active = id === selectedApiRequestId;
        const label = request.name.trim().length > 0 ? request.name : t('client.tree.untitledRequest');
        return (
          <div
            key={id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            title={label}
            onClick={() => selectApiRequest(id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectApiRequest(id);
              }
            }}
            onPointerDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                closeTab(id);
              }
            }}
            className={`group flex max-w-52 shrink-0 cursor-pointer items-center gap-2 border-r border-zinc-800/80 px-3 py-2 text-[13px] transition-colors ${
              active
                ? 'bg-zinc-900 text-zinc-100'
                : 'text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300'
            }`}
          >
            <span className={`font-mono text-[10px] font-medium tracking-wider ${methodTextColor(request.method)}`}>
              {request.method.toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <button
              type="button"
              aria-label={t('action.close')}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(id);
              }}
              className={`shrink-0 rounded p-0.5 text-zinc-600 transition hover:bg-zinc-800 hover:text-zinc-300 ${
                active ? '' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
