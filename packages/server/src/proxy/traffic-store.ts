import { EventEmitter } from 'node:events';
import { TRAFFIC_BUFFER_LIMIT } from '@frigg/shared';
import type {
  CapturedRequest,
  CapturedResponse,
  ServerEvent,
  TrafficExchange,
} from '@frigg/shared';

export class TrafficStore extends EventEmitter {
  private readonly limit: number;
  private readonly exchanges = new Map<string, TrafficExchange>();
  private allTimeCount = 0;

  constructor(limit: number = TRAFFIC_BUFFER_LIMIT) {
    super();
    this.limit = limit;
  }

  addRequest(req: CapturedRequest): TrafficExchange {
    const exchange: TrafficExchange = { id: req.id, request: req, state: 'pending' };
    this.exchanges.set(exchange.id, exchange);
    this.allTimeCount += 1;
    this.evictBeyondLimit();
    this.emitEvent({ type: 'request', exchange });
    return exchange;
  }

  completeResponse(res: CapturedResponse): TrafficExchange | undefined {
    const exchange = this.exchanges.get(res.id);
    if (!exchange) return undefined;
    exchange.response = res;
    exchange.state = 'completed';
    this.emitEvent({ type: 'response', exchange });
    return exchange;
  }

  abort(id: string, reason?: string): TrafficExchange | undefined {
    const exchange = this.exchanges.get(id);
    if (!exchange) return undefined;
    exchange.state = 'aborted';
    if (reason !== undefined) exchange.abortedReason = reason;
    this.emitEvent({ type: 'abort', exchange });
    return exchange;
  }

  list(): TrafficExchange[] {
    return [...this.exchanges.values()];
  }

  get total(): number {
    return this.allTimeCount;
  }

  clear(): void {
    this.exchanges.clear();
    this.emitEvent({ type: 'traffic-cleared' });
  }

  private evictBeyondLimit(): void {
    while (this.exchanges.size > this.limit) {
      const evictId = this.oldestEvictableId();
      if (evictId === undefined) return;
      this.exchanges.delete(evictId);
    }
  }

  private oldestEvictableId(): string | undefined {
    let oldestId: string | undefined;
    for (const [id, exchange] of this.exchanges) {
      if (oldestId === undefined) oldestId = id;
      if (exchange.state !== 'pending') return id;
    }
    return oldestId;
  }

  private emitEvent(ev: ServerEvent): void {
    this.emit('event', ev);
  }
}
