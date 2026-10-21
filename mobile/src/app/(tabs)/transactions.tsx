import { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';
import { api } from '../../api';
import { useSession } from '../../session';
import { MonthPicker, useMonth } from '../../month';
import type { Category, Transaction } from '../../data';
import { Busy, Button, Empty, Failure, Field, ui } from '../../ui';
import { TransactionRow } from '../../widgets';
type Page = { items: Transaction[]; page: number; total: number };
export default function History() {
  const { user } = useSession(); const { month } = useMonth(); const focused = useIsFocused();
  const [input, setInput] = useState(''); const [search, setSearch] = useState(''); const [category, setCategory] = useState(''); const [kind, setKind] = useState('');
  useEffect(() => { const timer = setTimeout(() => setSearch(input), 300); return () => clearTimeout(timer); }, [input]);
  const categories = useQuery({ queryKey: ['categories', user?.id], queryFn: ({ signal }) => api<Category[]>('/categories', { signal }), enabled: focused && !!user });
  const query = useInfiniteQuery({ queryKey: ['transactions', user?.id, month, category, kind, search], initialPageParam: 1, queryFn: ({ signal, pageParam }) => api<Page>(`/transactions?${new URLSearchParams({ month, category_id: category, type: kind, search, page: String(pageParam), page_size: '20' })}`, { signal }), getNextPageParam: last => last.page * 20 < last.total ? last.page + 1 : undefined, enabled: focused && !!user });
  const items = useMemo(() => query.data?.pages.flatMap(page => page.items) ?? [], [query.data]);
  const names = useMemo(() => new Map(categories.data?.map(c => [c.id, c.name]) ?? []), [categories.data]);
  return <SafeAreaView edges={['top']} style={ui.page}><FlatList data={items} keyExtractor={item => item.id} renderItem={({ item }) => <TransactionRow item={item} category={names.get(item.category_id) ?? 'Transaction'} />} contentContainerStyle={[ui.content, { gap: 0 }]} ItemSeparatorComponent={() => <View style={{ height: 10 }} />} keyboardShouldPersistTaps="handled" refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); void categories.refetch(); }} initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7} getItemLayout={(_data, index) => ({ length: 94, offset: 94 * index, index })} ListHeaderComponent={<View style={{ gap: 16, paddingBottom: 16 }}><Text style={ui.title}>Every peso, accounted for.</Text><MonthPicker /><Field label="Search descriptions" value={input} onChangeText={setInput} maxLength={100} /><View style={ui.input}><Picker accessibilityLabel="Filter category" selectedValue={category} onValueChange={setCategory}><Picker.Item label="All categories" value="" />{categories.data?.map(c => <Picker.Item key={c.id} label={c.name} value={c.id} />)}</Picker></View><View style={ui.input}><Picker accessibilityLabel="Filter type" selectedValue={kind} onValueChange={setKind}><Picker.Item label="All types" value="" /><Picker.Item label="Expenses" value="EXPENSE" /><Picker.Item label="Income" value="INCOME" /></Picker></View><Text style={ui.label}>Newest first · {query.data?.pages[0]?.total ?? 0} transactions</Text>{query.error || categories.error ? <Failure message={(query.error || categories.error)!.message} retry={() => { void query.refetch(); void categories.refetch(); }} /> : null}</View>} ListEmptyComponent={query.isPending ? <Busy /> : <Empty title="No matching transactions" text="Change the month or filters, or tap + to add a transaction." />} ListFooterComponent={query.hasNextPage ? <Button title={query.isFetchingNextPage ? 'Loading…' : 'Load more'} disabled={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : undefined} /></SafeAreaView>;
}
