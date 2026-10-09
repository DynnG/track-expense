import type { Profile } from './types';
let csrf = '';
export function setSession(profile: Profile | null) { csrf = profile?.csrf ?? ''; }
export class ApiError extends Error {
  constructor(message: string, public status: number, public fields: Record<string, string> = {}) { super(message); }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!csrf && options.method && options.method !== 'GET' && !['/auth/login', '/auth/register', '/auth/reset'].includes(path)) {
    // Rehydrate memory-only CSRF state after development hot reloads.
    setSession(await api<Profile>('/auth/me'));
  }
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...options.headers } });
  } catch { throw new ApiError('We couldn’t connect. Check your connection and try again.', 0); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new ApiError(body.error?.message ?? 'Something went wrong. Please try again.', response.status, body.error?.fields);
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
    throw error;
  }
  return response.status === 204 ? undefined as T : response.json();
}
export async function downloadReport(month: string) {
  const response = await fetch(`/api/v1/reports/export?month=${month}`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Couldn’t download your report. Please try again.');
  saveBlob(await response.blob(), `track-expense-${month}.csv`);
}
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
