import { execFile } from 'node:child_process';

export interface ExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

const defaultTimeoutMs = 15000;
const outputBufferLimit = 16 * 1024 * 1024;

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
