import type http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ServerEvent } from '@frigg/shared';

export class WsHub {
  private readonly wss: WebSocketServer;

  constructor(httpServer: http.Server, path: '/ws') {
    this.wss = new WebSocketServer({ server: httpServer, path });
    this.wss.on('error', () => {});
    this.wss.on('connection', (client) => {
      client.on('error', () => {});
    });
  }

  broadcast(ev: ServerEvent): void {
    const payload = JSON.stringify(ev);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }
}
