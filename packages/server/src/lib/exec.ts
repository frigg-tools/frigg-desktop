import { execFile } from 'node:child_process';

export interface ExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

const defaultTimeoutMs = 15000;
const outputBufferLimit = 16 * 1024 * 1024;

export interface ExecBufferResult {
  ok: boolean;
  stdout: Buffer;
  stderr: Buffer;
  code: number | null;
}

export function runBuffer(
  cmd: string,
  args: string[],
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<ExecBufferResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        timeout: opts?.timeoutMs ?? defaultTimeoutMs,
        killSignal: 'SIGKILL',
        encoding: 'buffer',
        maxBuffer: outputBufferLimit,
        windowsHide: true,
        signal: opts?.signal,
      },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : null;
        resolve({
          ok: code === 0,
          stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout),
          stderr: Buffer.isBuffer(stderr) ? stderr : Buffer.from(stderr),
          code,
        });
      },
    );
  });
}

export function run(cmd: string, args: string[], opts?: { timeoutMs?: number }): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        timeout: opts?.timeoutMs ?? defaultTimeoutMs,
        killSignal: 'SIGKILL',
        encoding: 'utf8',
        maxBuffer: outputBufferLimit,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : null;
        resolve({ ok: code === 0, stdout, stderr, code });
      },
    );
  });
}
