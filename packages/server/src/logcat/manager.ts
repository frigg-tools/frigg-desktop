import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import type { LogEntry, LogSessionStatus, LogTarget, ServerEvent } from '@frigg/shared';
import {
  classifyIosDeviceLogError,
  IosDeviceLogTool,
  iosDeviceLogError,
  isIosSimulatorUdid,
} from './ios-device-log-tool.ts';
import { parseAndroidLogcatLine } from './parse-android.ts';
import { parseIosLogLine } from './parse-ios.ts';

interface StartOptions {
  packageFilter?: string;
}

interface SpawnPlan {
  command: string;
  args: string[];
  parse: (line: string) => Omit<LogEntry, 'id'> | null;
  iosDevice?: boolean;
  processFilter?: string | null;
}

const IOS_LOG_STARTUP_TIMEOUT_MS = 10_000;

export class LogcatManager extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private iosStartupTimer: NodeJS.Timeout | null = null;
  private buffer = '';
  private entryId = 0;
  private sessionStatus: LogSessionStatus = {
    streaming: false,
    target: null,
    packageFilter: null,
    error: null,
  };

  constructor(private readonly iosDeviceLogTool = new IosDeviceLogTool()) {
    super();
  }

  get status(): LogSessionStatus {
    return { ...this.sessionStatus };
  }

  async start(target: LogTarget, opts: StartOptions = {}): Promise<LogSessionStatus> {
    await this.stop();
    const packageFilter = normalizeFilter(opts.packageFilter);
    this.sessionStatus = { streaming: false, target, packageFilter, error: null };

    const plan =
      target.platform === 'android'
        ? await this.buildAndroidPlan(target.id, packageFilter)
        : isIosSimulatorUdid(target.id)
          ? buildIosSimulatorPlan(target.id, packageFilter)
          : this.buildIosDevicePlan(target.id, packageFilter);

    if (plan === null) return this.status;

    return this.spawnPlan(plan, target, packageFilter);
  }

  async stop(): Promise<LogSessionStatus> {
    const child = this.child;
    this.child = null;
    this.buffer = '';
    if (child !== null) {
      this.clearIosStartupTimer();
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

  private buildIosDevicePlan(udid: string, processName: string | null): SpawnPlan {
    return {
      ...this.iosDeviceLogTool.streamCommand(udid, processName),
      parse: parseIosLogLine,
      iosDevice: true,
      processFilter: processName,
    };
  }

  private spawnPlan(plan: SpawnPlan, target: LogTarget, packageFilter: string | null): LogSessionStatus {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(plan.command, plan.args, { windowsHide: true });
    } catch (error) {
      this.setError(this.spawnError(plan, error));
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

    if (plan.iosDevice) {
      this.iosStartupTimer = setTimeout(() => {
        this.failChild(
          child,
          iosDeviceLogError('stream-failed', 'Timed out while connecting to the iOS device.'),
        );
      }, IOS_LOG_STARTUP_TIMEOUT_MS);
    }

    let lastStderr = '';
    let stderrBuffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.consume(chunk, plan, child));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrBuffer += chunk;
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() ?? '';
      for (const part of lines) {
        const line = part.trim();
        if (line === '') continue;
        lastStderr = line;
        if (!plan.iosDevice) continue;
        const errorCode = classifyIosDeviceLogError(line);
        if (errorCode !== null) {
          this.failChild(child, iosDeviceLogError(errorCode, line));
          return;
        }
        if (isIosStartupFailure(line)) {
          this.failChild(child, iosDeviceLogError('stream-failed', line));
          return;
        }
      }
    });

    child.on('error', (error) => {
      if (this.child !== child) return;
      this.clearIosStartupTimer();
      this.child = null;
      this.setError(this.spawnError(plan, error));
    });

    child.on('exit', (code, signal) => {
      if (this.child !== child) return;
      this.clearIosStartupTimer();
      this.child = null;
      if (signal === 'SIGTERM' || signal === 'SIGKILL') return;
      const detail = [stderrBuffer, lastStderr]
        .map((part) => part.replace(/^error:\s*/i, '').trim())
        .filter((part) => part !== '')
        .join(' ');
      if (plan.iosDevice) {
        const errorCode = classifyIosDeviceLogError(detail);
        const deviceErrorCode = errorCode ?? (code === 0 && detail === '' ? 'disconnected' : 'stream-failed');
        this.setError(iosDeviceLogError(deviceErrorCode, detail));
        return;
      }
      const fallback =
        code !== null && code !== 0 ? `exit code ${code}` : signal !== null ? signal : 'stream ended';
      const reason = detail !== '' ? detail : fallback;
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

  private spawnError(plan: SpawnPlan, error: unknown): string {
    if (!plan.iosDevice) return `Could not start the log stream: ${describeError(error)}.`;
    const code = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'helper-missing' : 'stream-failed';
    return iosDeviceLogError(code, code === 'stream-failed' ? describeError(error) : undefined);
  }

  private failChild(child: ChildProcessWithoutNullStreams, message: string): void {
    if (this.child !== child) return;
    this.clearIosStartupTimer();
    this.child = null;
    child.removeAllListeners();
    child.stdout.removeAllListeners();
    child.stderr.removeAllListeners();
    child.kill('SIGTERM');
    child.unref();
    this.setError(message);
  }

  private consume(chunk: string, plan: SpawnPlan, child: ChildProcessWithoutNullStreams): void {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newlineIndex + 1);
      const trimmed = line.trim();
      if (plan.iosDevice && /^\[connected:[^\]]+\]$/i.test(trimmed)) {
        this.clearIosStartupTimer();
      } else if (plan.iosDevice && /^\[disconnected:[^\]]+\]$/i.test(trimmed)) {
        this.failChild(child, iosDeviceLogError('disconnected', trimmed));
        return;
      } else {
        this.emitLine(line, plan.parse, plan.processFilter);
      }
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  private emitLine(
    line: string,
    parse: (line: string) => Omit<LogEntry, 'id'> | null,
    processFilter: string | null = null,
  ): void {
    const parsed = parse(line);
    if (parsed === null) return;
    if (processFilter !== null && parsed.tag !== processFilter) return;
    const entry: LogEntry = { id: ++this.entryId, ...parsed };
    this.emit('event', { type: 'log-entry', entry } satisfies ServerEvent);
  }

  private clearIosStartupTimer(): void {
    if (this.iosStartupTimer === null) return;
    clearTimeout(this.iosStartupTimer);
    this.iosStartupTimer = null;
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

function buildIosSimulatorPlan(udid: string, packageFilter: string | null): SpawnPlan {
  const args = ['simctl', 'spawn', udid, 'log', 'stream', '--style', 'compact', '--level', 'debug'];
  if (packageFilter !== null) {
    const escaped = packageFilter.replace(/["\\]/g, '\\$&');
    args.push('--predicate', `process CONTAINS "${escaped}"`);
  }
  return { command: 'xcrun', args, parse: parseIosLogLine };
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

function isIosStartupFailure(detail: string): boolean {
  return /^(?:error:|\*\*\*|could not start logger\b|could not start .* service\b|could not connect to .* service\b|unable to start capturing syslog\b)/i.test(
    detail.trim(),
  );
}
