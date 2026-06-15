import { useMemo } from 'react';
import { useAppStore } from '../store';
import { useT } from '../i18n';
import CollectionSidebar from '../components/client/CollectionSidebar';
import CollectionRunReport from '../components/client/CollectionRunReport';
import ClientTabs from '../components/client/ClientTabs';
import RequestEditor from '../components/client/RequestEditor';
import ResponsePanel from '../components/client/ResponsePanel';
import { ResizeHandle, useResizable } from '../components/ResizeHandle';

function NoRequestState() {
  const t = useT();
  return (
    <div className="dot-grid flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-8 w-8 text-zinc-700"
      >
        <path d="M22 2 11 13" />
        <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
      </svg>
      <p className="text-sm text-zinc-500">{t('client.empty.noRequestTitle')}</p>
      <p className="max-w-64 text-xs text-zinc-600">{t('client.empty.noRequestHint')}</p>
    </div>
  );
}

export default function ClientScreen() {
  const t = useT();
  const requests = useAppStore((s) => s.apiRequests);
  const selectedApiRequestId = useAppStore((s) => s.selectedApiRequestId);
  const apiRunResult = useAppStore((s) => s.apiRunResult);
  const apiRunning = useAppStore((s) => s.apiRunning);

  const selectedRequest = useMemo(
    () => requests.find((r) => r.id === selectedApiRequestId) ?? null,
    [requests, selectedApiRequestId],
  );

  const sidebar = useResizable('client.sidebar', 256, { axis: 'x', min: 180, max: 520 });
  const response = useResizable('client.response', 280, { axis: 'y', min: 120, max: 700, invert: true });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-800/80 px-4 py-2.5">
        <h1 className="font-display text-base font-semibold tracking-wide text-zinc-100">
          {t('client.title')}
        </h1>
        <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-zinc-500">
          {requests.length}
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div style={{ width: sidebar.size }} className="shrink-0 border-r border-zinc-800/80">
          <CollectionSidebar />
        </div>
        <ResizeHandle axis="x" onPointerDown={sidebar.onPointerDown} />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <CollectionRunReport />
          <ClientTabs />
          {selectedRequest ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col">
                <RequestEditor key={selectedRequest.id} request={selectedRequest} />
              </div>
              <ResizeHandle axis="y" onPointerDown={response.onPointerDown} />
              <div
                style={{ height: response.size }}
                className="flex shrink-0 flex-col border-t border-zinc-800/80"
              >
                <ResponsePanel result={apiRunResult} running={apiRunning} />
              </div>
            </>
          ) : (
            <NoRequestState />
          )}
        </div>
      </div>
    </div>
  );
}
