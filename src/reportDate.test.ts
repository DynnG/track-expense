import { describe, expect, it } from 'vitest';
import { shiftReportDay, validReportDay } from './reportDate';

describe('daily report calendar navigation', () => {
  it('crosses month and year boundaries and includes leap days', () => {
    expect(shiftReportDay('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftReportDay('2024-03-01', -1)).toBe('2024-02-29');
    expect(shiftReportDay('2026-02-28', 1)).toBe('2026-03-01');
  });
  it('rejects impossible dates, partial input and out-of-range years', () => {
    for (const day of ['', '2026-02-29', '2026-04-31', '2026-13-01', '20261029', '1999-12-31', '2101-01-01']) expect(validReportDay(day)).toBe(false);
    for (const day of ['2000-01-01', '2024-02-29', '2026-10-29', '2100-12-31']) expect(validReportDay(day)).toBe(true);
  });
});
