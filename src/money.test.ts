import { describe, expect, it } from 'vitest';
import { amountSchema, cents, decimal } from './money';
describe('peso arithmetic and input', () => {
  it('keeps centavo sums exact', () => { expect(cents('0.10') + cents('0.20')).toBe(30); expect(decimal(-30)).toBe('-0.30'); expect(cents('-0.30')).toBe(-30); });
  it('rejects negative, zero, excess precision and exponential notation', () => { for (const value of ['-1', '0', '1.001', '1e3', 'NaN', '10000000000']) expect(amountSchema.safeParse(value).success).toBe(false); });
});
