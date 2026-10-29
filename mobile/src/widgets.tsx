import { memo, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { cents, peso } from '../../shared/finance';
import type { Category, Report, Transaction } from './data';
import { Card, colors, ui } from './ui';
export const TransactionRow = memo(function TransactionRow({ item, category }: { item: Transaction; category: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.description || category}, ${peso(item.amount)}`} onPress={() => router.push({ pathname: '/transaction', params: { id: item.id } })} style={[ui.card, ui.row, { height: 84, padding: 16 }]}><View style={ui.grow}><Text numberOfLines={1} style={{ color: colors.ink, fontWeight: '700', fontSize: 15 }}>{item.description || category}</Text><Text numberOfLines={1} style={ui.label}>{category} · {item.transaction_date}</Text></View><Text style={{ color: item.type === 'INCOME' ? colors.green : colors.ink, fontWeight: '700', fontSize: 16 }}>{item.type === 'INCOME' ? '+' : '−'}{peso(item.amount)}</Text></Pressable>;
});
export const CategoryBars = memo(function CategoryBars({ report, categories }: { report: Pick<Report, 'expense' | 'breakdown'>; categories: Category[] }) {
  const names = useMemo(() => new Map(categories.map(c => [c.id, c.name])), [categories]);
  const expense = cents(report.expense);
  return <Card><Text style={ui.heading}>Where your pesos went</Text>{report.breakdown.length ? report.breakdown.map(c => <View key={c.category_id} style={{ gap: 8 }}><View style={ui.row}><Text style={ui.subtitle}>{names.get(c.category_id) ?? 'Other'}</Text><Text style={{ color: colors.ink, fontWeight: '700' }}>{peso(c.amount)}</Text></View><View accessibilityRole="progressbar" accessibilityLabel={names.get(c.category_id)} accessibilityValue={{ min: 0, max: 100, now: expense ? Math.round(cents(c.amount) / expense * 100) : 0 }} style={ui.progress}><View style={{ height: 8, width: `${expense ? Math.min(100, cents(c.amount) / expense * 100) : 0}%`, backgroundColor: colors.primary }} /></View></View>) : <Text style={ui.subtitle}>Add an expense to see your category breakdown.</Text>}</Card>;
});
export const TrendBars = memo(function TrendBars({ report }: { report: Report }) {
  const maximum = Math.max(1, ...report.trends.flatMap(t => [cents(t.income), cents(t.expense)]));
  return <Card><Text style={ui.heading}>Six months in perspective</Text><Text style={ui.label}>Income in teal · Expenses in blue</Text>{report.trends.map(t => <View key={t.month} style={{ gap: 5 }}><View style={ui.row}><Text style={ui.label}>{t.month}</Text><Text style={ui.label}>{peso(t.income)} / {peso(t.expense)}</Text></View><View accessibilityLabel={`${t.month} income ${peso(t.income)}, expenses ${peso(t.expense)}`} style={{ gap: 3 }}><View style={{ height: 6, width: `${cents(t.income) / maximum * 100}%`, borderRadius: 4, backgroundColor: colors.green }} /><View style={{ height: 6, width: `${cents(t.expense) / maximum * 100}%`, borderRadius: 4, backgroundColor: colors.primary }} /></View></View>)}</Card>;
});
