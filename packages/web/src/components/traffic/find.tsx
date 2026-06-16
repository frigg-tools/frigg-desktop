import type { ReactNode } from 'react';
import type { BodyPayload } from '@frigg/shared';

export function bodyToText(body: BodyPayload): string {
  if (body.encoding === 'base64' || body.data.length === 0) {
    return body.data;
  }
  try {
    return JSON.stringify(JSON.parse(body.data), null, 2);
  } catch {
    return body.data;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightMatches(text: string, query: string): ReactNode {
  const needle = query.trim();
  if (needle === '') return text;
  const pattern = new RegExp(escapeRegExp(needle), 'gi');
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push(
      <mark key={key++} className="find-match">
        {match[0]}
      </mark>,
    );
    lastIndex = match.index + match[0].length;
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
