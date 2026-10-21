import { cents } from './finance';
import type { Transaction } from '../src/types';
export function validAmount(value: string) { return /^\d{1,10}(\.\d{1,2})?$/.test(value) && cents(value) > 0 && cents(value) <= 999999999999; }
export function validateTransaction(value: Omit<Transaction, 'id'>) {
  if (!validAmount(value.amount)) return 'Enter an amount above zero with at most two decimal places.';
  if (!value.category_id) return 'Choose a category.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.transaction_date) || value.transaction_date < '2000-01-01' || value.transaction_date > '2100-12-31') return 'Choose a date between 2000 and 2100.';
  const day = new Date(value.transaction_date + 'T12:00:00Z');
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value.transaction_date) return 'Choose a valid date.';
  if (value.description.length > 200) return 'Keep your description within 200 characters.';
  return '';
}
