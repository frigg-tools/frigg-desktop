import { DEFAULT_PROXY_PORT } from '@frigg/shared';
import type { DeviceProxyStatus } from '@frigg/shared';
import type { EngineDeps } from '../proxy/engine.ts';
import { ProxyEngine } from '../proxy/engine.ts';
import { DeviceProxyRegistry } from './device-proxy-registry.ts';

export interface DeviceProxyTarget {
  id: string;
  platform: 'android' | 'ios-simulator' | 'ios-device';
  name: string;
  host: string | null;
}

type SharedEngineDeps = Omit<
  EngineDeps,
  'proxyPort' | 'clientDeviceId' | 'breakpointOwnerId' | 'allowEphemeralFallback'
>;

interface DeviceProxyManagerDeps extends SharedEngineDeps {
  sharedProxyPort: number;
  registry: DeviceProxyRegistry;
}

interface ManagedProxy {
  engine: ProxyEngine;
  target: DeviceProxyTarget;
  port: number;
}

export class DeviceProxyManager {
  private readonly listeners = new Map<string, ManagedProxy>();
  private readonly statuses = new Map<string, DeviceProxyStatus>();
  private operationTail: Promise<void> = Promise.resolve();
  private reconcileRevision = 0;

  constructor(private readonly deps: DeviceProxyManagerDeps) {}

  beginReconcile(): number {
    this.reconcileRevision += 1;
    return this.reconcileRevision;
  }

  reconcile(targets: DeviceProxyTarget[], revision = this.beginReconcile()): Promise<void> {
    return this.enqueue(async () => {
      if (revision !== this.reconcileRevision) return;
      const current = new Map(targets.map((target) => [target.id, target]));
      for (const [id, managed] of this.listeners) {
        if (revision !== this.reconcileRevision) return;
        if (current.has(id)) continue;
        this.listeners.delete(id);
        this.statuses.delete(id);
        await managed.engine.stop().catch(() => undefined);
      }
      if (revision !== this.reconcileRevision) return;
      for (const id of this.statuses.keys()) {
        if (!current.has(id)) this.statuses.delete(id);
      }
      for (const target of current.values()) {
        if (revision !== this.reconcileRevision) return;
        await this.ensureTargetNow(target);
      }
    });
  }

  ensureTarget(target: DeviceProxyTarget): Promise<DeviceProxyStatus> {
    this.beginReconcile();
    return this.enqueue(() => this.ensureTargetNow(target));
  }

  getStatus(id: string): DeviceProxyStatus | undefined {
    const status = this.statuses.get(id);
    return status ? { ...status } : undefined;
  }

  reloadAll(): Promise<void> {
    return this.enqueue(async () => {
      await Promise.all([...this.listeners.entries()].map(async ([id, managed]) => {
        try {
          await managed.engine.reload();
          this.statuses.set(id, { host: managed.target.host, port: managed.port, ready: true });
        } catch (error) {
          this.statuses.set(id, {
            host: managed.target.host,
            port: managed.port,
            ready: false,
            error: this.errorMessage(error),
          });
        }
      }));
    });
  }

  stop(): Promise<void> {
    return this.enqueue(async () => {
      const listeners = [...this.listeners.values()];
      this.listeners.clear();
      this.statuses.clear();
      await Promise.allSettled(listeners.map(({ engine }) => engine.stop()));
      await this.deps.registry.flush();
    });
  }

  private async ensureTargetNow(target: DeviceProxyTarget): Promise<DeviceProxyStatus> {
    let port: number | null;
    try {
      port = await this.deps.registry.getOrAssign(
        target.id,
        new Set([DEFAULT_PROXY_PORT, this.deps.sharedProxyPort]),
      );
    } catch (error) {
      const status: DeviceProxyStatus = {
        host: target.host,
        port: this.deps.registry.get(target.id) ?? null,
        ready: false,
        error: this.errorMessage(error),
      };
      this.statuses.set(target.id, status);
      return status;
    }
    if (port === null) {
      const status: DeviceProxyStatus = {
        host: target.host,
        port: null,
        ready: false,
        error: 'No device proxy ports remain in the range 10000–19999.',
      };
      this.statuses.set(target.id, status);
      return status;
    }

    let managed = this.listeners.get(target.id);
    if (!managed) {
      managed = {
        target,
        port,
        engine: new ProxyEngine({
          proxyPort: port,
          clientDeviceId: target.id,
          breakpointOwnerId: target.id,
          allowEphemeralFallback: false,
          ca: this.deps.ca,
          mocks: this.deps.mocks,
          traffic: this.deps.traffic,
          breakpoints: this.deps.breakpoints,
          proxyCerts: this.deps.proxyCerts,
        }),
      };
      this.listeners.set(target.id, managed);
    } else {
      managed.target = target;
    }

    try {
      await managed.engine.start();
      const status: DeviceProxyStatus = { host: target.host, port, ready: true };
      this.statuses.set(target.id, status);
      return status;
    } catch (error) {
      const status: DeviceProxyStatus = {
        host: target.host,
        port,
        ready: false,
        error: this.errorMessage(error),
      };
      this.statuses.set(target.id, status);
      return status;
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation);
    this.operationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
