import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';
import { cents, peso } from '../../../../shared/finance';
import { useSession } from '../../session';
import { useMonth, MonthPicker } from '../../month';
import { useRefresh, useSummary, type Transaction } from '../../data';
import { api } from '../../api';
import { Busy, Button, Card, Failure, ui } from '../../ui';
import { CategoryBars, TransactionRow } from '../../widgets';

export default function Dashboard() {
  const { user, signOut } = useSession(); const { month } = useMonth(); const focused = useIsFocused(); const summary = useSummary(month); const refresh = useRefresh(); const [refreshing, setRefreshing] = useState(false); const [leaving, setLeaving] = useState(false);
  const recent = useQuery({ queryKey: ['recent', user?.id, month], queryFn: ({ signal }) => api<{ items: Transaction[] }>(`/transactions?month=${month}&page_size=5`, { signal }), enabled: !!user && focused });
  const error = summary.report.error || summary.categories.error || summary.budgets.error || recent.error;
  const report = summary.report.data; const categories = summary.categories.data ?? []; const overall = summary.budgets.data?.find(b => !b.category_id);
  const pull = async () => { setRefreshing(true); try { await refresh(); } finally { setRefreshing(false); } };
  return <SafeAreaView edges={['top']} style={ui.page}><ScrollView contentContainerStyle={ui.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}><View style={ui.row}><View style={ui.grow}><Text style={ui.label}>HELLO, {user?.name.toUpperCase()}</Text><Text style={ui.title}>Your money, in view.</Text></View><Button title={leaving ? 'Leaving…' : 'Sign out'} secondary disabled={leaving} onPress={() => { setLeaving(true); void signOut().catch(e => { Alert.alert('Could not sign out', e.message); setLeaving(false); }); }} /></View><MonthPicker />{error ? <Failure message={(error as Error).message} retry={() => void pull()} /> : !report || summary.categories.isPending || summary.budgets.isPending ? <Busy /> : <><Card><Text style={ui.label}>NET BALANCE</Text><Text style={ui.number}>{peso(report.balance)}</Text><Text style={ui.subtitle}>Income minus expenses this month</Text><View style={ui.row}><View><Text style={ui.label}>Income</Text><Text style={ui.heading}>{peso(report.income)}</Text></View><View><Text style={ui.label}>Expenses</Text><Text style={ui.heading}>{peso(report.expense)}</Text></View></View></Card><Card><Text style={ui.label}>BUDGET REMAINING</Text><Text style={ui.number}>{overall ? peso(cents(overall.amount) - cents(report.expense)) : 'No limit set'}</Text><Text style={ui.subtitle}>{overall ? `Of ${peso(overall.amount)} this month` : 'Set a spending limit in Budgets.'}</Text></Card><CategoryBars report={report} categories={categories} /><Text style={ui.heading}>Recent transactions</Text>{recent.data?.items.length ? recent.data.items.map(item => <TransactionRow key={item.id} item={item} category={categories.find(c => c.id === item.category_id)?.name ?? 'Transaction'} />) : <Card><Text style={ui.subtitle}>Tap + to add your first income or expense.</Text></Card>}</>}</ScrollView></SafeAreaView>;
}
