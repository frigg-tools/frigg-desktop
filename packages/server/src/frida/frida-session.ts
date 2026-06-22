import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FridaMessage, FridaSessionStatus, ServerEvent } from '@frigg/shared';

export interface RunScriptOptions {
  deviceId: string;
  target: string;
  scriptId: string;
  source: string;
  spawnMode?: boolean;
}

export class FridaSession extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private tempDir: string | null = null;
  private buffer = '';
  private messageId = 0;
  private sessionStatus: FridaSessionStatus = {
    running: false,
    deviceId: null,
    target: null,
    scriptId: null,
    error: null,
  };

  get status(): FridaSessionStatus {
    return { ...this.sessionStatus };
  }

  async run(opts: RunScriptOptions): Promise<FridaSessionStatus> {
    await this.stop();
    const target = opts.target.trim();
    if (target === '') {
      return this.setError('Provide a target app or process (package name or process name).');
    }
    if (opts.source.trim() === '') {
      return this.setError('The script is empty.');
    }

    let scriptPath: string;
    try {
      this.tempDir = await mkdtemp(join(tmpdir(), 'frigg-frida-script-'));
      scriptPath = join(this.tempDir, 'script.js');
      await writeFile(scriptPath, opts.source, 'utf8');
    } catch (error) {
      await this.cleanupTemp();
      return this.setError(`Could not stage the script: ${describeError(error)}`);
    }

    const args = ['-D', opts.deviceId, opts.spawnMode ? '-f' : '-n', target, '-l', scriptPath];
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn('frida', args, {
        windowsHide: true,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });
    } catch (error) {
      await this.cleanupTemp();
      return this.setError(
        `Could not start frida: ${describeError(error)}. Is frida-tools installed (pipx install frida-tools)?`,
      );
    }

    this.child = child;
    this.buffer = '';
    this.sessionStatus = {
      running: true,
      deviceId: opts.deviceId,
      target,
      scriptId: opts.scriptId,
      error: null,
    };
    this.emitStatus();

    let lastStderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.consume(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      for (const part of chunk.split('\n')) {
        const line = part.replace(/\r$/, '').trim();
        if (line === '') continue;
        lastStderr = line;
        this.emitMessage(line, 'error');
      }
    });

    child.on('error', (error) => {
      if (this.child !== child) return;
      this.child = null;
      void this.cleanupTemp();
      this.setError(
        `frida failed: ${describeError(error)}. Is frida-tools installed (pipx install frida-tools)?`,
      );
    });

    child.on('exit', (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      void this.cleanupTemp();
      if (signal === 'SIGTERM' || signal === 'SIGKILL') return;
      const reason =
        lastStderr.trim() || (code !== null && code !== 0 ? `exit code ${code}` : 'session ended');
      this.sessionStatus = {
        running: false,
        deviceId: opts.deviceId,
        target,
        scriptId: opts.scriptId,
        error: `Frida session ended (${reason}).`,
      };
      this.emitStatus();
    });

    return this.status;
  }

  async stop(): Promise<FridaSessionStatus> {
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
    await this.cleanupTemp();
    if (this.sessionStatus.running || this.sessionStatus.target !== null) {
      this.sessionStatus = { running: false, deviceId: null, target: null, scriptId: null, error: null };
      this.emitStatus();
    }
    return this.status;
  }

  async dispose(): Promise<void> {
    await this.stop();
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.emitStdout(line);
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  private emitStdout(raw: string): void {
    const cleaned = cleanFridaLine(raw);
    if (cleaned === null) return;
    this.emitMessage(cleaned.text, cleaned.kind);
  }

  private emitMessage(text: string, kind: FridaMessage['kind']): void {
    if (text === '') return;
    const message: FridaMessage = { id: ++this.messageId, timestamp: Date.now(), kind, text };
    this.emit('event', { type: 'frida-message', message } satisfies ServerEvent);
  }

  private emitStatus(): void {
    this.emit('event', { type: 'frida-session-status', status: this.status } satisfies ServerEvent);
  }

  private setError(message: string): FridaSessionStatus {
    this.sessionStatus = {
      running: false,
      deviceId: this.sessionStatus.deviceId,
      target: this.sessionStatus.target,
      scriptId: this.sessionStatus.scriptId,
      error: message,
    };
    this.emitStatus();
    return this.status;
  }

  private async cleanupTemp(): Promise<void> {
    if (this.tempDir !== null) {
      const dir = this.tempDir;
      this.tempDir = null;
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const FRIDA_BANNER_PATTERNS = [
  /^_{2,}$/,
  /^\/ _/,
  /^\| \(_/,
  /^> _/,
  /^\/_\/ \|_\|/,
  /^[._ ]+$/,
  /Frida \d[\d.]* - A world-class/,
  /^toolkit$/,
  /\bCommands:\s*$/,
  /(?:^|\s)(?:help|object\?|exit\/quit)\s+->/,
  /More info at https:\/\/frida\.re/,
];

export function cleanFridaLine(raw: string): { text: string; kind: FridaMessage['kind'] } | null {
  const line = raw.replace(/^\[[^\]]*\]->\s?/, '');
  const trimmed = line.trim();
  if (trimmed === '') return null;
  if (FRIDA_BANNER_PATTERNS.some((pattern) => pattern.test(trimmed))) return null;
  const send = trimmed.match(/^message: \{'type': 'send', 'payload': ([\s\S]*?)\}(?: data: .*)?$/);
  if (send) return { text: unquote(send[1]), kind: 'send' };
  return { text: line, kind: 'log' };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
