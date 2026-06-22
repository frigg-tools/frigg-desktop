import { EventEmitter } from 'node:events';
import type { FridaScript, FridaServerStatus, FridaSessionStatus, FridaSnapshot, ServerEvent } from '@frigg/shared';
import { FRIDA_EXAMPLES } from './examples.ts';
import { FridaServerManager } from './frida-server-manager.ts';
import { FridaSession, type RunScriptOptions } from './frida-session.ts';

export class FridaManager extends EventEmitter {
  private readonly server = new FridaServerManager();
  private readonly session = new FridaSession();

  constructor() {
    super();
    const forward = (ev: ServerEvent): void => {
      this.emit('event', ev);
    };
    this.server.on('event', forward);
    this.session.on('event', forward);
  }

  examples(): FridaScript[] {
    return FRIDA_EXAMPLES.map((script) => ({ ...script }));
  }

  async snapshot(): Promise<FridaSnapshot> {
    return {
      serverStatus: this.server.status,
      sessionStatus: this.session.status,
      scripts: this.examples(),
      hostFridaVersion: await this.server.hostFridaVersion(),
    };
  }

  refreshServer(deviceId: string): Promise<FridaServerStatus> {
    return this.server.refresh(deviceId);
  }

  installServer(deviceId: string): Promise<FridaServerStatus> {
    return this.server.install(deviceId);
  }

  startServer(deviceId: string): Promise<FridaServerStatus> {
    return this.server.start(deviceId);
  }

  stopServer(deviceId?: string): Promise<FridaServerStatus> {
    return this.server.stop(deviceId);
  }

  runScript(opts: RunScriptOptions): Promise<FridaSessionStatus> {
    return this.session.run(opts);
  }

  stopScript(): Promise<FridaSessionStatus> {
    return this.session.stop();
  }

  async stop(): Promise<void> {
    await this.session.dispose();
    await this.server.dispose();
  }
}
