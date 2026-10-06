import { EventEmitter } from 'node:events';
import type { ServerEvent } from '@frigg/shared';
import { run } from '../lib/exec.ts';

export class DeviceWatcher extends EventEmitter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private last = '';

  constructor(
    private readonly readSnapshot: () => Promise<string | null> = async () => {
      const result = await run('adb', ['devices']);
      return result.ok ? result.stdout.trim() : null;
    },
  ) {
    super();
  }

  start(intervalMs = 2000): void {
    if (this.timer !== null) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), intervalMs);
  }

  dispose(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const snapshot = await this.readSnapshot();
      if (snapshot === null) return;
      if (snapshot !== this.last) {
        this.last = snapshot;
        this.emit('event', { type: 'devices-updated' } satisfies ServerEvent);
      }
    } catch {
      return;
    } finally {
      this.polling = false;
    }
  }
}
