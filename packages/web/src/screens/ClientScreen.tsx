import { useMemo } from 'react';
import { useAppStore } from '../store';
import { useT } from '../i18n';
import CollectionSidebar from '../components/client/CollectionSidebar';
import RequestEditor from '../components/client/RequestEditor';
import ResponsePanel from '../components/client/ResponsePanel';

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
        <div className="w-64 shrink-0 border-r border-zinc-800/80">
          <CollectionSidebar />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {selectedRequest ? (
            <>
              <div className="flex min-h-0 flex-[3] flex-col border-b border-zinc-800/80">
                <RequestEditor key={selectedRequest.id} request={selectedRequest} />
              </div>
              <div className="flex min-h-0 flex-[2] flex-col">
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
