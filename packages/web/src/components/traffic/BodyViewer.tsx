import { useMemo, useState } from 'react';
import type { BodyPayload } from '@frigg/shared';
import { formatBytes } from './format';

interface BodyViewerProps {
  body: BodyPayload;
  contentType?: string;
}

export default function BodyViewer({ body, contentType }: BodyViewerProps) {
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    if (body.encoding === 'base64' || body.data.length === 0) {
      return body.data;
    }
    try {
      return JSON.stringify(JSON.parse(body.data), null, 2);
    } catch {
      return body.data;
    }
  }, [body]);

  const copy = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };

  if (body.size === 0) {
    return <p className="px-4 text-xs text-zinc-600">No body</p>;
  }

  if (body.encoding === 'base64') {
    return (
      <div className="px-4">
        <div className="rounded-md border border-zinc-800/80 px-3 py-2 font-mono text-xs text-zinc-500">
          binary · {formatBytes(body.size)}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4">
      <div className="overflow-hidden rounded-md border border-zinc-800/80">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/50 px-2.5 py-1">
          <span className="min-w-0 truncate font-mono text-[10px] text-zinc-500">
            {contentType ?? 'text'} · {formatBytes(body.size)}
            {body.truncated ? ' · truncated' : ''}
          </span>
          <button
            type="button"
            onClick={copy}
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest transition active:scale-[0.98] ${
              copied ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all px-2.5 py-2 font-mono text-xs leading-relaxed text-zinc-300">
          {text}
        </pre>
      </div>
    </div>
  );
}
