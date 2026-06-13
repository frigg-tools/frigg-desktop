import type { ServerEvent } from '@frigg/shared';

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 5000;

export function connectWs(
  onEvent: (ev: ServerEvent) => void,
  onStatus: (connected: boolean) => void,
): () => void {
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let backoffMs = INITIAL_BACKOFF_MS;
  let disposed = false;

  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${scheme}://${window.location.host}/ws`;

  const open = () => {
    if (disposed) return;
    socket = new WebSocket(url);
    socket.onopen = () => {
      backoffMs = INITIAL_BACKOFF_MS;
      onStatus(true);
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        onEvent(JSON.parse(event.data) as ServerEvent);
      } catch {
        return;
      }
    };
    socket.onclose = () => {
      if (disposed) return;
      onStatus(false);
      reconnectTimer = window.setTimeout(open, backoffMs);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    };
    socket.onerror = () => {
      socket?.close();
    };
  };

  open();

  return () => {
    disposed = true;
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
    }
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    }
  };
}
