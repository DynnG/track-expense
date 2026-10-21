import { useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from './session';
import { Button, Card, Field, ui } from './ui';
export default function AuthScreen() {
  const { signIn } = useSession();
  const [register, setRegister] = useState(false);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    if (!email.trim() || !password || (register && (!name.trim() || password.length < 10))) { setError('Enter your email and password. New accounts need a name and a password of at least 10 characters.'); return; }
    lock.current = true; setBusy(true); setError('');
    try { await signIn(email, password, register ? name : undefined); setPassword(''); } catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  return <SafeAreaView style={ui.page}><KeyboardAvoidingView style={ui.grow} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[ui.content, { paddingTop: 28 }]}><View style={ui.row}><View style={ui.grow}><Text style={ui.title}>trackexpense</Text><Text style={ui.subtitle}>Make every peso count.</Text></View><Image source={require('../assets/mascot.png')} style={{ width: 70, height: 95 }} resizeMode="contain" /></View><Card><Text style={ui.heading}>{register ? 'Build better money habits' : 'Welcome back'}</Text><Text style={ui.subtitle}>Your personal finances, securely in one place.</Text>{register && <Field label="Name" value={name} onChangeText={setName} maxLength={60} autoComplete="name" />}<Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={254} /><Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={register ? 'new-password' : 'current-password'} maxLength={128} />{error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}<Button title={busy ? 'Signing in…' : register ? 'Create account' : 'Sign in'} disabled={busy} onPress={submit} /><Button title={register ? 'Already have an account? Sign in' : 'Create an account'} secondary disabled={busy} onPress={() => { setRegister(!register); setError(''); }} /><Text style={ui.subtitle}>Recovery tokens are handled through the web app or your administrator. An internet connection is required.</Text></Card></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
