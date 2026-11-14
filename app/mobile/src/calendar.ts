// Local-calendar helpers. Every boundary is built with the local Date constructor, so days
// are 23 or 25 hours long across DST changes and months/years have their real lengths.

export type Period = 'day' | 'week' | 'month' | 'year';

export type Range = { from: number; to: number };

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function addDays(dayStart: number, n: number): number {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

/** Monday-based week, calendar month, calendar year, or the single day containing `anchor`. */
export function periodRange(period: Period, anchor: number): Range {
  const d = new Date(anchor);
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (period) {
    case 'day': {
      const from = startOfDay(anchor);
      return { from, to: addDays(from, 1) };
    }
    case 'week': {
      const from = addDays(startOfDay(anchor), -((d.getDay() + 6) % 7));
      return { from, to: addDays(from, 7) };
    }
    case 'month':
      return {
        from: new Date(y, m, 1).getTime(),
        to: new Date(y, m + 1, 1).getTime(),
      };
    case 'year':
      return {
        from: new Date(y, 0, 1).getTime(),
        to: new Date(y + 1, 0, 1).getTime(),
      };
  }
}

/** The period of the same kind immediately before the one starting at `from`. */
export function previousRange(period: Period, from: number): Range {
  const d = new Date(from);
  switch (period) {
    case 'day':
      return periodRange('day', addDays(from, -1));
    case 'week':
      return periodRange('week', addDays(from, -7));
    case 'month':
      return periodRange(
        'month',
        new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(),
      );
    case 'year':
      return periodRange('year', new Date(d.getFullYear() - 1, 0, 1).getTime());
  }
}

/** Local day starts in [from, to). */
export function dayStarts(from: number, to: number): number[] {
  const out: number[] = [];
  for (let t = startOfDay(from); t < to; t = addDays(t, 1)) {
    out.push(t);
  }
  return out;
}

export const weekdayShort = (ms: number) => WEEKDAYS[new Date(ms).getDay()];

const md = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${d.getDate()}`;
};

/** Big title for the selected period, e.g. "11.14", "11.8 – 11.14", "2026년 11월", "2026년". */
export function periodTitle(period: Period, range: Range): string {
  const d = new Date(range.from);
  switch (period) {
    case 'day':
      return md(range.from);
    case 'week':
      return `${md(range.from)} – ${md(addDays(range.to, -1))}`;
    case 'month':
      return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    case 'year':
      return `${d.getFullYear()}년`;
  }
}

/** Small label above the title: year and weekday for a day, year otherwise. */
export function periodEyebrow(period: Period, range: Range): string {
  const y = new Date(range.from).getFullYear();
  return period === 'day' ? `${y} · ${weekdayShort(range.from)}요일` : `${y}`;
}

/** Minutes since local midnight on the wall clock, 0 ≤ x < 1440. */
export function clockMinutes(ms: number): number {
  const d = new Date(ms);
  return (
    d.getHours() * 60 +
    d.getMinutes() +
    d.getSeconds() / 60 +
    d.getMilliseconds() / 60000
  );
}
