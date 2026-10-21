import { z } from 'zod';
import { cents } from '../shared/finance';

export const amountSchema = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Use up to two decimal places.').refine(v => cents(v) > 0 && cents(v) <= 999999999999, 'Enter an amount above zero, up to ₱9,999,999,999.99.');
export { cents, decimal, peso, localDate, monthLabel, shiftMonth } from '../shared/finance';
