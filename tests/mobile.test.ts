import { describe, expect, it } from 'vitest';
import { validateBaseUrl } from '../shared/apiConfig';
import { validAmount, validateTransaction } from '../shared/validation';
import { cents, decimal } from '../shared/finance';
describe('mobile shares financial rules and enforces safe API configuration', () => {
  it('keeps centavos exact and rejects invalid mobile amounts', () => {
    expect(decimal(cents('0.10') + cents('0.20'))).toBe('0.30');
    for (const value of ['0', '-1', '1.001', '1e3', '10000000000']) expect(validAmount(value)).toBe(false);
    expect(validAmount('9999999999.99')).toBe(true);
  });
  it('validates calendar dates and required category before saving', () => {
    const input = { type: 'EXPENSE' as const, amount: '1.00', description: '', category_id: 'food', transaction_date: '2026-10-21' };
    expect(validateTransaction(input)).toBe('');
    expect(validateTransaction({ ...input, transaction_date: '2026-02-30' })).not.toBe('');
    expect(validateTransaction({ ...input, category_id: '' })).not.toBe('');
    expect(validateTransaction({ ...input, transaction_date: '1999-12-31' })).not.toBe('');
  });
  it('requires HTTPS outside development and never accepts secrets inside URLs', () => {
    expect(validateBaseUrl('https://example.com/', false)).toBe('https://example.com');
    expect(validateBaseUrl('http://10.0.2.2:8000', true)).toBe('http://10.0.2.2:8000');
    for (const url of ['http://example.com', 'https://user:password@example.com', 'https://example.com?key=secret', 'https://example.com/api', 'file:///tmp']) expect(() => validateBaseUrl(url, false)).toThrow();
  });
});
