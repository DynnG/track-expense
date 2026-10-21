import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useNetworkState } from 'expo-network';
import { useSession } from '../session';
import { useMonth } from '../month';
import { useSummary, useRefresh, type Budget, type Category } from '../data';
import { api } from '../api';
import { validAmount } from '../../../shared/validation';
import { useNotice } from '../notice';
import { Busy, Button, Card, Failure, Field, ui } from '../ui';
export default function BudgetEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>(); const { user, ready } = useSession(); const { month } = useMonth(); const summary = useSummary(month, true, false);
  const existing = summary.budgets.data?.find(b => b.id === id);
  if (!ready) return <Busy />;
  if (!user) return <Redirect href="/" />;
  if (summary.categories.error || summary.budgets.error) return <Failure message={(summary.categories.error || summary.budgets.error)!.message} retry={() => { void summary.categories.refetch(); void summary.budgets.refetch(); }} />;
  if (id && summary.budgets.data && !existing) return <Failure message="This budget is no longer available. Return to Budgets and refresh." retry={() => router.replace('/(tabs)/budgets')} />;
  if (!summary.categories.data || !summary.budgets.data) return <Busy />;
  return <BudgetFields key={id ?? 'new'} id={typeof id === 'string' ? id : undefined} initial={existing} categories={summary.categories.data} month={month} />;
}
function BudgetFields({ id, initial, categories, month }: { id?: string; initial?: Budget; categories: Category[]; month: string }) {
  const refresh = useRefresh(); const notice = useNotice(); const network = useNetworkState();
  const [category, setCategory] = useState(initial?.category_id ?? ''); const [amount, setAmount] = useState(initial?.amount ?? ''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false); const [confirmDelete, setConfirmDelete] = useState(false);
  const offline = network.isConnected === false || network.isInternetReachable === false;
  function back() { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/budgets'); }
  async function save(remove = false) {
    if (lock.current || offline) return;
    if (!remove && !validAmount(amount)) { setError('Enter a positive limit with up to two decimal places.'); return; }
    lock.current = true; setBusy(true); setError('');
    try { await api('/budgets' + (remove ? '/' + encodeURIComponent(String(id)) : ''), { method: remove ? 'DELETE' : 'POST', ...(remove ? {} : { body: JSON.stringify({ category_id: category, amount, month }) }) }); await refresh('budget'); notice(remove ? 'Budget removed.' : 'Budget saved.'); back(); } catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  return <SafeAreaView style={ui.page}><KeyboardAvoidingView style={ui.grow} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}><Text style={ui.title}>{id ? 'Edit your limit' : 'Make a spending plan'}</Text><Card><Text style={ui.subtitle}>Budget for {month}</Text><Picker accessibilityLabel="Budget category" enabled={!id && !busy} selectedValue={category} onValueChange={setCategory}><Picker.Item label="Overall monthly spending" value="" />{categories.filter(c => c.type === 'EXPENSE').map(c => <Picker.Item key={c.id} label={c.name} value={c.id} />)}</Picker><Field label="Monthly limit (₱)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" maxLength={13} editable={!busy} />{error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}<Button title={busy ? 'Saving…' : 'Save budget'} disabled={busy || offline} onPress={() => void save()} /><Button title="Cancel" secondary disabled={busy} onPress={back} />{id && <Button title="Remove budget" danger disabled={busy || offline} onPress={() => setConfirmDelete(true)} />}{confirmDelete && <Card><Text style={ui.heading}>Remove this limit?</Text><Text style={ui.subtitle}>Your transactions will stay in your account.</Text><Button title="Keep budget" secondary disabled={busy} onPress={() => setConfirmDelete(false)} /><Button title="Confirm removal" danger disabled={busy || offline} onPress={() => void save(true)} /></Card>}</Card></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
