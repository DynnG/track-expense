import { useState } from 'react';
import { RefreshControl, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { peso } from '../../../../shared/finance';
import { MonthPicker, useMonth } from '../../month';
import { useSummary, useRefresh } from '../../data';
import { CategoryBars, TrendBars } from '../../widgets';
import { Busy, Card, Failure, ui } from '../../ui';
export default function Reports() {
  const { month } = useMonth(); const { report, categories } = useSummary(month, false); const refresh = useRefresh(); const [refreshing, setRefreshing] = useState(false);
  const pull = async () => { setRefreshing(true); try { await refresh(); } finally { setRefreshing(false); } };
  return <SafeAreaView edges={['top']} style={ui.page}><ScrollView contentContainerStyle={ui.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}><Text style={ui.title}>See the bigger picture.</Text><MonthPicker />{report.error || categories.error ? <Failure message={(report.error || categories.error)!.message} retry={() => void pull()} /> : !report.data || !categories.data ? <Busy /> : <><Card><Text style={ui.label}>TOTAL EXPENSES</Text><Text style={ui.number}>{peso(report.data.expense)}</Text><Text style={ui.subtitle}>Income {peso(report.data.income)} · Balance {peso(report.data.balance)}</Text><Text style={ui.label}>{report.data.count} transactions this month</Text></Card><TrendBars report={report.data} /><CategoryBars report={report.data} categories={categories.data} /><Card><Text style={ui.heading}>Previous month</Text><Text style={ui.number}>{peso(report.data.previous.expense)}</Text><Text style={ui.subtitle}>Recorded expenses in {report.data.previous.month}</Text></Card></>}</ScrollView></SafeAreaView>;
}
