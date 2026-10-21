import { Redirect, Tabs, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../../session';
import { Busy, colors, ui } from '../../ui';
const icons = { index: 'grid-outline', transactions: 'receipt-outline', budgets: 'wallet-outline', reports: 'bar-chart-outline' } as const;
export default function TabLayout() {
  const { user, ready } = useSession(); const insets = useSafeAreaInsets();
  if (!ready) return <Busy />;
  if (!user) return <Redirect href="/" />;
  return <View style={ui.page}><Tabs screenOptions={({ route }) => ({ headerShown: false, lazy: true, animation: 'none', tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line, height: 62 + insets.bottom, paddingBottom: Math.max(insets.bottom, 8), paddingTop: 8 }, tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name as keyof typeof icons] ?? 'grid-outline'} size={size} color={typeof color === 'string' ? color : colors.primary} /> })}><Tabs.Screen name="index" options={{ title: 'Home' }} /><Tabs.Screen name="transactions" options={{ title: 'History' }} /><Tabs.Screen name="budgets" options={{ title: 'Budgets' }} /><Tabs.Screen name="reports" options={{ title: 'Reports' }} /></Tabs><Pressable accessibilityRole="button" accessibilityLabel="Add expense" onPress={() => router.push('/transaction')} style={{ position: 'absolute', bottom: 80 + insets.bottom, right: 20, height: 58, width: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 6px 18px rgba(65,100,237,0.3)' }}><Text style={{ color: '#fff', fontSize: 34, lineHeight: 38 }}>+</Text></Pressable></View>;
}
