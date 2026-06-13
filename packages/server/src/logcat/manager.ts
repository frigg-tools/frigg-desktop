import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import type { LogEntry, LogSessionStatus, LogTarget, ServerEvent } from '@frigg/shared';
import { parseAndroidLogcatLine } from './parse-android.ts';
import { parseIosLogLine } from './parse-ios.ts';

interface StartOptions {
  packageFilter?: string;
}

interface SpawnPlan {
  command: string;
  args: string[];
  parse: (line: string) => Omit<LogEntry, 'id'> | null;
}

export class LogcatManager extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private entryId = 0;
  private sessionStatus: LogSessionStatus = {
    streaming: false,
    target: null,
    packageFilter: null,
    error: null,
  };

  get status(): LogSessionStatus {
    return { ...this.sessionStatus };
  }

  async start(target: LogTarget, opts: StartOptions = {}): Promise<LogSessionStatus> {
    await this.stop();
    const packageFilter = normalizeFilter(opts.packageFilter);
    this.sessionStatus = { streaming: false, target, packageFilter, error: null };

    if (target.platform === 'ios' && !isSimulatorUdid(target.id)) {
      this.setError(
        'Physical iOS devices are not supported for log streaming. Use the iOS Simulator, or run idevicesyslog to stream a real device.',
      );
      return this.status;
    }

    const plan =
      target.platform === 'android'
        ? await this.buildAndroidPlan(target.id, packageFilter)
        : buildIosPlan(target.id, packageFilter);

    if (plan === null) return this.status;

    return this.spawnPlan(plan, target, packageFilter);
  }

  async stop(): Promise<LogSessionStatus> {
    const child = this.child;
    this.child = null;
    this.buffer = '';
    if (child !== null) {
      child.removeAllListeners();
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      child.kill('SIGTERM');
      child.unref();
    }
    if (this.sessionStatus.streaming || this.sessionStatus.target !== null) {
      this.sessionStatus = {
        streaming: false,
        target: null,
        packageFilter: null,
        error: null,
      };
      this.emitStatus();
    }
    return this.status;
  }

  clear(): void {
    this.entryId = 0;
    this.emit('event', { type: 'log-cleared' } satisfies ServerEvent);
  }

  async dispose(): Promise<void> {
    await this.stop();
  }

  private async buildAndroidPlan(
    serial: string,
    packageFilter: string | null,
  ): Promise<SpawnPlan | null> {
    await execClear(serial);
    const baseArgs = ['-s', serial, 'logcat', '-v', 'threadtime'];
    if (packageFilter === null) {
      return { command: 'adb', args: baseArgs, parse: parseAndroidLogcatLine };
    }
    const pids = await resolveAndroidPids(serial, packageFilter);
    if (pids.length === 0) {
      this.sessionStatus.error = `No running process found for package "${packageFilter}". Streaming all logs until it starts.`;
      return { command: 'adb', args: baseArgs, parse: parseAndroidLogcatLine };
    }
    const pidArgs = pids.flatMap((pid) => ['--pid', String(pid)]);
    return { command: 'adb', args: [...baseArgs, ...pidArgs], parse: parseAndroidLogcatLine };
  }

  private spawnPlan(plan: SpawnPlan, target: LogTarget, packageFilter: string | null): LogSessionStatus {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(plan.command, plan.args, { windowsHide: true });
    } catch (error) {
      this.setError(`Could not start the log stream: ${describeError(error)}.`);
      return this.status;
    }

    this.child = child;
    this.buffer = '';
    this.sessionStatus = {
      streaming: true,
      target,
      packageFilter,
      error: this.sessionStatus.error,
    };
    this.emitStatus();

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.consume(chunk, plan.parse));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', () => undefined);

    child.on('error', (error) => {
      if (this.child !== child) return;
      this.child = null;
      this.setError(`Log stream failed: ${describeError(error)}.`);
    });

    child.on('exit', (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      if (signal === 'SIGTERM' || signal === 'SIGKILL') return;
      const reason = code !== null && code !== 0 ? `exit code ${code}` : signal !== null ? signal : 'stream ended';
      this.sessionStatus = {
        streaming: false,
        target,
        packageFilter,
        error: `Log stream stopped (${reason}).`,
      };
      this.emitStatus();
    });

    return this.status;
  }

  private consume(chunk: string, parse: (line: string) => Omit<LogEntry, 'id'> | null): void {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.emitLine(line, parse);
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  private emitLine(line: string, parse: (line: string) => Omit<LogEntry, 'id'> | null): void {
    const parsed = parse(line);
    if (parsed === null) return;
    const entry: LogEntry = { id: ++this.entryId, ...parsed };
    this.emit('event', { type: 'log-entry', entry } satisfies ServerEvent);
  }

  private setError(message: string): void {
    this.sessionStatus = {
      streaming: false,
      target: this.sessionStatus.target,
      packageFilter: this.sessionStatus.packageFilter,
      error: message,
    };
    this.emitStatus();
  }

  private emitStatus(): void {
    this.emit('event', { type: 'log-status', status: this.status } satisfies ServerEvent);
  }
}

function normalizeFilter(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function isSimulatorUdid(id: string): boolean {
  return /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(id);
}

function buildIosPlan(udid: string, packageFilter: string | null): SpawnPlan {
  const args = ['simctl', 'spawn', udid, 'log', 'stream', '--style', 'compact', '--level', 'debug'];
  if (packageFilter !== null) {
    args.push('--predicate', `process CONTAINS "${packageFilter}"`);
  }
  return { command: 'xcrun', args, parse: parseIosLogLine };
}

function execClear(serial: string): Promise<void> {
  return new Promise((resolve) => {
    execFile('adb', ['-s', serial, 'logcat', '-c'], { timeout: 5000, windowsHide: true }, () => resolve());
  });
}

function resolveAndroidPids(serial: string, packageName: string): Promise<number[]> {
  return new Promise((resolve) => {
    pidofWith(serial, ['pidof', '-s', packageName]).then((primary) => {
      if (primary.length > 0) {
        resolve(primary);
        return;
      }
      pidofWith(serial, ['pidof', packageName]).then(resolve);
    });
  });
}

function pidofWith(serial: string, shellArgs: string[]): Promise<number[]> {
  return new Promise((resolve) => {
    execFile(
      'adb',
      ['-s', serial, 'shell', ...shellArgs],
      { timeout: 5000, windowsHide: true, encoding: 'utf8' },
      (error, stdout) => {
        if (error !== null) {
          resolve([]);
          return;
        }
        const pids = stdout
          .trim()
          .split(/\s+/)
          .map((token) => Number(token))
          .filter((pid) => Number.isInteger(pid) && pid > 0);
        resolve(pids);
      },
    );
  });
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
