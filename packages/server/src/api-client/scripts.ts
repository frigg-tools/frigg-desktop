import vm from 'node:vm';
import type { ApiTestResult } from '@frigg/shared';

const SCRIPT_TIMEOUT_MS = 5000;

export interface PreScriptRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface PreScriptContext {
  request: PreScriptRequest;
  vars: Map<string, string>;
}

export interface PreScriptResult {
  logs: string[];
  envChanges: Map<string, string | null>;
}

export interface ResponseContext {
  code: number;
  status: string;
  responseTime: number;
  headers: Record<string, string>;
  text: string;
}

export interface TestScriptContext {
  vars: Map<string, string>;
  response: ResponseContext;
}

export interface TestScriptResult {
  logs: string[];
  envChanges: Map<string, string | null>;
  tests: ApiTestResult[];
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
}

function formatLogArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.message;
  try {
    const serialized = JSON.stringify(arg);
    return serialized === undefined ? String(arg) : serialized;
  } catch {
    return String(arg);
  }
}

function buildConsole(logs: string[], prefix: string): Record<string, (...args: unknown[]) => void> {
  const push = (level: string) => (...args: unknown[]) => {
    logs.push(`${prefix}${level}: ${args.map(formatLogArg).join(' ')}`);
  };
  return { log: push('log'), warn: push('warn'), error: push('error') };
}

function buildEnvironmentApi(vars: Map<string, string>, envChanges: Map<string, string | null>) {
  return {
    get(key: string): string | undefined {
      return vars.get(key);
    },
    set(key: string, value: unknown): void {
      const stringValue = value === undefined || value === null ? '' : String(value);
      vars.set(key, stringValue);
      envChanges.set(key, stringValue);
    },
    unset(key: string): void {
      vars.delete(key);
      envChanges.set(key, null);
    },
    has(key: string): boolean {
      return vars.has(key);
    },
  };
}

function buildVariablesApi(vars: Map<string, string>) {
  return {
    get(key: string): string | undefined {
      return vars.get(key);
    },
  };
}

function isDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, index) => isDeepEqual(item, b[index]));
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(bRecord, key) && isDeepEqual(aRecord[key], bRecord[key]),
  );
}

function describe(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildExpect(value: unknown) {
  return {
    toBe(expected: unknown): void {
      if (value !== expected) {
        throw new Error(`expected ${describe(value)} to be ${describe(expected)}`);
      }
    },
    toEqual(expected: unknown): void {
      if (!isDeepEqual(value, expected)) {
        throw new Error(`expected ${describe(value)} to equal ${describe(expected)}`);
      }
    },
    toBeTruthy(): void {
      if (!value) {
        throw new Error(`expected ${describe(value)} to be truthy`);
      }
    },
    toBeDefined(): void {
      if (value === undefined) {
        throw new Error('expected value to be defined');
      }
    },
    toBeNull(): void {
      if (value !== null) {
        throw new Error(`expected ${describe(value)} to be null`);
      }
    },
  };
}

function buildResponseApi(response: ResponseContext) {
  return {
    code: response.code,
    status: response.status,
    responseTime: response.responseTime,
    headers: response.headers,
    text(): string {
      return response.text;
    },
    json(): unknown {
      try {
        return JSON.parse(response.text);
      } catch {
        throw new Error('response body is not valid JSON');
      }
    },
  };
}

export function runPreScript(code: string, ctx: PreScriptContext): PreScriptResult {
  const logs: string[] = [];
  const envChanges = new Map<string, string | null>();
  if (code.trim() === '') {
    return { logs, envChanges };
  }
  const pm = {
    environment: buildEnvironmentApi(ctx.vars, envChanges),
    variables: buildVariablesApi(ctx.vars),
    request: ctx.request,
  };
  const sandbox = { pm, console: buildConsole(logs, 'pre ') };
  try {
    vm.runInNewContext(code, sandbox, { timeout: SCRIPT_TIMEOUT_MS });
  } catch (error) {
    logs.push(`pre error: ${messageOf(error)}`);
  }
  return { logs, envChanges };
}

export function runTestScript(code: string, ctx: TestScriptContext): TestScriptResult {
  const logs: string[] = [];
  const envChanges = new Map<string, string | null>();
  const tests: ApiTestResult[] = [];
  if (code.trim() === '') {
    return { logs, envChanges, tests };
  }
  const pm = {
    environment: buildEnvironmentApi(ctx.vars, envChanges),
    variables: buildVariablesApi(ctx.vars),
    response: buildResponseApi(ctx.response),
    test(name: string, fn: () => void): void {
      try {
        fn();
        tests.push({ name, passed: true });
      } catch (error) {
        tests.push({ name, passed: false, error: messageOf(error) });
      }
    },
    expect(value: unknown) {
      return buildExpect(value);
    },
  };
  const sandbox = { pm, console: buildConsole(logs, 'test ') };
  try {
    vm.runInNewContext(code, sandbox, { timeout: SCRIPT_TIMEOUT_MS });
  } catch (error) {
    const message = messageOf(error);
    logs.push(`test error: ${message}`);
    tests.push({ name: 'script error', passed: false, error: message });
  }
  return { logs, envChanges, tests };
}
