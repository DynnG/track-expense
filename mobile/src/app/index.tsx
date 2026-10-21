import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AuthScreen from '../AuthScreen';
import { useSession } from '../session';
import { Busy, Failure, ui } from '../ui';
export default function Entry() {
  const session = useSession();
  if (!session.ready) return <SafeAreaView style={ui.page}><Busy /></SafeAreaView>;
  if (session.restoreError) return <SafeAreaView style={ui.page}><Failure message={session.restoreError} retry={() => void session.retry()} /></SafeAreaView>;
  return session.user ? <Redirect href="/(tabs)/dashboard" /> : <AuthScreen />;
}

