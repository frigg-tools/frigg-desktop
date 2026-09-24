const baseUrl = (process.env.FRIGG_API_URL ?? 'http://localhost:4848').replace(/\/$/, '');

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${baseUrl}${path}`;
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const msg =
      typeof json === 'object' && json !== null && 'error' in json && typeof (json as Record<string, unknown>).error === 'string'
        ? (json as { error: string }).error
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

export function get<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

export function put<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PUT', path, body);
}

export function del<T>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}

export interface McpImageContent {
  type: 'image';
  mimeType: 'image/png';
  data: string;
}

export async function getImage(path: string): Promise<McpImageContent> {
  const res = await fetch(`${baseUrl}${path}`);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body: unknown = await res.json();
      if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') message = body.error;
    } catch {
      // Preserve the HTTP status when the server did not return a JSON error body.
    }
    throw new Error(message);
  }
  const mimeType = (res.headers.get('content-type') ?? '').split(';', 1)[0]?.trim().toLowerCase();
  if (mimeType !== 'image/png') throw new Error(`Frigg returned ${mimeType || 'an unknown content type'} instead of a PNG image.`);
  const bytes = Buffer.from(await res.arrayBuffer());
  return { type: 'image', mimeType: 'image/png', data: bytes.toString('base64') };
}
