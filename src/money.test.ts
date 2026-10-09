import { describe, expect, it } from 'vitest';
import { amountSchema, cents, decimal } from './money';
import { computeReport } from './demo';
describe('peso arithmetic and input', () => {
  it('keeps centavo sums exact', () => { expect(cents('0.10') + cents('0.20')).toBe(30); expect(decimal(-30)).toBe('-0.30'); expect(cents('-0.30')).toBe(-30); });
  it('rejects negative, zero, excess precision and exponential notation', () => { for (const value of ['-1', '0', '1.001', '1e3', 'NaN', '10000000000']) expect(amountSchema.safeParse(value).success).toBe(false); });
  it('calculates report totals from the selected month only', () => {
    const report = computeReport([
      { id: 'a', category_id: 'food', amount: '0.10', type: 'EXPENSE', description: '', transaction_date: '2026-10-01' },
      { id: 'b', category_id: 'food', amount: '0.20', type: 'EXPENSE', description: '', transaction_date: '2026-10-31' },
      { id: 'c', category_id: 'salary', amount: '1.00', type: 'INCOME', description: '', transaction_date: '2026-10-01' },
      { id: 'd', category_id: 'food', amount: '99.00', type: 'EXPENSE', description: '', transaction_date: '2026-11-01' },
    ], '2026-10'); expect(report.expense).toBe('0.30'); expect(report.balance).toBe('0.70'); expect(report.count).toBe(3);
  });
});
