import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, clearToken, restoreToken, saveToken, setExpiredHandler } from './api';

export type User = { id: string; name: string; email: string };
type SessionValue = { user: User | null; ready: boolean; restoreError: string; retry: () => Promise<void>; signIn: (email: string, password: string, name?: string) => Promise<void>; signOut: () => Promise<void> };
const Context = createContext<SessionValue>(null!);
export const useSession = () => useContext(Context);
export function SessionProvider({ children }: { children: ReactNode }) {
  const query = useQueryClient();
  const [override, setOverride] = useState<User | null | undefined>(undefined);
  const [storageError, setStorageError] = useState('');
  const expire = useCallback(() => { setOverride(null); query.clear(); void clearToken().catch(() => setStorageError('Could not clear secure storage. Restart the app before signing in again.')); }, [query]);
  useEffect(() => setExpiredHandler(expire), [expire]);
  const bootstrap = useQuery({ queryKey: ['native-session'], enabled: override === undefined, retry: false, staleTime: Infinity, queryFn: async () => {
    if (!(await restoreToken())) return null;
    try { return await api<User>('/mobile/auth/me'); }
    catch (e) { if (e instanceof ApiError && e.status === 401) { await clearToken(); return null; } throw e; }
  } });
  const user = override === undefined ? bootstrap.data ?? null : override;
  const ready = override !== undefined || !bootstrap.isPending;
  const restoreError = storageError || (override === undefined && bootstrap.error ? bootstrap.error.message : '');
  async function retry() { setStorageError(''); await bootstrap.refetch(); }
  async function signIn(email: string, password: string, name?: string) {
    const session = await api<{ access_token: string; profile: User }>(name === undefined ? '/mobile/auth/login' : '/mobile/auth/register', { method: 'POST', body: JSON.stringify({ email: email.trim(), password, ...(name === undefined ? {} : { name: name.trim() }) }) });
    try { await saveToken(session.access_token); } catch { throw new Error('Could not save the session in secure storage. Please retry.'); }
    query.clear(); setOverride(session.profile);
  }
  async function signOut() {
    // Do not silently forget a live server credential when revocation fails.
    try { await api('/mobile/auth/logout', { method: 'POST', body: '{}' }); }
    catch (e) { if (!(e instanceof ApiError) || e.status !== 401) throw e; }
    await clearToken(); query.clear(); setOverride(null);
  }
  return <Context.Provider value={{ user, ready, restoreError, retry, signIn, signOut }}>{children}</Context.Provider>;
}
