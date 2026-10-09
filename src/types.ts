export type Kind = 'EXPENSE' | 'INCOME';
export type Category = { id: string; name: string; type: Kind };
export type Transaction = { id: string; category_id: string; type: Kind; amount: string; description: string; transaction_date: string };
export type Budget = { id: string; category_id: string; amount: string; month: string };
export type Profile = { id: string; name: string; email: string; csrf: string };
export type Trend = { month: string; income: string; expense: string };
export type Report = { income: string; expense: string; balance: string; count: number; trends: Trend[]; previous: Trend; days: { date: string; income: string; expense: string }[] };
export type Page = 'dashboard' | 'transactions' | 'budgets' | 'reports' | 'settings';
