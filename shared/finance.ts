export function cents(value: string): number {
  const [whole, decimal = ''] = value.replace(/^-/, '').split('.');
  return (value.startsWith('-') ? -1 : 1) * (Number(whole) * 100 + Number(decimal.padEnd(2, '0').slice(0, 2)));
}
export function decimal(value: number): string {
  return `${value < 0 ? '-' : ''}${Math.trunc(Math.abs(value) / 100)}.${String(Math.abs(value % 100)).padStart(2, '0')}`;
}
export const peso = (value: string | number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(typeof value === 'string' ? cents(value) / 100 : value / 100);
export const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const monthLabel = (month: string) => new Date(`${month}-01T12:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
export function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(year, number - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
