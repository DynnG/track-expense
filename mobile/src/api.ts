import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { validateBaseUrl } from '../../shared/apiConfig';

export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}
const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
let token = '';
let onExpired = () => {};
export function setExpiredHandler(handler: () => void) { onExpired = handler; return () => { onExpired = () => {}; }; }
const STORAGE_KEY = 'track-expense.native-session';
export async function restoreToken() {
  const stored = Platform.OS === 'web' ? null : await SecureStore.getItemAsync(STORAGE_KEY);
  const session = stored ? JSON.parse(stored) : null;
  token = session?.origin === configured && typeof session.token === 'string' ? session.token : '';
  return !!token;
}
export async function saveToken(value: string) {
  // Web preview is intentionally memory-only; production Android uses Keystore.
  if (Platform.OS !== 'web') await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify({ token: value, origin: configured }), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  token = value;
}
export async function clearToken() { token = ''; if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(STORAGE_KEY); }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!configured) throw new ApiError('Set EXPO_PUBLIC_API_URL before starting the app.');
  let base: string;
  try { base = validateBaseUrl(configured, __DEV__); } catch { throw new ApiError('The API URL is invalid. Production requires HTTPS.'); }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timeout = setTimeout(cancel, 20000);
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  const requestToken = token;
  try {
    const response = await fetch(base + '/api/v1' + path, { ...options, credentials: 'omit', signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...options.headers } });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 && requestToken === token && !['/mobile/auth/login', '/mobile/auth/register'].includes(path)) onExpired();
      const fields = body.error?.fields ? Object.values(body.error.fields).join(' ') : '';
      throw new ApiError(fields || body.error?.message || 'This request failed. Please try again.', response.status);
    }
    return response.status === 204 ? undefined as T : await response.json();
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof ApiError) throw error;
    throw new ApiError(controller.signal.aborted ? 'The request timed out. If you saved a change, refresh your records before retrying.' : 'Could not connect. Your input is still here; check your connection and retry.');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}
