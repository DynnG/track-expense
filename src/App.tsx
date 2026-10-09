import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Bell, ChevronLeft, ChevronRight, Download, LayoutDashboard, LogOut, Menu, PiggyBank, Plus, ReceiptText, Search, Settings, ShieldCheck, Sparkles, TrendingUp, Wallet, X, ChartNoAxesCombined } from 'lucide-react';
import Auth from './Auth';
import GoogleConnection from './GoogleConnection';
import { AddButton, BudgetForm, CategoryIcon, ConfirmDelete, Empty, ErrorBoundary, Modal, MonthPicker, Toast, TransactionForm, TransactionTable } from './components';
import { api, downloadReport, saveBlob, setSession } from './api';
import { computeReport, demoCategories, demoData } from './demo';
import { cents, decimal, localDate, monthLabel, peso } from './money';
import type { Budget, Category, Page, Profile, Report, Transaction } from './types';
const TrendChart = lazy(() => import('./Charts').then(m => ({ default: m.TrendChart })));
const CategoryChart = lazy(() => import('./Charts').then(m => ({ default: m.CategoryChart })));
const NAV = [
  { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { page: 'transactions', label: 'Transactions', icon: ReceiptText },
  { page: 'budgets', label: 'Budgets', icon: PiggyBank },
  { page: 'reports', label: 'Reports', icon: ChartNoAxesCombined },
] as const;
const titles: Record<Page, string> = { dashboard: 'A little clarity. A lot of progress.', transactions: 'Every peso, accounted for.', budgets: 'Give your money a plan.', reports: 'See the bigger picture.', settings: 'Your workspace.' };
const validPages: Page[] = ['dashboard', 'transactions', 'budgets', 'reports', 'settings'];
const hashPage = (): Page => { const candidate = location.hash.slice(1) as Page; return validPages.includes(candidate) ? candidate : 'dashboard'; };
type TxPage = { items: Transaction[]; total: number; page: number };

export default function App() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState<Page>(hashPage);
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [profile, setProfile] = useState<Profile | null>(null);
  const [demo, setDemo] = useState(true);
  const [checked, setChecked] = useState(false);
  const [sample, setSample] = useState(() => demoData(localDate().slice(0, 7)));
  const [authOpen, setAuthOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    sidebarRef.current?.querySelector<HTMLElement>('.nav-item')?.focus();
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); previous?.focus(); };
  }, [mobileOpen]);
  const [txDialog, setTxDialog] = useState<Transaction | 'new' | null>(null);
  const [budgetDialog, setBudgetDialog] = useState<Budget | 'new' | null>(null);
  const [deleteItem, setDeleteItem] = useState<{ type: 'transaction' | 'budget'; item: Transaction | Budget } | null>(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [search, setSearch] = useState(''); const [searchInput, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(''); const [typeFilter, setTypeFilter] = useState(''); const [pageNumber, setPageNumber] = useState(1);
  const [toast, setToast] = useState(''); const [globalError, setGlobalError] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('auth_error');
    const messages: Record<string, string> = { invalid_flow: 'This Google sign-in expired or could not be verified. Please try again.', cancelled: 'Google sign-in was cancelled. You can try again or use email.', verification_failed: 'We could not verify your Google account. Please try again.', account_exists: 'Sign in with your existing password, then connect Google in Settings.', already_connected: 'This Google account is already connected to an account.' };
    if (code) { setGlobalError(messages[code] ?? 'Google sign-in could not be completed.'); setAuthOpen(true); }
    if (params.get('google_linked') === '1') setToast('Google account connected.');
    if (code || params.has('google_linked')) { params.delete('auth_error'); params.delete('google_linked'); const query = params.toString(); history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => { setSearch(searchInput); setPageNumber(1); }, 300); return () => clearTimeout(timer); }, [searchInput]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { const onHash = () => { setPage(hashPage()); setMobileOpen(false); }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  useEffect(() => { let active = true; api<Profile>('/auth/me').then(p => { if (active) { setProfile(p); setSession(p); setDemo(false); } }).catch(() => {}).finally(() => { if (active) setChecked(true); }); const expire = () => { setProfile(null); setSession(null); queryClient.clear(); setDemo(true); setGlobalError('Your session expired. Sign in again to access your records.'); setAuthOpen(true); }; window.addEventListener('session-expired', expire); return () => { active = false; window.removeEventListener('session-expired', expire); }; }, [queryClient]);
  function navigate(next: Page) { location.hash = next; setPage(next); setMobileOpen(false); }
  function changeMonth(next: string) { setMonth(next); setPageNumber(1); }
  const enabled = checked && !demo && !!profile;
  const scope = profile?.id ?? 'sample';
  const categoriesQuery = useQuery({ queryKey: ['categories', scope], queryFn: () => api<Category[]>('/categories'), enabled });
  const budgetsQuery = useQuery({ queryKey: ['budgets', scope, month], queryFn: () => api<Budget[]>(`/budgets?month=${month}`), enabled });
  const reportQuery = useQuery({ queryKey: ['report', scope, month], queryFn: () => api<Report>(`/reports/monthly?month=${month}`), enabled });
  const breakdownQuery = useQuery({ queryKey: ['breakdown', scope, month], queryFn: () => api<{ category_id: string; amount: string }[]>(`/reports/categories?month=${month}`), enabled });
  const transactionsQuery = useQuery({ queryKey: ['transactions', scope, month, categoryFilter, typeFilter, search, pageNumber], queryFn: () => api<TxPage>(`/transactions?${new URLSearchParams({ month, category_id: categoryFilter, type: typeFilter, search, page: String(pageNumber), page_size: '10' })}`), enabled: enabled && page === 'transactions' });
  const recentQuery = useQuery({ queryKey: ['recent', scope, month], queryFn: () => api<TxPage>(`/transactions?month=${month}&page_size=5`), enabled: enabled && page === 'dashboard' });
  const categories = demo ? demoCategories : categoriesQuery.data ?? [];
  const budgets = demo ? sample.budgets.filter(b => b.month === month) : budgetsQuery.data ?? [];
  const report = demo ? computeReport(sample.transactions, month) : reportQuery.data;
  const breakdown = useMemo(() => {
    if (!demo) return breakdownQuery.data ?? [];
    const values = new Map<string, number>(); sample.transactions.filter(t => t.transaction_date.startsWith(month) && t.type === 'EXPENSE').forEach(t => values.set(t.category_id, (values.get(t.category_id) ?? 0) + cents(t.amount)));
    return [...values].map(([category_id, value]) => ({ category_id, amount: decimal(value) }));
  }, [demo, sample.transactions, month, breakdownQuery.data]);
  const filtered = demo ? sample.transactions.filter(t => t.transaction_date.startsWith(month) && (!categoryFilter || t.category_id === categoryFilter) && (!typeFilter || t.type === typeFilter) && (!search || t.description.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)) : [];
  const transactions = demo ? filtered.slice((pageNumber - 1) * 10, pageNumber * 10) : transactionsQuery.data?.items ?? [];
  const txTotal = demo ? filtered.length : transactionsQuery.data?.total ?? 0;
  useEffect(() => { if (demo || transactionsQuery.data) setPageNumber(p => Math.min(p, Math.max(1, Math.ceil(txTotal / 10)))); }, [demo, txTotal, transactionsQuery.data]);
  const recent = demo ? sample.transactions.filter(t => t.transaction_date.startsWith(month)).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)).slice(0, 5) : recentQuery.data?.items ?? [];
  const overall = budgets.find(b => !b.category_id);
  const expense = report ? cents(report.expense) : 0;
  const remaining = overall ? cents(overall.amount) - expense : 0;
  const used = overall ? expense / cents(overall.amount) * 100 : 0;
  const warnings = budgets.map(b => { const spend = b.category_id ? cents(breakdown.find(c => c.category_id === b.category_id)?.amount ?? '0') : expense; return { budget: b, spend, percent: spend / cents(b.amount) * 100, name: b.category_id ? categories.find(c => c.id === b.category_id)?.name ?? 'Category' : 'Overall monthly budget' }; }).filter(b => b.percent >= 80);
  const dataError = !demo && (categoriesQuery.error || budgetsQuery.error || reportQuery.error || breakdownQuery.error || (page === 'transactions' && transactionsQuery.error) || (page === 'dashboard' && recentQuery.error));
  const loading = !checked || (!demo && (categoriesQuery.isLoading || reportQuery.isLoading || budgetsQuery.isLoading));
  async function refresh() { await queryClient.invalidateQueries(); }
  async function saveTransaction(value: Omit<Transaction, 'id'>, id?: string) {
    if (demo) { setSample(s => ({ ...s, transactions: id ? s.transactions.map(t => t.id === id ? { ...value, id } : t) : [...s.transactions, { ...value, id: crypto.randomUUID() }] })); }
    else { await api(`/transactions${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(value) }); await refresh(); }
    setToast(id ? 'Transaction updated.' : 'Transaction added.');
  }
  async function saveBudget(value: Omit<Budget, 'id'>) {
    if (demo) setSample(s => { const existing = s.budgets.find(b => b.category_id === value.category_id && b.month === value.month); return { ...s, budgets: existing ? s.budgets.map(b => b.id === existing.id ? { ...value, id: b.id } : b) : [...s.budgets, { ...value, id: crypto.randomUUID() }] }; });
    else { await api('/budgets', { method: 'POST', body: JSON.stringify(value) }); await refresh(); }
    setToast('Budget saved.');
  }
  async function removeItem() {
    if (!deleteItem) return;
    if (demo) setSample(s => ({ ...s, transactions: deleteItem.type === 'transaction' ? s.transactions.filter(t => t.id !== deleteItem.item.id) : s.transactions, budgets: deleteItem.type === 'budget' ? s.budgets.filter(b => b.id !== deleteItem.item.id) : s.budgets }));
    else { await api(`/${deleteItem.type === 'transaction' ? 'transactions' : 'budgets'}/${deleteItem.item.id}`, { method: 'DELETE' }); await refresh(); }
    setToast(deleteItem.type === 'transaction' ? 'Transaction deleted.' : 'Budget deleted.');
  }
  async function exportReport() {
    try { if (!demo) await downloadReport(month); else { const escape = (s: string) => `"${s.replaceAll('"', '""')}"`; const rows = sample.transactions.filter(t => t.transaction_date.startsWith(month)).map(t => { let description = t.description; if (/^[=+\-@\t\r]/.test(description.trimStart())) description = "'" + description; return [t.transaction_date, t.type, categories.find(c => c.id === t.category_id)?.name ?? '', description, t.amount].map(escape).join(','); }); saveBlob(new Blob(['\ufeffDate,Type,Category,Description,Amount (PHP)\n' + rows.join('\n')], { type: 'text/csv' }), `track-expense-sample-${month}.csv`); } setToast('Report downloaded.'); } catch (e) { setGlobalError((e as Error).message); }
  }
  async function logout() { try { await api('/auth/logout', { method: 'POST', body: '{}' }); setProfile(null); setSession(null); setDemo(true); queryClient.clear(); setToast('You’re signed out.'); } catch (e) { setGlobalError((e as Error).message); } }
  const transactionActions = { edit: (t: Transaction) => setTxDialog(t), remove: (t: Transaction) => setDeleteItem({ type: 'transaction', item: t }) };
  function budgetCard(b: Budget) {
    const name = b.category_id ? categories.find(c => c.id === b.category_id)?.name ?? 'Category' : 'Monthly spending';
    const spend = b.category_id ? cents(breakdown.find(c => c.category_id === b.category_id)?.amount ?? '0') : expense;
    const percent = spend / cents(b.amount) * 100;
    return <article className={`panel budget-card ${!b.category_id ? 'overall-card' : ''}`} key={b.id}><div className="budget-card-top"><CategoryIcon name={name} /><span className={`status-chip ${percent >= 100 ? 'over' : percent >= 80 ? 'near' : ''}`}>{percent >= 100 ? 'Over budget' : percent >= 80 ? 'Almost there' : 'On track'}</span></div><h3>{name}</h3><div className="budget-amount"><strong>{peso(spend)}</strong><span>of {peso(b.amount)}</span></div><div className={`progress ${percent >= 100 ? 'over' : percent >= 80 ? 'near' : ''}`} role="progressbar" aria-label={`${name} budget used`} aria-valuenow={Math.min(100, Math.round(percent))} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.min(100, percent)}%` }} /></div><div className="budget-meta"><span>{Math.round(percent)}% used</span><span>{peso(Math.abs(cents(b.amount) - spend))} {percent > 100 ? 'over' : 'left'}</span></div><div className="budget-actions"><button className="text-button" onClick={() => setBudgetDialog(b)}>Edit limit</button><button className="text-button muted" onClick={() => setDeleteItem({ type: 'budget', item: b })}>Remove</button></div></article>;
  }
  return <ErrorBoundary><a className="skip-link" href="#main">Skip to main content</a><div className="app-shell">
    {mobileOpen && <button className="nav-overlay" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside ref={sidebarRef} className={`sidebar ${mobileOpen ? 'open' : ''}`}><a className="brand" href="#dashboard" onClick={() => navigate('dashboard')}><span className="brand-icon">₱</span><span>track<span className="brand-light">expense</span><small>MAKE EVERY PESO COUNT</small></span></a><button className="mobile-close icon-button" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X /></button>
      <div className="nav-caption">YOUR WORKSPACE</div><nav aria-label="Main navigation">{NAV.map(n => <a key={n.page} href={`#${n.page}`} onClick={() => navigate(n.page)} className={`nav-item ${page === n.page ? 'active' : ''}`} aria-current={page === n.page ? 'page' : undefined}><n.icon size={20} /><span>{n.label}</span>{page === n.page && <i />}</a>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-tip"><div className="tip-symbol"><Sparkles size={18} /></div><strong>Small steps add up.</strong><p>A quick daily check-in can build a lasting habit.</p></div><a href="#settings" className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings size={20} />Settings</a><div className="sidebar-profile"><span className="avatar">{profile?.name.slice(0, 1).toUpperCase() ?? 'S'}</span><div><strong>{profile?.name ?? 'Sample workspace'}</strong><small>{demo ? 'Explore at your own pace' : 'Personal account'}</small></div>{!demo && <button className="icon-button" title="Sign out" aria-label="Sign out" onClick={logout}><LogOut size={17} /></button>}</div></div>
    </aside>
    <div className="workspace" inert={mobileOpen}><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu /></button><span>Your workspace</span><ChevronRight size={14} /><strong>{page[0].toUpperCase() + page.slice(1)}</strong></div><div className="topbar-actions"><span className="php-badge">PHP <span>₱</span></span><button className="notification-button icon-button" aria-label={`Budget notifications${warnings.length ? `, ${warnings.length} alerts` : ''}`} onClick={() => setNotificationOpen(true)}><Bell size={20} />{warnings.length > 0 && <i />}</button><button className="avatar" aria-label={demo ? 'Sign in to your account' : 'Open account settings'} onClick={() => demo ? setAuthOpen(true) : navigate('settings')}>{profile?.name.slice(0, 1).toUpperCase() ?? 'S'}</button></div></header>
    <main id="main" className="main-content" tabIndex={-1}>
      {demo && checked && <div className="demo-banner"><span><Sparkles size={16} /><strong>Sample workspace</strong><span className="demo-explanation"> · Try things out. Sample changes reset when you reload.</span></span><button className="text-button" onClick={() => setAuthOpen(true)}>Sign in / create account</button></div>}
      {globalError && <div className="error-banner" role="alert"><span>{globalError}</span><button aria-label="Dismiss message" className="icon-button" onClick={() => setGlobalError('')}><X size={18} /></button></div>}
      <div className="page-heading"><div><p className="eyebrow">{page === 'dashboard' ? `HELLO${profile ? `, ${profile.name.toUpperCase()}` : ''}` : page.toUpperCase()}</p><h1>{titles[page]}</h1><p className="page-subtitle">{page === 'dashboard' ? 'Your money habits, all in one place.' : page === 'transactions' ? 'Keep track of the money coming in and going out.' : page === 'budgets' ? 'Set realistic limits and stay in control.' : page === 'reports' ? 'Understand your spending, one month at a time.' : 'Manage your account and personal preferences.'}</p></div>{page !== 'settings' && <div className="heading-actions"><MonthPicker month={month} change={changeMonth} />{page === 'budgets' ? <AddButton action={() => setBudgetDialog('new')}>Set budget</AddButton> : page === 'reports' ? <button className="button primary" onClick={exportReport}><Download size={17} />Export CSV</button> : <AddButton action={() => setTxDialog('new')} />}</div>}</div>
      {dataError ? <div className="panel empty" role="alert"><h2>Your workspace couldn’t load.</h2><p>{(dataError as Error).message}</p><button className="button primary" onClick={refresh}>Try again</button></div> : loading ? <div className="loading-grid" aria-label="Loading workspace" aria-busy="true">{[1, 2, 3, 4].map(i => <div key={i} className="skeleton panel" />)}</div> : <>
      {page === 'dashboard' && report && <>
        <section className="stats-grid" aria-label="Monthly summary">
          <article className="stat-card balance-card"><div className="stat-label"><span>Net balance</span><span className="stat-icon"><Wallet size={19} /></span></div><strong className="stat-value">{peso(report.balance)}</strong><p>Income minus expenses this month</p><span className="balance-decoration" aria-hidden>₱</span></article>
          <article className="stat-card"><div className="stat-label"><span>Total income</span><span className="stat-icon income-icon"><ArrowDownLeft size={20} /></span></div><strong className="stat-value">{peso(report.income)}</strong><p><span className="positive">Money in</span> · {monthLabel(month).split(' ')[0]}</p></article>
          <article className="stat-card"><div className="stat-label"><span>Total expenses</span><span className="stat-icon expense-icon"><ArrowUpRight size={20} /></span></div><strong className="stat-value">{peso(report.expense)}</strong><p>{report.count} transaction{report.count === 1 ? '' : 's'} recorded this month</p></article>
          <article className="stat-card"><div className="stat-label"><span>Budget remaining</span><span className="stat-icon budget-icon"><PiggyBank size={20} /></span></div><strong className={`stat-value ${overall && remaining < 0 ? 'danger-text' : ''}`}>{overall ? peso(remaining) : 'No limit set'}</strong>{overall ? <><div className={`progress mini ${used >= 100 ? 'over' : ''}`}><span style={{ width: `${Math.min(100, used)}%` }} /></div><p>{Math.round(used)}% of {peso(overall.amount)} used</p></> : <button className="text-button" onClick={() => setBudgetDialog('new')}>Set a monthly budget</button>}</article>
        </section>
        <div className="dashboard-middle"><section className="panel trend-panel"><div className="section-heading"><div><h2>Money in, money out</h2><p>Your monthly overview</p></div><div className="chart-key"><span><i className="income-dot" />Income</span><span><i />Expenses</span></div></div><Suspense fallback={<div className="chart skeleton" />}><TrendChart report={report} /></Suspense></section>
          <aside className="mascot-panel"><div className="mascot-copy"><span className="mascot-chip"><Sparkles size={13} />A LITTLE ENCOURAGEMENT</span><h2>{overall && used >= 100 ? 'A fresh plan starts here.' : 'You’ve got this.'}</h2><p>{overall ? used >= 100 ? 'You’re over your monthly limit. Review your spending and adjust your plan.' : `${peso(Math.max(0, remaining))} left in your budget. A small check-in makes a big difference.` : 'Give every peso a purpose. Set your first budget and take it one day at a time.'}</p><button className="button" onClick={() => navigate('budgets')}>Check my budgets</button></div><img src="/assets/mascot-3d.png" alt="Track Expense’s smiling mascot in a navy uniform and red tie" width="1080" height="1440" className="mascot" /></aside></div>
        <div className="dashboard-lower"><section className="panel recent-panel"><div className="section-heading"><div><h2>Recent transactions</h2><p>The little things, kept in view</p></div><button className="text-button" onClick={() => navigate('transactions')}>View all</button></div><TransactionTable items={recent} categories={categories} {...transactionActions} compact /></section><section className="panel breakdown-panel"><div className="section-heading"><div><h2>Spending breakdown</h2><p>Where your pesos went</p></div></div><Suspense fallback={<div className="skeleton chart" />}><CategoryChart breakdown={breakdown} categories={categories} /></Suspense></section></div>
      </>}
      {page === 'transactions' && <section className="panel"><div className="filters"><label className="search-field"><Search size={18} /><input placeholder="Search descriptions…" aria-label="Search transactions" maxLength={100} value={searchInput} onChange={e => setSearchInput(e.target.value)} />{searchInput && <button className="icon-button" aria-label="Clear search" onClick={() => setSearchInput('')}><X size={16} /></button>}</label><label className="filter-field"><span className="sr-only">Filter category</span><select aria-label="Filter category" value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPageNumber(1); }}><option value="">All categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="filter-field"><span className="sr-only">Filter transaction type</span><select aria-label="Filter transaction type" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPageNumber(1); }}><option value="">All types</option><option value="EXPENSE">Expenses</option><option value="INCOME">Income</option></select></label>{(searchInput || categoryFilter || typeFilter) && <button className="text-button" onClick={() => { setSearchInput(''); setCategoryFilter(''); setTypeFilter(''); setPageNumber(1); }}>Clear filters</button>}</div>
        {!demo && transactionsQuery.isFetching ? <div className="table-loading" aria-busy="true">Loading transactions…</div> : txTotal ? <TransactionTable items={transactions} categories={categories} {...transactionActions} /> : <Empty title={search || categoryFilter || typeFilter ? 'No matching transactions' : 'A fresh start for your month'} text={search || categoryFilter || typeFilter ? 'Try a different search or clear your filters.' : 'Add an income or expense. Your records will appear here.'} action={<AddButton action={() => setTxDialog('new')} />} />}
        <div className="table-footer"><span>{txTotal ? `${(pageNumber - 1) * 10 + 1}–${Math.min(pageNumber * 10, txTotal)} of ${txTotal} transactions` : '0 transactions'}</span><div className="pagination"><button className="icon-button" aria-label="Previous page" disabled={pageNumber === 1} onClick={() => setPageNumber(p => p - 1)}><ChevronLeft size={18} /></button><span>Page {pageNumber} of {Math.max(1, Math.ceil(txTotal / 10))}</span><button className="icon-button" aria-label="Next page" disabled={pageNumber * 10 >= txTotal} onClick={() => setPageNumber(p => p + 1)}><ChevronRight size={18} /></button></div></div>
      </section>}
      {page === 'budgets' && <>{warnings.length > 0 && <div className="budget-warning"><Bell size={20} /><span>{warnings.length} budget{warnings.length > 1 ? 's are' : ' is'} at 80% or more. A good moment to review your plan.</span></div>}{budgets.length ? <div className="budgets-grid">{[...budgets].sort((a, b) => Number(!!a.category_id) - Number(!!b.category_id)).map(budgetCard)}<button className="add-budget-card" onClick={() => setBudgetDialog('new')}><span><Plus size={24} /></span><strong>Plan another category</strong><p>Make space for what matters.</p></button></div> : <div className="panel"><Empty title="Your plan starts with a limit" text="Set an overall budget, then add limits for individual categories." action={<AddButton action={() => setBudgetDialog('new')}>Set your first budget</AddButton>} /></div>}</>}
      {page === 'reports' && report && <><div className="report-summary"><div className="panel"><span>Total income</span><strong>{peso(report.income)}</strong></div><div className="panel"><span>Total expenses</span><strong>{peso(report.expense)}</strong></div><div className="panel"><span>Net balance</span><strong>{peso(report.balance)}</strong></div></div><div className="reports-charts"><section className="panel"><div className="section-heading"><div><h2>Six months in perspective</h2><p>Income and expenses, side by side</p></div><div className="chart-key"><span><i className="income-dot" />Income</span><span><i />Expenses</span></div></div><Suspense fallback={<div className="skeleton chart" />}><TrendChart report={report} /></Suspense></section><section className="panel"><div className="section-heading"><div><h2>Spending by category</h2><p>{monthLabel(month)}</p></div></div><Suspense fallback={<div className="skeleton chart" />}><CategoryChart categories={categories} breakdown={breakdown} /></Suspense></section></div><section className="panel comparison"><div><span className="comparison-icon"><TrendingUp size={24} /></span><h2>Compared with last month</h2><p>{cents(report.previous.expense) ? `Your spending is ${peso(Math.abs(expense - cents(report.previous.expense)))} ${expense >= cents(report.previous.expense) ? 'higher' : 'lower'} than last month.` : 'Add records for the previous month to see your comparison.'}</p></div><div className="comparison-values"><div><span>Last month</span><strong>{peso(report.previous.expense)}</strong></div><div><span>This month</span><strong>{peso(report.expense)}</strong></div></div></section></>}
      {page === 'settings' && <div className="settings-grid"><section className="panel settings-card"><ShieldCheck className="settings-icon" /><h2>{demo ? 'Your own space' : 'Account'}</h2>{demo ? <><p className="muted">Sign in or create an account to keep your transactions and budgets. Sample data is never copied into your account.</p><button className="button primary" onClick={() => setAuthOpen(true)}>Sign in / create account</button></> : <><dl><dt>Name</dt><dd>{profile?.name}</dd><dt>Email</dt><dd>{profile?.email}</dd><dt>Currency</dt><dd>Philippine peso (PHP)</dd></dl><button className="button" onClick={logout}><LogOut size={17} />Sign out</button><GoogleConnection /></>}</section><section className="panel settings-card"><Wallet className="settings-icon" /><h2>Preferences</h2><dl><dt>Currency</dt><dd>₱ · Philippine peso</dd><dt>Dates</dt><dd>Asia/Manila</dd><dt>Reports</dt><dd>Monthly CSV downloads</dd></dl><button className="button" onClick={() => navigate('reports')}><Download size={17} />View reports</button></section>{demo && <section className="panel settings-card"><Sparkles className="settings-icon" /><h2>Sample workspace</h2><p className="muted">Explore freely with fictional records. Changes last until you reload the page.</p><button className="button" onClick={() => { setSample(demoData(localDate().slice(0, 7))); setToast('Sample workspace reset.'); }}>Reset sample data</button></section>}</div>}
      </>}
      <footer className="workspace-footer"><span><span className="footer-mark">₱</span> A little more mindful, every day.</span><span>Made for life in pesos</span></footer>
    </main></div></div>
    {authOpen && <Auth close={() => setAuthOpen(false)} success={p => { setProfile(p); setSession(p); setDemo(false); queryClient.clear(); setGlobalError(''); navigate('dashboard'); setToast('Welcome to your workspace.'); }} />}
    {txDialog && <TransactionForm item={txDialog === 'new' ? undefined : txDialog} categories={categories} save={saveTransaction} close={() => setTxDialog(null)} />}
    {budgetDialog && <BudgetForm item={budgetDialog === 'new' ? undefined : budgetDialog} categories={categories} month={month} save={saveBudget} close={() => setBudgetDialog(null)} />}
    {deleteItem && <ConfirmDelete title={`Delete ${deleteItem.type}?`} text={deleteItem.type === 'transaction' ? 'This transaction will be removed from your records and monthly totals.' : 'This limit will be removed. Your transactions will stay in your records.'} remove={removeItem} close={() => setDeleteItem(null)} />}
    {notificationOpen && <Modal title="Budget check-in" close={() => setNotificationOpen(false)}>{warnings.length ? <div className="notification-list">{warnings.map(w => <div key={w.budget.id}><Bell size={20} /><div><strong>{w.name}</strong><p>{Math.round(w.percent)}% used · {w.percent >= 100 ? `${peso(w.spend - cents(w.budget.amount))} over your limit` : `${peso(cents(w.budget.amount) - w.spend)} remaining`}</p></div></div>)}<button className="button primary" onClick={() => { setNotificationOpen(false); navigate('budgets'); }}>Review budgets</button></div> : <Empty title="All clear" text="You’ll see a check-in here when a budget reaches 80%." />}</Modal>}
    {toast && <Toast message={toast} />}
  </ErrorBoundary>;
}
