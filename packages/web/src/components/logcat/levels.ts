import type { LogLevel } from '@frigg/shared';

export const LOG_LEVELS: LogLevel[] = ['V', 'D', 'I', 'W', 'E', 'F'];

const LEVEL_RANK: Record<LogLevel, number> = {
  V: 0,
  D: 1,
  I: 2,
  W: 3,
  E: 4,
  F: 5,
};

export function levelRank(level: LogLevel): number {
  return LEVEL_RANK[level];
}

export function meetsThreshold(level: LogLevel, minLevel: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
}

export const LEVEL_TEXT_CLASS: Record<LogLevel, string> = {
  V: 'text-zinc-500',
  D: 'text-zinc-500',
  I: 'text-emerald-400',
  W: 'text-amber-400',
  E: 'text-rose-400',
  F: 'text-rose-400',
};

export const LEVEL_BADGE_CLASS: Record<LogLevel, string> = {
  V: 'border-zinc-700/60 text-zinc-500',
  D: 'border-zinc-700/60 text-zinc-500',
  I: 'border-emerald-500/30 text-emerald-400',
  W: 'border-amber-500/30 text-amber-400',
  E: 'border-rose-500/30 text-rose-400',
  F: 'border-rose-500/40 text-rose-400',
};
