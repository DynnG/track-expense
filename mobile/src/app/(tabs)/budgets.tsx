import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { cents, peso } from '../../../../shared/finance';
import { useMonth, MonthPicker } from '../../month';
import { useSummary, useRefresh } from '../../data';
import { Busy, Button, Card, Empty, Failure, colors, ui } from '../../ui';
export default function Budgets() {
  const { month } = useMonth(); const summary = useSummary(month); const refresh = useRefresh(); const [refreshing, setRefreshing] = useState(false);
  const error = summary.report.error || summary.budgets.error || summary.categories.error;
  const pull = async () => { setRefreshing(true); try { await refresh(); } finally { setRefreshing(false); } };
  return <SafeAreaView edges={['top']} style={ui.page}><ScrollView contentContainerStyle={ui.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}><Text style={ui.title}>Give your money a plan.</Text><MonthPicker /><Button title="Set a budget" onPress={() => router.push('/budget')} />{error ? <Failure message={(error as Error).message} retry={() => void pull()} /> : !summary.report.data || !summary.budgets.data || !summary.categories.data ? <Busy /> : summary.budgets.data.length ? summary.budgets.data.map(b => { const report = summary.report.data!; const spent = cents(b.category_id ? report.breakdown.find(c => c.category_id === b.category_id)?.amount ?? '0' : report.expense); const limit = cents(b.amount); const name = b.category_id ? summary.categories.data?.find(c => c.id === b.category_id)?.name ?? 'Category' : 'Overall monthly spending'; const percent = Math.min(100, Math.round(spent / limit * 100)); return <Card key={b.id}><Text style={ui.heading}>{name}</Text><View style={ui.row}><Text style={ui.number}>{peso(spent)}</Text><Text style={ui.subtitle}>of {peso(limit)}</Text></View><View accessibilityRole="progressbar" accessibilityLabel={name} accessibilityValue={{ min: 0, max: 100, now: percent }} style={ui.progress}><View style={{ width: `${percent}%`, height: 8, backgroundColor: spent > limit ? colors.danger : colors.primary }} /></View><Text style={ui.subtitle}>{peso(Math.abs(limit - spent))} {spent > limit ? 'over budget' : 'remaining'}</Text><Button title="Edit limit" secondary onPress={() => router.push({ pathname: '/budget', params: { id: b.id } })} /></Card>; }) : <Empty title="Start with a limit" text="Set an overall monthly budget, then add category limits." />}</ScrollView></SafeAreaView>;
}
