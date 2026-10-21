import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, setSession, transactionInput } from './api';

afterEach(() => { setSession(null); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('API failures and cancellation', () => {
  it('edits saved records without sending their read-only id to the strict API', async () => {
    const saved = { id: 'saved-record', category_id: 'food', type: 'EXPENSE' as const, amount: '0.40', description: 'Lunch', transaction_date: '2026-10-21' };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(saved), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    setSession({ id: 'user', name: 'Tester', email: 'test@example.com', csrf: 'csrf' });
    await api('/transactions/' + saved.id, { method: 'PATCH', body: JSON.stringify(transactionInput(saved)) });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ category_id: 'food', type: 'EXPENSE', amount: '0.40', description: 'Lunch', transaction_date: '2026-10-21' });
    setSession(null);
  });
  it('passes cancellation to requests so obsolete searches can stop', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason));
    })));
    const promise = api('/transactions?search=old', { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('reports a bounded timeout without automatically retrying a write', async () => {
    const timeout = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    const fetch = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason));
    }));
    vi.stubGlobal('fetch', fetch);
    const promise = api('/auth/login', { method: 'POST', body: '{}' });
    timeout.abort(new DOMException('Timeout', 'TimeoutError'));
    await expect(promise).rejects.toThrow('check your records before retrying');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('preserves structured validation errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Invalid amount', fields: { amount: 'Use two decimals' } } }), { status: 422 })));
    await expect(api('/transactions')).rejects.toMatchObject({ status: 422, message: 'Invalid amount', fields: { amount: 'Use two decimals' } });
  });
  it('returns a friendly network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network unavailable')));
    await expect(api('/categories')).rejects.toBeInstanceOf(ApiError);
  });
});
