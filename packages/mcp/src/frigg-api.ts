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
