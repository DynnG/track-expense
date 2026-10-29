import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useSession } from './session';
import { useIsFocused } from 'expo-router';
import type { Budget, Category, DailyReport, Report } from '../../src/types';
export type { Budget, Category, Report, Transaction } from '../../src/types';
export function useSummary(month: string, needsBudgets = true, needsReport = true) {
  const { user } = useSession();
  const id = user?.id;
  const focused = useIsFocused();
  const categories = useQuery({ queryKey: ['categories', id], queryFn: ({ signal }) => api<Category[]>('/categories', { signal }), enabled: !!id && focused });
  const report = useQuery({ queryKey: ['report', id, month], queryFn: ({ signal }) => api<Report>(`/reports/monthly?month=${month}`, { signal }), enabled: !!id && focused && needsReport });
  const budgets = useQuery({ queryKey: ['budgets', id, month], queryFn: ({ signal }) => api<Budget[]>(`/budgets?month=${month}`, { signal }), enabled: !!id && focused && needsBudgets });
  return { categories, report, budgets };
}
export function useRefresh() {
  const query = useQueryClient();
  const { user } = useSession();
  return async (kind?: 'transaction' | 'budget') => {
    if (kind === 'transaction') query.removeQueries({ predicate: q => q.queryKey[0] === 'transaction' && q.queryKey[1] === user?.id });
    const keys = kind === 'transaction' ? ['report', 'daily-report', 'daily-transactions', 'transactions', 'recent'] : kind === 'budget' ? ['budgets'] : ['report', 'daily-report', 'daily-transactions', 'transactions', 'recent', 'categories', 'budgets'];
    await query.invalidateQueries({ predicate: q => q.queryKey[1] === user?.id && keys.includes(String(q.queryKey[0])) });
  };
}

export function useDailySummary(day: string) {
  const { user } = useSession();
  const focused = useIsFocused();
  const enabled = !!user && focused;
  const categories = useQuery({ queryKey: ['categories', user?.id], queryFn: ({ signal }) => api<Category[]>('/categories', { signal }), enabled });
  const report = useQuery({ queryKey: ['daily-report', user?.id, day], queryFn: ({ signal }) => api<DailyReport>(`/reports/daily?day=${day}`, { signal }), enabled });
  return { categories, report };
}

