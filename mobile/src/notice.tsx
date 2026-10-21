import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { colors } from './ui';
const Context = createContext<(message: string) => void>(() => {});
export const useNotice = () => useContext(Context);
export function NoticeProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 4000); return () => clearTimeout(timer); }, [message]);
  return <Context.Provider value={setMessage}>{children}{message ? <View pointerEvents="none" style={{ position: 'absolute', left: 18, right: 18, bottom: 20, padding: 14, backgroundColor: colors.ink, borderRadius: 14 }}><Text accessibilityLiveRegion="polite" style={{ color: '#fff', textAlign: 'center' }}>{message}</Text></View> : null}</Context.Provider>;
}
