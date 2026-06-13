import { describe, expect, it } from 'vitest';
import type { CapturedRequest, CapturedResponse } from '@frigg/shared';
import { TrafficStore } from '../src/proxy/traffic-store.ts';

function buildRequest(id: string): CapturedRequest {
  return {
    id,
    timestamp: 0,
    method: 'GET',
    url: `http://example.com/${id}`,
    protocol: 'http',
    host: 'example.com',
    path: `/${id}`,
    query: '',
    headers: {},
    body: { encoding: 'utf8', data: '', size: 0, truncated: false },
  };
}

function buildResponse(id: string): CapturedResponse {
  return {
    id,
    timestamp: 1,
    statusCode: 200,
    headers: {},
    body: { encoding: 'utf8', data: '', size: 0, truncated: false },
    durationMs: 1,
  };
}

describe('TrafficStore', () => {
  it('completes a response for a request still in the buffer', () => {
    const store = new TrafficStore(10);
    store.addRequest(buildRequest('a'));
    const exchange = store.completeResponse(buildResponse('a'));
    expect(exchange?.state).toBe('completed');
    expect(store.list()[0].response?.statusCode).toBe(200);
  });

  it('does not evict a pending request when newer completed exchanges can be dropped instead', () => {
    const store = new TrafficStore(2);
    store.addRequest(buildRequest('pending'));
    store.addRequest(buildRequest('b'));
    store.completeResponse(buildResponse('b'));
    store.addRequest(buildRequest('c'));
    store.completeResponse(buildResponse('c'));
    store.addRequest(buildRequest('d'));
    store.completeResponse(buildResponse('d'));

    const ids = store.list().map((e) => e.id);
    expect(ids).toContain('pending');

    const completed = store.completeResponse(buildResponse('pending'));
    expect(completed?.state).toBe('completed');
  });

  it('tracks an all-time total independent of the live buffer size', () => {
    const store = new TrafficStore(1);
    store.addRequest(buildRequest('a'));
    store.addRequest(buildRequest('b'));
    store.completeResponse(buildResponse('a'));
    store.completeResponse(buildResponse('b'));
    expect(store.total).toBe(2);
    expect(store.list().length).toBeLessThanOrEqual(1);
  });
});
