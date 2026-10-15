import type { ApiErrorBody, AuthResponse } from '@exam/shared';
import { serverClock } from '../features/attempt/serverClock';

const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Thrown when the request never reached the server (offline, DNS, CORS…). */
export class NetworkError extends Error {}

// The access token lives only in memory; the refresh token is an httpOnly cookie.
let accessToken: string | null = null;
let refreshing: Promise<AuthResponse | null> | null = null;
let onSessionChange: (session: AuthResponse | null) => void = () => {};

export function setSessionListener(fn: (session: AuthResponse | null) => void): void {
  onSessionChange = fn;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Single-flight refresh shared by all concurrent 401s. */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' });
      if (!res.ok) {
        accessToken = null;
        onSessionChange(null);
        return null;
      }
      const session = (await res.json()) as AuthResponse;
      accessToken = session.accessToken;
      onSessionChange(session);
      return session;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Return the raw text instead of parsing JSON (CSV downloads). */
  raw?: boolean;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const sent = performance.now();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: 'same-origin',
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new NetworkError('Network unavailable');
  }
  const serverTime = res.headers.get('X-Server-Time');
  if (serverTime) serverClock.sample(serverTime, sent, performance.now());

  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (session) return api<T>(path, opts, true);
  }
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(
      res.status,
      body?.error.code ?? 'HTTP_' + res.status,
      body?.error.message ?? res.statusText,
      body?.error.details,
    );
  }
  return (opts.raw ? await res.text() : await res.json()) as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
  api<T>(path, { method: 'POST', body: body ?? {}, headers });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const del = <T = void>(path: string) => api<T>(path, { method: 'DELETE' });

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const details = Array.isArray(err.details) ? `: ${err.details.join('; ')}` : '';
    return `${err.message}${details}`;
  }
  if (err instanceof NetworkError) return 'Cannot reach the server. Check your connection.';
  return (err as Error)?.message ?? 'Unexpected error';
}

/** Saves a text response as a file (used for CSV exports). */
export async function download(path: string, filename: string): Promise<void> {
  const text = await api<string>(path, { raw: true });
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
