import { prisma } from '../../config/prisma';

export interface HolidayEntry {
  date: string; // YYYY-MM-DD
  name: string;
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Working days = days in month − weekly offs − holidays that fall on a
 * working weekday (a holiday on a weekly off is not counted twice).
 */
export function computeWorkingDays(year: number, month: number, weeklyOffDays: number[], holidays: HolidayEntry[]) {
  const total = daysInMonth(year, month);
  const offs = new Set(weeklyOffDays);
  const holidayDates = new Set(
    holidays
      .map((h) => h.date)
      .filter((d) => {
        const dt = new Date(`${d}T00:00:00Z`);
        return dt.getUTCFullYear() === year && dt.getUTCMonth() + 1 === month;
      }),
  );
  let working = 0;
  for (let day = 1; day <= total; day++) {
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (offs.has(dt.getUTCDay())) continue;
    if (holidayDates.has(dt.toISOString().slice(0, 10))) continue;
    working++;
  }
  return working;
}

/**
 * The set of working DAY NUMBERS (1-31) of a month, honouring the Calendar
 * Master's weekly offs and holidays. Defaults to every day when unconfigured.
 */
export async function getWorkingDayNumbers(year: number, month: number): Promise<number[]> {
  const cal = await prisma.calendarMonth.findUnique({ where: { year_month: { year, month } } });
  const total = daysInMonth(year, month);
  if (!cal) return Array.from({ length: total }, (_, i) => i + 1);
  const offs = new Set(cal.weeklyOffDays);
  const holidayDates = new Set(((cal.holidays as unknown as HolidayEntry[]) ?? []).map((h) => h.date));
  const out: number[] = [];
  for (let day = 1; day <= total; day++) {
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (offs.has(dt.getUTCDay())) continue;
    if (holidayDates.has(dt.toISOString().slice(0, 10))) continue;
    out.push(day);
  }
  return out;
}

/** Working days for a month; defaults to every day when no calendar row exists. */
export async function getWorkingDays(year: number, month: number): Promise<number> {
  const cal = await prisma.calendarMonth.findUnique({ where: { year_month: { year, month } } });
  return cal ? cal.workingDays : daysInMonth(year, month);
}

/** Working days for all 12 months of a year (for trend charts). */
export async function getWorkingDaysByMonth(year: number): Promise<Map<number, number>> {
  const cals = await prisma.calendarMonth.findMany({ where: { year } });
  const map = new Map<number, number>();
  for (let m = 1; m <= 12; m++) map.set(m, daysInMonth(year, m));
  for (const c of cals) map.set(c.month, c.workingDays);
  return map;
}
