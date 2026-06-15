import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  BreakpointRule,
  BreakpointRuleInput,
  BreakpointResume,
  BreakpointsSnapshot,
  PausedExchange,
  PausedRequestData,
  PausedResponseData,
  ServerEvent,
} from '@frigg/shared';

interface PausedEntry {
  exchange: PausedExchange;
  resolve: (resume: BreakpointResume) => void;
}

export class BreakpointManager extends EventEmitter {
  private enabled = false;
  private rules: BreakpointRule[] = [];
  private readonly paused = new Map<string, PausedEntry>();

  snapshot(): BreakpointsSnapshot {
    return {
      enabled: this.enabled,
      rules: [...this.rules],
      paused: [...this.paused.values()].map((entry) => entry.exchange),
    };
  }

  setEnabled(enabled: boolean): BreakpointsSnapshot {
    this.enabled = enabled;
    this.emitUpdated();
    return this.snapshot();
  }

  createRule(input: BreakpointRuleInput): BreakpointRule {
    const rule: BreakpointRule = {
      ...input,
      id: randomUUID(),
      createdAt: Date.now(),
    };
    this.rules.push(rule);
    this.emitUpdated();
    return rule;
  }

  updateRule(id: string, patch: Partial<BreakpointRuleInput>): BreakpointsSnapshot {
    const index = this.rules.findIndex((rule) => rule.id === id);
    if (index === -1) {
      throw new Error('not found');
    }
    const existing = this.rules[index];
    this.rules[index] = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
    };
    this.emitUpdated();
    return this.snapshot();
  }

  deleteRule(id: string): BreakpointsSnapshot {
    const index = this.rules.findIndex((rule) => rule.id === id);
    if (index === -1) {
      throw new Error('not found');
    }
    this.rules.splice(index, 1);
    this.emitUpdated();
    return this.snapshot();
  }

  matchRule(method: string, url: string, want: 'request' | 'response'): BreakpointRule | null {
    if (!this.enabled) return null;
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.direction !== want && rule.direction !== 'both') continue;
      if (!methodMatches(rule.matcher.method, method)) continue;
      if (!urlMatches(rule.matcher.urlPattern, url)) continue;
      return rule;
    }
    return null;
  }

  pauseRequest(ruleId: string, data: PausedRequestData): Promise<BreakpointResume> {
    const exchange: PausedExchange = {
      id: randomUUID(),
      ruleId,
      direction: 'request',
      createdAt: Date.now(),
      request: data,
    };
    return this.register(exchange);
  }

  pauseResponse(
    ruleId: string,
    requestData: PausedRequestData,
    responseData: PausedResponseData,
  ): Promise<BreakpointResume> {
    const exchange: PausedExchange = {
      id: randomUUID(),
      ruleId,
      direction: 'response',
      createdAt: Date.now(),
      request: requestData,
      response: responseData,
    };
    return this.register(exchange);
  }

  resume(id: string, resume: BreakpointResume): void {
    const entry = this.paused.get(id);
    if (!entry) return;
    this.paused.delete(id);
    entry.resolve(resume);
    this.emit('event', { type: 'breakpoint-resumed', id } satisfies ServerEvent);
  }

  releaseAll(): void {
    for (const entry of this.paused.values()) {
      entry.resolve({ action: 'abort' });
    }
    this.paused.clear();
  }

  private register(exchange: PausedExchange): Promise<BreakpointResume> {
    return new Promise<BreakpointResume>((resolve) => {
      this.paused.set(exchange.id, { exchange, resolve });
      this.emit('event', { type: 'breakpoint-paused', paused: exchange } satisfies ServerEvent);
    });
  }

  private emitUpdated(): void {
    this.emit('event', {
      type: 'breakpoints-updated',
      snapshot: this.snapshot(),
    } satisfies ServerEvent);
  }
}

function methodMatches(matcherMethod: string | undefined, method: string): boolean {
  if (matcherMethod === undefined || matcherMethod === '') return true;
  return matcherMethod.toLowerCase() === method.toLowerCase();
}

function urlMatches(urlPattern: string, url: string): boolean {
  if (urlPattern === '') return true;
  return url.toLowerCase().includes(urlPattern.toLowerCase());
}
