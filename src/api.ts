import type { Profile, Transaction } from './types';
let csrf = '';
export function setSession(profile: Profile | null) { csrf = profile?.csrf ?? ''; }
export class ApiError extends Error {
  constructor(message: string, public status: number, public fields: Record<string, string> = {}) { super(message); }
}
// Form defaults may contain a saved record's id. Send only editable API fields.
export function transactionInput(value: Omit<Transaction, 'id'>): Omit<Transaction, 'id'> {
  const { category_id, type, amount, description, transaction_date } = value;
  return { category_id, type, amount, description, transaction_date };
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!csrf && options.method && options.method !== 'GET' && !['/auth/login', '/auth/register', '/auth/reset'].includes(path)) {
    // Rehydrate memory-only CSRF state after development hot reloads.
    setSession(await api<Profile>('/auth/me', { signal: options.signal }));
  }
  return request<T>(path, options, response => response.status === 204 ? Promise.resolve(undefined as T) : response.json());
}
async function request<T>(path: string, options: RequestInit, read: (response: Response) => Promise<T>): Promise<T> {
  const timeout = AbortSignal.timeout(20000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const response = await fetch(`/api/v1${path}`, { ...options, signal, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...options.headers } });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const error = new ApiError(body.error?.message ?? 'Something went wrong. Please try again.', response.status, body.error?.fields);
      if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
      throw error;
    }
    return await read(response);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (options.signal?.aborted) throw error;
    if (timeout.aborted) throw new ApiError('This request took too long. If you saved a change, check your records before retrying.', 0);
    throw new ApiError('We couldn’t connect. Check your connection and try again.', 0);
  }
}
export async function downloadReport(month: string) {
  const blob = await request(`/reports/export?month=${month}`, {}, response => response.blob());
  saveBlob(blob, `track-expense-${month}.csv`);
}
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
