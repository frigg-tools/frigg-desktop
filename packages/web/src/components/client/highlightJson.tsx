import type { ReactNode } from 'react';

const TOKEN =
  /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(\{\{[\w.-]+\}\})|(\b(?:true|false|null)\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

const CLASS_BY_GROUP = [
  'text-sky-300',
  'text-emerald-300',
  'text-amber-300',
  'text-violet-300',
  'text-amber-200',
];

export function highlightJson(source: string): ReactNode {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of source.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(<span key={key++}>{source.slice(lastIndex, index)}</span>);
    }
    const groupIndex = match.slice(1).findIndex((group) => group !== undefined);
    nodes.push(
      <span key={key++} className={CLASS_BY_GROUP[groupIndex]}>
        {match[0]}
      </span>,
    );
    lastIndex = index + match[0].length;
  }
  if (lastIndex < source.length) {
    nodes.push(<span key={key++}>{source.slice(lastIndex)}</span>);
  }
  return nodes;
}

const VAR_TOKEN = /\{\{[\w.-]+\}\}/g;

export function highlightVars(source: string): ReactNode {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of source.matchAll(VAR_TOKEN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(<span key={key++}>{source.slice(lastIndex, index)}</span>);
    nodes.push(
      <span key={key++} className="text-amber-300">
        {match[0]}
      </span>,
    );
    lastIndex = index + match[0].length;
  }
  if (lastIndex < source.length) nodes.push(<span key={key++}>{source.slice(lastIndex)}</span>);
  return nodes;
}

export interface JsonError {
  message: string;
}

export function jsonError(source: string): JsonError | null {
  if (source.trim() === '') return null;
  try {
    JSON.parse(source);
    return null;
  } catch (error) {
    return { message: error instanceof Error ? error.message : 'Invalid JSON' };
  }
}
