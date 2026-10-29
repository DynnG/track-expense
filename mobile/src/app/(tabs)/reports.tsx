import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { cents, peso } from '../../../../shared/finance';
import { reportDayLabel, shiftReportDay } from '../../../../shared/reportDate';
import { useDailySummary, useRefresh, type Transaction } from '../../data';
import { useSession } from '../../session';
import { api } from '../../api';
import { DailyReportControls, useReportDay } from '../../DailyReportControls';
import { CategoryBars, TransactionRow } from '../../widgets';
import { Busy, Button, Card, colors, Empty, Failure, ui } from '../../ui';
import type { DailyReport } from '../../../../src/types';

type DayTransactions = { items: Transaction[]; total: number; page: number };
export default function Reports() {
  const { day, today, select } = useReportDay();
  const { user } = useSession();
  const focused = useIsFocused();
  const { report, categories } = useDailySummary(day);
  const refresh = useRefresh();
  const [refreshing, setRefreshing] = useState(false);
  const transactions = useInfiniteQuery({
    queryKey: ['daily-transactions', user?.id, day], initialPageParam: 1,
    enabled: !!user && focused,
    queryFn: ({ pageParam, signal }) => api<DayTransactions>(`/transactions?month=${day.slice(0, 7)}&day=${day}&page=${pageParam}&page_size=20`, { signal }),
    getNextPageParam: last => last.page * 20 < last.total ? last.page + 1 : undefined,
  });
  const names = useMemo(() => new Map((categories.data ?? []).map(category => [category.id, category.name])), [categories.data]);
  const items = useMemo(() => transactions.data?.pages.flatMap(page => page.items) ?? [], [transactions.data]);
  const ready = !!report.data && !!categories.data && !report.error && !categories.error;
  const yesterday = shiftReportDay(today, -1);
  const dayName = day === today ? 'Today' : day === yesterday ? 'Yesterday' : 'Selected day';
  async function pull() { setRefreshing(true); try { await refresh(); } finally { setRefreshing(false); } }
  return <SafeAreaView edges={['top']} style={ui.page}><FlatList
    data={ready ? items : []} keyExtractor={item => item.id} contentContainerStyle={ui.content}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void pull()} />}
    ListHeaderComponent={<View style={{ gap: 16 }}><Text style={ui.title}>Your daily report</Text><Text style={ui.subtitle}>See what you spent today, yesterday, or any earlier day.</Text><DailyReportControls day={day} today={today} select={select} />{report.error || categories.error ? <Failure message={(report.error || categories.error)!.message} retry={() => void pull()} /> : !report.data || !categories.data ? <Busy message="Loading this day’s report…" /> : <><Card><Text style={ui.label}>{dayName.toUpperCase()} · {reportDayLabel(day)}</Text><Text style={ui.heading}>Total spent</Text><Text style={ui.number}>{peso(report.data.expense)}</Text><Text style={ui.subtitle}>{report.data.count} {report.data.count === 1 ? 'transaction' : 'transactions'} recorded on this day</Text><View style={ui.divider} /><Text style={ui.subtitle}>Income {peso(report.data.income)} · Net {peso(report.data.balance)}</Text></Card><Card><Text style={ui.heading}>Compared with the previous day</Text><Text style={ui.subtitle}>{cents(report.data.expense) === cents(report.data.previous.expense) ? 'You spent the same amount on both days.' : `${peso(Math.abs(cents(report.data.expense) - cents(report.data.previous.expense)))} ${cents(report.data.expense) > cents(report.data.previous.expense) ? 'more' : 'less'} than ${reportDayLabel(report.data.previous.date)}.`}</Text><Text style={ui.label}>Previous day’s expenses: {peso(report.data.previous.expense)}</Text></Card><Text style={ui.heading}>Transactions on this day</Text></>}</View>}
    renderItem={({ item }) => <TransactionRow item={item} category={names.get(item.category_id) ?? 'Other'} />}
    ListEmptyComponent={ready ? transactions.isPending ? <Busy message="Loading transactions…" /> : transactions.error ? <Failure message={transactions.error.message} retry={() => void transactions.refetch()} /> : <Empty title="No transactions on this day" text="Try Yesterday or choose another date. Your saved records stay in the same account." /> : undefined}
    ListFooterComponent={ready && report.data && categories.data ? <View style={{ gap: 16 }}>{transactions.error && items.length > 0 ? <Failure message={transactions.error.message} retry={() => void transactions.refetch()} /> : null}{transactions.hasNextPage && <Button title={transactions.isFetchingNextPage ? 'Loading…' : 'Load more transactions'} secondary disabled={transactions.isFetchingNextPage} onPress={() => void transactions.fetchNextPage()} />}<CategoryBars report={report.data} categories={categories.data} /><DailyTrendBars report={report.data} /></View> : undefined}
  /></SafeAreaView>;
}
function DailyTrendBars({ report }: { report: DailyReport }) {
  const maximum = Math.max(1, ...report.days.flatMap(day => [cents(day.income), cents(day.expense)]));
  return <Card><Text style={ui.heading}>Last seven days</Text><Text style={ui.label}>Income in teal · Expenses in blue</Text>{report.days.map(day => <View key={day.date} style={{ gap: 5 }}><View style={ui.row}><Text style={ui.label}>{reportDayLabel(day.date)}</Text><Text style={ui.label}>{peso(day.income)} / {peso(day.expense)}</Text></View><View accessibilityLabel={`${reportDayLabel(day.date)} income ${peso(day.income)}, expenses ${peso(day.expense)}`} style={{ gap: 3 }}><View style={{ height: 6, width: `${cents(day.income) / maximum * 100}%`, borderRadius: 4, backgroundColor: colors.green }} /><View style={{ height: 6, width: `${cents(day.expense) / maximum * 100}%`, borderRadius: 4, backgroundColor: colors.primary }} /></View></View>)}</Card>;
}
