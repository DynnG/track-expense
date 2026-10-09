import type { Budget, Category, Report, Transaction } from './types';
import { cents, decimal, shiftMonth } from './money';
export const demoCategories: Category[] = [
  ['food', 'Food & drinks', 'EXPENSE'], ['transport', 'Transport', 'EXPENSE'], ['bills', 'Bills & utilities', 'EXPENSE'], ['shopping', 'Shopping', 'EXPENSE'], ['education', 'Education', 'EXPENSE'], ['health', 'Health', 'EXPENSE'], ['other', 'Other', 'EXPENSE'], ['salary', 'Salary', 'INCOME'], ['allowance', 'Allowance', 'INCOME'], ['other-income', 'Other income', 'INCOME'],
].map(([id, name, type]) => ({ id, name, type: type as Category['type'] }));
export function demoData(month: string): { transactions: Transaction[]; budgets: Budget[] } {
  const entries: [string, string, string, number, string][] = [
    ['salary', 'Monthly salary', '32000.00', 1, 'INCOME'], ['allowance', 'Side project', '4500.00', 4, 'INCOME'],
    ['bills', 'Rent & utilities', '6500.00', 2, 'EXPENSE'], ['food', 'Weekly groceries', '1850.00', 3, 'EXPENSE'],
    ['transport', 'Commute to work', '180.00', 3, 'EXPENSE'], ['food', 'Lunch with friends', '420.00', 5, 'EXPENSE'],
    ['shopping', 'New everyday essentials', '1250.00', 6, 'EXPENSE'], ['education', 'Online course', '899.00', 7, 'EXPENSE'],
    ['food', 'Coffee & breakfast', '195.00', 8, 'EXPENSE'], ['transport', 'Grab ride', '245.00', 8, 'EXPENSE'],
    ['health', 'Pharmacy essentials', '560.00', 9, 'EXPENSE'], ['food', 'Dinner with family', '780.00', 9, 'EXPENSE'],
  ];
  const transactions = entries.map(([category_id, description, amount, day, type], i) => ({ id: `demo-${i}`, category_id, description, amount, transaction_date: `${month}-${String(day).padStart(2, '0')}`, type: type as Transaction['type'] }));
  for (let i = 1; i <= 5; i++) {
    transactions.push({ id: `history-i-${i}`, category_id: 'salary', description: 'Monthly salary', amount: '32000.00', type: 'INCOME', transaction_date: `${shiftMonth(month, -i)}-01` });
    for (const [j, category] of ['food', 'bills', 'transport', 'shopping'].entries()) transactions.push({ id: `history-e-${i}-${j}`, category_id: category, description: 'Monthly spending', amount: String(2200 + i * 400 + j * 350) + '.00', type: 'EXPENSE', transaction_date: `${shiftMonth(month, -i)}-05` });
  }
  const budgets = [['', '20000.00'], ['food', '5000.00'], ['bills', '8000.00'], ['transport', '2000.00'], ['shopping', '3000.00'], ['education', '1000.00']].map(([category_id, amount], i) => ({ id: `budget-${i}`, category_id, amount, month }));
  return { transactions, budgets };
}
export function computeReport(transactions: Transaction[], month: string): Report {
  const totals = (m: string) => {
    const rows = transactions.filter(t => t.transaction_date.startsWith(m));
    return { income: decimal(rows.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + cents(t.amount), 0)), expense: decimal(rows.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + cents(t.amount), 0)), rows };
  };
  const current = totals(month);
  const trends = Array.from({ length: 6 }, (_, i) => { const m = shiftMonth(month, i - 5); const t = totals(m); return { month: m, income: t.income, expense: t.expense }; });
  return { income: current.income, expense: current.expense, balance: decimal(cents(current.income) - cents(current.expense)), count: current.rows.length, trends, previous: trends[4], days: [] };
}
