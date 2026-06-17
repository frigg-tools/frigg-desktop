import type { BodyPayload, CapturedRequest, CapturedResponse } from '@frigg/shared';
import { flattenHeaders } from './format';
import { bodyToText } from './find';

function shellQuote(value: string): string {
  return value.replace(/'/g, "'\\''");
}

function dumpHeaders(headers: Record<string, string | string[]>): string {
  return flattenHeaders(headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join('\n');
}

function bodyForDump(body: BodyPayload): string {
  if (body.size === 0) return '';
  if (body.encoding === 'base64') return `[binary, ${body.size} bytes]`;
  return bodyToText(body);
}

export function requestToCurl(request: CapturedRequest): string {
  const parts: string[] = [`curl -X ${request.method.toUpperCase()} '${shellQuote(request.url)}'`];
  for (const [name, value] of flattenHeaders(request.headers)) {
    if (name.startsWith(':')) continue;
    parts.push(`-H '${shellQuote(`${name}: ${value}`)}'`);
  }
  if (request.body.encoding === 'utf8' && request.body.data.length > 0) {
    parts.push(`--data-raw '${shellQuote(request.body.data)}'`);
  }
  return parts.join(' \\\n  ');
}

export function dumpRequest(request: CapturedRequest): string {
  const sections = [`${request.method.toUpperCase()} ${request.url}`, dumpHeaders(request.headers)];
  const body = bodyForDump(request.body);
  if (body) sections.push(body);
  return sections.filter((s) => s.length > 0).join('\n\n');
}

export function dumpResponse(response: CapturedResponse): string {
  const status = `${response.statusCode}${response.statusMessage ? ` ${response.statusMessage}` : ''}`;
  const sections = [status, dumpHeaders(response.headers)];
  const body = bodyForDump(response.body);
  if (body) sections.push(body);
  return sections.filter((s) => s.length > 0).join('\n\n');
}
