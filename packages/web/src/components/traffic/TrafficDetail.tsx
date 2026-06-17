import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TrafficExchange } from '@frigg/shared';
import MethodBadge from '../MethodBadge';
import StatusCode from '../StatusCode';
import MockChip from '../MockChip';
import HeadersTable from './HeadersTable';
import BodyViewer from './BodyViewer';
import FindBar from '../FindBar';
import CopyButton from './CopyButton';
import { highlightMatches } from './find';
import { dumpRequest, dumpResponse, requestToCurl } from './copy';
import { useT } from '../../i18n';
import { findHeader, formatDuration } from './format';

interface TrafficDetailProps {
  exchange: TrafficExchange;
  onClose: () => void;
  onCreateMock: (exchange: TrafficExchange) => void;
}

type DetailTab = 'request' | 'response';

const TABS: DetailTab[] = ['request', 'response'];

const TAB_KEYS: Record<DetailTab, string> = {
  request: 'traffic.tab.request',
  response: 'traffic.tab.response',
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 pb-1.5 pt-4 text-[10px] uppercase tracking-widest text-zinc-500">
      {children}
    </p>
  );
}

function RequestPane({ exchange, query }: { exchange: TrafficExchange; query: string }) {
  const t = useT();
  const { request } = exchange;
  return (
    <div className="pb-6">
      <div className="flex justify-end px-4 pt-3">
        <CopyButton text={dumpRequest(request)} label={t('traffic.copyAll')} icon />
      </div>
      {request.query ? (
        <>
          <SectionLabel>{t('traffic.section.query')}</SectionLabel>
          <p className="break-all px-4 font-mono text-xs text-zinc-300">
            {query ? highlightMatches(request.query, query) : request.query}
          </p>
        </>
      ) : null}
      <SectionLabel>{t('traffic.section.headers')}</SectionLabel>
      <HeadersTable headers={request.headers} query={query} />
      <SectionLabel>{t('traffic.section.body')}</SectionLabel>
      <BodyViewer body={request.body} contentType={findHeader(request.headers, 'content-type')} query={query} />
    </div>
  );
}

function ResponsePane({ exchange, query }: { exchange: TrafficExchange; query: string }) {
  const t = useT();
  const { response } = exchange;
  if (exchange.state === 'aborted') {
    return (
      <div className="px-4 py-6">
        <p className="text-[13px] font-medium text-rose-400">{t('traffic.aborted')}</p>
        {exchange.abortedReason ? (
          <p className="mt-1 font-mono text-xs text-zinc-500">{exchange.abortedReason}</p>
        ) : null}
      </div>
    );
  }
  if (!response) {
    return (
      <div className="flex items-center gap-2 px-4 py-6">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-zinc-500" />
        <p className="text-[13px] text-zinc-500">{t('traffic.awaitingResponse')}</p>
      </div>
    );
  }
  return (
    <div className="pb-6">
      <div className="flex items-center gap-3 px-4 pt-4">
        <StatusCode code={response.statusCode} />
        {response.statusMessage ? (
          <span className="text-[13px] text-zinc-400">{response.statusMessage}</span>
        ) : null}
        <span className="font-mono text-xs tabular-nums text-zinc-500">
          {formatDuration(response.durationMs)}
        </span>
        {response.mockRuleId ? <MockChip /> : null}
        <div className="ml-auto">
          <CopyButton text={dumpResponse(response)} label={t('traffic.copyAll')} icon />
        </div>
      </div>
      <SectionLabel>{t('traffic.section.headers')}</SectionLabel>
      <HeadersTable headers={response.headers} query={query} />
      <SectionLabel>{t('traffic.section.body')}</SectionLabel>
      <BodyViewer body={response.body} contentType={findHeader(response.headers, 'content-type')} query={query} />
    </div>
  );
}

export default function TrafficDetail({ exchange, onClose, onCreateMock }: TrafficDetailProps) {
  const t = useT();
  const [tab, setTab] = useState<DetailTab>('request');
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const { request, response } = exchange;

  const effectiveQuery = findOpen ? query : '';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFindOpen(true);
        requestAnimationFrame(() => {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (findOpen) {
      requestAnimationFrame(() => findInputRef.current?.focus());
    }
  }, [findOpen]);

  useEffect(() => {
    const count = scrollRef.current?.querySelectorAll('mark.find-match').length ?? 0;
    setTotalMatches(count);
    setActiveMatch(0);
  }, [effectiveQuery, tab, exchange]);

  useEffect(() => {
    const marks = scrollRef.current?.querySelectorAll('mark.find-match');
    if (!marks) return;
    marks.forEach((m) => m.classList.remove('find-active'));
    const target = marks[activeMatch];
    if (target) {
      target.classList.add('find-active');
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeMatch, totalMatches, effectiveQuery]);

  const closeFind = () => setFindOpen(false);
  const nextMatch = () => {
    if (totalMatches > 0) setActiveMatch((i) => (i + 1) % totalMatches);
  };
  const prevMatch = () => {
    if (totalMatches > 0) setActiveMatch((i) => (i - 1 + totalMatches) % totalMatches);
  };

  return (
    <aside className="relative flex h-full min-w-0 flex-col bg-zinc-900/40">
      <div className="flex items-start gap-2 border-b border-zinc-800/80 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <MethodBadge method={request.method} />
            <span
              className={`rounded border px-1.5 py-px text-[9px] font-medium uppercase tracking-widest ${
                request.protocol === 'https'
                  ? 'border-emerald-500/30 text-emerald-400'
                  : 'border-zinc-700 text-zinc-400'
              }`}
            >
              {request.protocol}
            </span>
            {response?.mockRuleId ? <MockChip /> : null}
          </div>
          <p className="mt-1.5 break-all font-mono text-xs leading-relaxed text-zinc-300">
            {request.url}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('traffic.closeDetail')}
          className="rounded p-1 text-zinc-500 transition hover:text-zinc-200"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-3.5 w-3.5"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 px-4 py-2">
        <div className="flex rounded-md border border-zinc-800 p-0.5">
          {TABS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTab(option)}
              className={`rounded px-3 py-1 text-[10px] font-medium uppercase tracking-widest transition ${
                tab === option
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t(TAB_KEYS[option])}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CopyButton text={requestToCurl(request)} label={t('traffic.copyCurl')} />
          <button
            type="button"
            onClick={() => onCreateMock(exchange)}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
            </svg>
            {t('traffic.createMock')}
          </button>
        </div>
      </div>
      {findOpen ? (
        <div className="flex justify-end border-b border-zinc-800/80 bg-zinc-900/60 px-3 py-1.5">
          <FindBar
            query={query}
            onQuery={setQuery}
            total={totalMatches}
            active={totalMatches === 0 ? 0 : activeMatch + 1}
            onNext={nextMatch}
            onPrev={prevMatch}
            onClose={closeFind}
            inputRef={findInputRef}
            placeholder={t('traffic.find.placeholder')}
            noneLabel={t('traffic.find.none')}
            prevLabel={t('traffic.find.prev')}
            nextLabel={t('traffic.find.next')}
          />
        </div>
      ) : null}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'request' ? (
          <RequestPane exchange={exchange} query={effectiveQuery} />
        ) : (
          <ResponsePane exchange={exchange} query={effectiveQuery} />
        )}
      </div>
    </aside>
  );
}
