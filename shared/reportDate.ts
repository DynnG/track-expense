export function validReportDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= '2000-01-01' && day <= '2100-12-31'
    && !Number.isNaN(Date.parse(day)) && new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) === day;
}
export function shiftReportDay(day: string, offset: number) {
  const value = new Date(day + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
export const reportDayLabel = (day: string) => new Date(day + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
