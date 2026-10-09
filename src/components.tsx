import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { AlertCircle, Check, ChevronLeft, ChevronRight, Coffee, GraduationCap, Heart, House, MoreHorizontal, Plus, ReceiptText, ShoppingBag, TrainFront, Trash2, Wallet, X } from 'lucide-react';
import type { Budget, Category, Kind, Transaction } from './types';
import { amountSchema, localDate, monthLabel, peso } from './money';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div className="panel empty"><AlertCircle /><h2>This section couldn’t load.</h2><p>Your records are still safe.</p><button className="button" onClick={() => this.setState({ error: false })}>Try again</button></div> : this.props.children; }
}
export function Modal({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={close} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } }} aria-label={title}>
    <div className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={20} /></button></div>{children}
  </dialog>;
}
export const categoryIcons: Record<string, typeof Coffee> = { 'Food & drinks': Coffee, 'Transport': TrainFront, 'Bills & utilities': House, 'Shopping': ShoppingBag, 'Education': GraduationCap, 'Health': Heart, 'Salary': Wallet, 'Allowance': Wallet };
export const categoryColors: Record<string, string> = { 'Food & drinks': '#4164ed', 'Transport': '#d18b2c', 'Bills & utilities': '#7a5dd0', 'Shopping': '#d65f85', 'Education': '#279b97', 'Health': '#5c9c67', 'Other': '#8791a7' };
export function CategoryIcon({ name }: { name: string }) { const Icon = categoryIcons[name] ?? ReceiptText; return <span className="category-icon" style={{ color: categoryColors[name] ?? '#315bea', background: `${categoryColors[name] ?? '#315bea'}12` }}><Icon size={20} /></span>; }
export function MonthPicker({ month, change }: { month: string; change: (month: string) => void }) {
  const shift = (amount: number) => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + amount, 1); const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; if (next >= '2000-01' && next <= '2100-12') change(next); };
  return <div className="month-picker"><button aria-label="Previous month" className="icon-button" onClick={() => shift(-1)}><ChevronLeft size={17} /></button><label><span className="sr-only">Selected month</span><input type="month" min="2000-01" max="2100-12" value={month} onChange={e => { if (/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(e.target.value)) change(e.target.value); }} aria-label="Selected month" /><span aria-hidden>{monthLabel(month)}</span></label><button aria-label="Next month" className="icon-button" onClick={() => shift(1)}><ChevronRight size={17} /></button></div>;
}
export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className="empty"><span className="empty-icon"><ReceiptText /></span><h3>{title}</h3><p>{text}</p>{action}</div>; }
export function TransactionForm({ item, categories, save, close }: { item?: Transaction; categories: Category[]; save: (value: Omit<Transaction, 'id'>, id?: string) => Promise<void>; close: () => void }) {
  const { register, handleSubmit, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm<Omit<Transaction, 'id'>>({ defaultValues: item ?? { type: 'EXPENSE', amount: '', description: '', transaction_date: localDate(), category_id: categories.find(c => c.type === 'EXPENSE')?.id ?? '' } });
  const kind = watch('type');
  const [failure, setFailure] = useState('');
  return <Modal title={item ? 'Edit transaction' : 'Add transaction'} close={close}><form onSubmit={handleSubmit(async value => {
    const parsed = amountSchema.safeParse(value.amount);
    if (!parsed.success) { setError('amount', { message: parsed.error.issues[0].message }); return; }
    setFailure(''); try { await save(value, item?.id); close(); } catch (e) { setFailure((e as Error).message); }
  })}>
    <div className="segmented" aria-label="Transaction type">{(['EXPENSE', 'INCOME'] as Kind[]).map(type => <button type="button" key={type} aria-pressed={kind === type} className={kind === type ? 'active' : ''} onClick={() => { setValue('type', type); setValue('category_id', categories.find(c => c.type === type)?.id ?? ''); }}>{type === 'EXPENSE' ? 'Expense' : 'Income'}</button>)}</div>
    <label className="field">Amount (₱)<input autoFocus inputMode="decimal" placeholder="0.00" className="amount-input" {...register('amount', { required: 'Enter an amount.' })} aria-invalid={!!errors.amount} />{errors.amount && <span className="field-error">{errors.amount.message}</span>}</label>
    <label className="field">Description<input placeholder="What was it for?" maxLength={200} {...register('description')} /></label>
    <div className="form-row"><label className="field">Category<select {...register('category_id', { required: true })}>{categories.filter(c => c.type === kind).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field">Date<input type="date" min="2000-01-01" max="2100-12-31" {...register('transaction_date', { required: true })} /></label></div>
    {failure && <div className="form-error" role="alert">{failure}</div>}
    <div className="modal-footer"><button type="button" className="button" onClick={close}>Cancel</button><button className="button primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : item ? 'Save changes' : 'Add transaction'}</button></div>
  </form></Modal>;
}
export function BudgetForm({ item, categories, month, save, close }: { item?: Budget; categories: Category[]; month: string; save: (value: Omit<Budget, 'id'>) => Promise<void>; close: () => void }) {
  const [category, setCategory] = useState(item?.category_id ?? ''); const [amount, setAmount] = useState(item?.amount ?? ''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <Modal title={item ? 'Edit budget' : 'Set a budget'} close={close}><p className="muted">Plan your spending for {monthLabel(month)}.</p><form onSubmit={async e => { e.preventDefault(); const result = amountSchema.safeParse(amount); if (!result.success) { setError(result.error.issues[0].message); return; } setBusy(true); setError(''); try { await save({ category_id: category, amount, month }); close(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
    <label className="field">Budget for<select value={category} onChange={e => setCategory(e.target.value)} disabled={!!item}><option value="">Overall monthly spending</option>{categories.filter(c => c.type === 'EXPENSE').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label className="field">Monthly limit (₱)<input autoFocus inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}<div className="modal-footer"><button type="button" className="button" onClick={close}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save budget'}</button></div>
  </form></Modal>;
}
export function ConfirmDelete({ title, text, remove, close }: { title: string; text: string; remove: () => Promise<void>; close: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <Modal title={title} close={close}><p>{text}</p><p className="muted">This cannot be undone.</p>{error && <p role="alert" className="form-error">{error}</p>}<div className="modal-footer"><button className="button" onClick={close}>Keep it</button><button className="button danger" disabled={busy} onClick={async () => { setBusy(true); try { await remove(); close(); } catch (e) { setError((e as Error).message); setBusy(false); } }}><Trash2 size={16} />{busy ? 'Deleting…' : 'Delete'}</button></div></Modal>;
}
export function TransactionTable({ items, categories, edit, remove, compact = false }: { items: Transaction[]; categories: Category[]; edit: (item: Transaction) => void; remove: (item: Transaction) => void; compact?: boolean }) {
  const [menu, setMenu] = useState('');
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setMenu(''); }; const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(''); }; document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape); return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); }; }, []);
  if (!items.length) return <Empty title="No transactions yet" text="Add your first income or expense to start tracking." />;
  return <div className="table-scroll" ref={root}><table className={compact ? 'transaction-table compact' : 'transaction-table'}><thead><tr><th>Transaction</th><th className="category-column">Category</th><th>Date</th><th className="align-right">Amount</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{items.map(t => {
    const name = categories.find(c => c.id === t.category_id)?.name ?? 'Other';
    return <tr key={t.id}><td><div className="transaction-name"><CategoryIcon name={name} /><div><strong>{t.description || name}</strong><span>{t.type === 'INCOME' ? 'Income' : 'Expense'}</span></div></div></td><td className="category-column"><span className="category-tag">{name}</span></td><td className="date-cell">{new Date(`${t.transaction_date}T12:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</td><td className={`align-right amount ${t.type === 'INCOME' ? 'positive' : ''}`}>{t.type === 'INCOME' ? '+' : '−'}{peso(t.amount)}</td><td className="action-cell"><button className="icon-button" aria-label={`Actions for ${t.description || name}`} aria-expanded={menu === t.id} onClick={() => setMenu(menu === t.id ? '' : t.id)}><MoreHorizontal size={20} /></button>{menu === t.id && <div className="action-menu"><button onClick={() => { setMenu(''); edit(t); }}>Edit transaction</button><button className="danger-text" onClick={() => { setMenu(''); remove(t); }}>Delete transaction</button></div>}</td></tr>;
  })}</tbody></table></div>;
}
export function Toast({ message }: { message: string }) { return <div className="toast" role="status"><Check size={18} />{message}</div>; }
export function AddButton({ action, children = 'Add transaction' }: { action: () => void; children?: ReactNode }) { return <button className="button primary" onClick={action}><Plus size={18} />{children}</button>; }
