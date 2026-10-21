import { useEffect } from 'react';
import { AppState, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useNetworkState } from 'expo-network';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SessionProvider } from '../session';
import { MonthProvider } from '../month';
import { colors } from '../ui';
import { NoticeProvider } from '../notice';

const query = new QueryClient({ defaultOptions: { queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: false }, mutations: { retry: false } } });
function Routes() {
  const insets = useSafeAreaInsets();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  useEffect(() => { onlineManager.setOnline(!offline); }, [offline]);
  useEffect(() => { const subscription = AppState.addEventListener('change', state => { if (state === 'active') void query.invalidateQueries(); }); return () => subscription.remove(); }, []);
  return <View style={{ flex: 1, backgroundColor: colors.background }}><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, animation: 'none' }} /><View pointerEvents="none" style={offline ? { position: 'absolute', top: insets.top + 8, left: 16, right: 16, padding: 12, borderRadius: 12, backgroundColor: '#fff0d4' } : { display: 'none' }}><Text style={{ color: '#785410', textAlign: 'center' }}>You’re offline. Connect to save changes. Pull down to retry.</Text></View></View>;
}
export default function RootLayout() { return <QueryClientProvider client={query}><SafeAreaProvider><SessionProvider><MonthProvider><NoticeProvider><Routes /></NoticeProvider></MonthProvider></SessionProvider></SafeAreaProvider></QueryClientProvider>; }

