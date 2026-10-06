import {
  ANDROID_DEVICE_STATE,
  IOS_SIMULATOR_STATE,
  type DevicesSnapshot,
  type LogSessionStatus,
  type LogTarget,
} from '@frigg/shared';
import type { StartLogsInput } from '../../api/client';

interface LogcatSessionDependencies {
  start: (input: StartLogsInput) => Promise<LogSessionStatus>;
  stop: () => Promise<LogSessionStatus>;
  onStatus: (status: LogSessionStatus) => void;
}

interface DesiredSession {
  target: LogTarget | null;
  packageFilter: string | undefined;
  key: string;
}

export class LogcatSessionCoordinator {
  private desired: DesiredSession | null = null;
  private attemptedKey: string | undefined;
  private retryRequested = false;
  private processing: Promise<void> | null = null;

  constructor(private readonly dependencies: LogcatSessionDependencies) {}

  setDesiredSession(target: LogTarget | null, packageFilter: string): Promise<void> {
    const normalizedPackage = packageFilter.trim() || undefined;
    this.desired = {
      target,
      packageFilter: normalizedPackage,
      key: sessionKey(target, normalizedPackage),
    };
    return this.process();
  }

  retry(): Promise<void> {
    if (this.desired?.target === null || this.desired === null) return Promise.resolve();
    this.retryRequested = true;
    return this.process();
  }

  private process(): Promise<void> {
    if (this.processing !== null) return this.processing;

    const processing = this.drain().finally(() => {
      if (this.processing === processing) this.processing = null;
    });
    this.processing = processing;
    return processing;
  }

  private async drain(): Promise<void> {
    while (this.desired !== null) {
      const session = this.desired;
      if (!this.retryRequested && this.attemptedKey === session.key) return;

      this.retryRequested = false;
      this.attemptedKey = session.key;

      let status: LogSessionStatus;
      try {
        status = session.target === null
          ? await this.dependencies.stop()
          : await this.dependencies.start({
              platform: session.target.platform,
              id: session.target.id,
              label: session.target.label,
              packageFilter: session.packageFilter,
            });
      } catch (error) {
        status = {
          streaming: false,
          target: session.target,
          packageFilter: session.packageFilter ?? null,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      if (this.desired.key === session.key) this.dependencies.onStatus(status);
    }
  }
}

function sessionKey(target: LogTarget | null, packageFilter: string | undefined): string {
  return JSON.stringify(target === null ? [null] : [target.platform, target.id, packageFilter ?? null]);
}

export function isLogTargetAvailable(target: LogTarget | null, devices: DevicesSnapshot | null): boolean {
  if (target === null || devices === null) return false;
  if (target.platform === 'android') {
    return devices.android.some(
      (device) => device.serial === target.id && device.state === ANDROID_DEVICE_STATE.connected,
    );
  }
  return devices.iosSimulators.some(
    (simulator) =>
      simulator.udid === target.id &&
      simulator.state.toLowerCase() === IOS_SIMULATOR_STATE.booted.toLowerCase(),
  ) || devices.iosDevices.some((device) => device.udid === target.id && device.paired);
}
