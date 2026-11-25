import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  api,
  get,
  post,
  put,
  patch,
  del,
  setAccessToken,
  setSessionListener,
  refreshSession,
  ApiError,
  NetworkError,
  errorMessage,
} from './client';

describe('PJ4 Exam Web API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setAccessToken(null);
  });

  it('handles ApiError and formats errorMessage correctly', () => {
    const errWithDetails = new ApiError(400, 'BAD_REQUEST', 'Validation failed', ['Field required', 'Too short']);
    expect(errorMessage(errWithDetails)).toBe('Validation failed: Field required; Too short');

    const errNoDetails = new ApiError(404, 'NOT_FOUND', 'Exam not found');
    expect(errorMessage(errNoDetails)).toBe('Exam not found');

    const netErr = new NetworkError();
    expect(errorMessage(netErr)).toBe('Cannot reach the server. Check your connection.');

    const genericErr = new Error('Random boom');
    expect(errorMessage(genericErr)).toBe('Random boom');
  });

  it('performs GET request and injects Authorization header when token is set', async () => {
    setAccessToken('test-token-123');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ id: 'exam-1', title: 'Toán cao cấp' }),
    } as Response);

    const result = await get<{ id: string; title: string }>('/exams/exam-1');
    expect(result.id).toBe('exam-1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/exams/exam-1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
      })
    );
  });

  it('performs POST, PUT, PATCH, DELETE with json body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ success: true }),
    } as Response);

    await post('/exams', { title: 'Lý' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/exams',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Lý' }),
      })
    );

    await put('/exams/1', { title: 'Hóa' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/exams/1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ title: 'Hóa' }),
      })
    );

    await patch('/exams/1', { active: true });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/exams/1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ active: true }),
      })
    );

    await del('/exams/1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/exams/1',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });

  it('handles 204 No Content returning undefined', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    } as Response);

    const res = await api('/resource', { method: 'DELETE' });
    expect(res).toBeUndefined();
  });

  it('throws ApiError on HTTP 4xx/5xx responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers(),
      json: async () => ({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
        },
      }),
    } as Response);

    await expect(get('/admin/users')).rejects.toThrow(ApiError);
  });

  it('refreshSession coordinates single-flight refresh and notifies session listener', async () => {
    const sessionListener = vi.fn();
    setSessionListener(sessionListener);

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 'new-token-999',
        user: { id: 'u1', email: 'test@example.com' },
      }),
    } as Response);

    // Call concurrent refreshSession
    const [p1, p2] = await Promise.all([refreshSession(), refreshSession()]);
    expect(p1?.accessToken).toBe('new-token-999');
    expect(p2?.accessToken).toBe('new-token-999');
    expect(sessionListener).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'new-token-999' })
    );
    // Verified single-flight: only 1 fetch call made
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
