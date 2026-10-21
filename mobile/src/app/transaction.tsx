import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { localDate } from '../../../shared/finance';
import { api } from '../api';
import { useSession } from '../session';
import { useRefresh, type Category, type Transaction } from '../data';
import { validateTransaction } from '../../../shared/validation';
import { useNotice } from '../notice';
import { Busy, Button, Card, Failure, Field, ui } from '../ui';

export default function TransactionEditor() {
  const params = useLocalSearchParams<{ id?: string }>(); const id = typeof params.id === 'string' ? params.id : undefined;
  const { user, ready } = useSession();
  const categories = useQuery({ queryKey: ['categories', user?.id], queryFn: ({ signal }) => api<Category[]>('/categories', { signal }), enabled: !!user });
  const existing = useQuery({ queryKey: ['transaction', user?.id, id], queryFn: ({ signal }) => api<Transaction>('/transactions/' + encodeURIComponent(id!), { signal }), enabled: !!user && !!id });
  if (!ready) return <Busy />;
  if (!user) return <Redirect href="/" />;
  if (categories.error || existing.error) return <SafeAreaView style={ui.page}><Failure message={(categories.error || existing.error)!.message} retry={() => { void categories.refetch(); if (id) void existing.refetch(); }} /><Button title="Back" secondary onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)/dashboard"); }} /></SafeAreaView>;
  if (!categories.data || (id && !existing.data)) return <Busy />;
  return <TransactionFields key={id ?? 'new'} id={id} initial={existing.data} categories={categories.data} />;
}
function TransactionFields({ id, initial, categories }: { id?: string; initial?: Transaction; categories: Category[] }) {
  const refresh = useRefresh(); const notice = useNotice(); const network = useNetworkState();
  const [value, setValue] = useState<Omit<Transaction, 'id'>>(() => initial ? { type: initial.type, amount: initial.amount, description: initial.description, category_id: initial.category_id, transaction_date: initial.transaction_date } : { type: 'EXPENSE', amount: '', description: '', category_id: categories.find(c => c.type === 'EXPENSE')?.id ?? '', transaction_date: localDate() });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false); const [datePicker, setDatePicker] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false);
  const offline = network.isConnected === false || network.isInternetReachable === false;
  function back() { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/dashboard'); }
  async function save(remove = false) {
    if (lock.current || offline) return;
    const failure = remove ? '' : validateTransaction(value); if (failure) { setError(failure); return; }
    lock.current = true; setBusy(true); setError('');
    try { await api('/transactions' + (id ? '/' + encodeURIComponent(id) : ''), { method: remove ? 'DELETE' : id ? 'PATCH' : 'POST', ...(remove ? {} : { body: JSON.stringify(value) }) }); await refresh('transaction'); notice(remove ? 'Transaction deleted.' : 'Transaction saved.'); back(); }
    catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  return <SafeAreaView style={ui.page}><KeyboardAvoidingView style={ui.grow} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}><View style={ui.row}><Text style={ui.title}>{id ? 'Edit transaction' : 'Add transaction'}</Text></View><Card><View style={ui.row}><View style={ui.grow}><Button title="Expense" secondary={value.type !== 'EXPENSE'} disabled={busy} onPress={() => setValue(v => ({ ...v, type: 'EXPENSE', category_id: categories.find(c => c.type === 'EXPENSE')?.id ?? '' }))} /></View><View style={ui.grow}><Button title="Income" secondary={value.type !== 'INCOME'} disabled={busy} onPress={() => setValue(v => ({ ...v, type: 'INCOME', category_id: categories.find(c => c.type === 'INCOME')?.id ?? '' }))} /></View></View><Field label="Amount (₱)" value={value.amount} editable={!busy} onChangeText={amount => setValue(v => ({ ...v, amount }))} keyboardType="decimal-pad" maxLength={13} /><Field label="Description" value={value.description} editable={!busy} onChangeText={description => setValue(v => ({ ...v, description }))} maxLength={200} /><Text style={ui.label}>Category</Text><View style={ui.input}><Picker enabled={!busy} accessibilityLabel="Category" selectedValue={value.category_id} onValueChange={category_id => setValue(v => ({ ...v, category_id }))}>{categories.filter(c => c.type === value.type).map(c => <Picker.Item key={c.id} label={c.name} value={c.id} />)}</Picker></View><Field label="Date (YYYY-MM-DD)" value={value.transaction_date} editable={!busy} onChangeText={transaction_date => setValue(v => ({ ...v, transaction_date }))} maxLength={10} />{Platform.OS !== 'web' && <Button title="Choose date" secondary disabled={busy} onPress={() => setDatePicker(true)} />}{datePicker && <DateTimePicker value={new Date((/^\d{4}-\d{2}-\d{2}$/.test(value.transaction_date) && !Number.isNaN(Date.parse(value.transaction_date)) ? value.transaction_date : localDate()) + 'T12:00:00')} mode="date" minimumDate={new Date(2000, 0, 1)} maximumDate={new Date(2100, 11, 31)} onChange={(_event, selected) => { setDatePicker(false); if (selected) setValue(v => ({ ...v, transaction_date: `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}` })); }} />}{error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}<Button title={busy ? 'Saving…' : 'Save transaction'} disabled={busy || offline} onPress={() => void save()} /><Button title="Cancel" secondary disabled={busy} onPress={back} />{id && <Button title="Delete transaction" danger disabled={busy || offline} onPress={() => setConfirmDelete(true)} />}{confirmDelete && <Card><Text style={ui.heading}>Delete this transaction?</Text><Text style={ui.subtitle}>This cannot be undone.</Text><Button title="Keep transaction" secondary disabled={busy} onPress={() => setConfirmDelete(false)} /><Button title="Confirm deletion" danger disabled={busy || offline} onPress={() => void save(true)} /></Card>}</Card></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

