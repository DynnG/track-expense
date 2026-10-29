import { lazy, Suspense } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { cents, localDate, peso } from './money';
import { reportDayLabel, shiftReportDay, validReportDay } from './reportDate';
import type { Category, DailyReport } from './types';

const DailyTrendChart = lazy(() => import('./Charts').then(m => ({ default: m.DailyTrendChart })));
const CategoryChart = lazy(() => import('./Charts').then(m => ({ default: m.CategoryChart })));

export function DayPicker({ day, change }: { day: string; change: (value: string) => void }) {
  return <div className="day-picker"><button className="icon-button" aria-label="Previous day" disabled={day <= '2000-01-01'} onClick={() => change(shiftReportDay(day, -1))}><ChevronLeft size={18} /></button><label><span className="sr-only">Report date</span><input type="date" aria-label="Report date" min="2000-01-01" max="2100-12-31" value={day} onChange={e => { if (validReportDay(e.target.value)) change(e.target.value); }} /></label><button className="icon-button" aria-label="Next day" disabled={day >= '2100-12-31'} onClick={() => change(shiftReportDay(day, 1))}><ChevronRight size={18} /></button>{day !== localDate() && <button className="text-button" onClick={() => change(localDate())}>Today</button>}</div>;
}

export default function DailyReports({ report, categories }: { report: DailyReport; categories: Category[] }) {
  const difference = cents(report.expense) - cents(report.previous.expense);
  return <><p className="daily-report-caption">{reportDayLabel(report.date)} · {report.count} transaction{report.count === 1 ? '' : 's'}{report.count === 0 ? ' · No transactions recorded on this day.' : ''}</p><div className="report-summary" aria-label="Daily summary"><div className="panel"><span>Day’s income</span><strong>{peso(report.income)}</strong></div><div className="panel"><span>Day’s expenses</span><strong>{peso(report.expense)}</strong></div><div className="panel"><span>Day’s net balance</span><strong>{peso(report.balance)}</strong></div></div><div className="reports-charts"><section className="panel"><div className="section-heading"><div><h2>Seven days at a glance</h2><p>Daily income and expenses up to {reportDayLabel(report.date)}</p></div><div className="chart-key"><span><i className="income-dot" />Income</span><span><i />Expenses</span></div></div><Suspense fallback={<div className="skeleton chart" />}><DailyTrendChart report={report} /></Suspense></section><section className="panel"><div className="section-heading"><div><h2>Spending by category</h2><p>{reportDayLabel(report.date)}</p></div></div><Suspense fallback={<div className="skeleton chart" />}><CategoryChart categories={categories} breakdown={report.breakdown} /></Suspense></section></div><section className="panel comparison"><div><span className="comparison-icon"><TrendingUp size={24} /></span><h2>Compared with the previous day</h2><p>{difference === 0 ? 'You spent the same amount on both days.' : `Your spending is ${peso(Math.abs(difference))} ${difference > 0 ? 'higher' : 'lower'} than the previous day.`}</p></div><div className="comparison-values"><div><span>{reportDayLabel(report.previous.date)}</span><strong>{peso(report.previous.expense)}</strong></div><div><span>{reportDayLabel(report.date)}</span><strong>{peso(report.expense)}</strong></div></div></section></>;
}
