import type { Visit } from './visitMonitor';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Local 24-hour clock, e.g. "08:10". */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Local date header, e.g. "2030년 1월 15일 화요일". */
export function formatDateHeader(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${
    WEEKDAYS[d.getDay()]
  }요일`;
}

/** Local short date and time, e.g. "1월 15일 20:42". */
export function formatShortDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${formatClock(ms)}`;
}

/**
 * Time spent, derived only from a valid arrival and departure reported by iOS.
 * Returns null when either is missing (Core Location sentinel) or out of order.
 */
export function formatDuration(
  arrivalAt: number | null,
  departureAt: number | null,
): string | null {
  if (arrivalAt == null || departureAt == null || departureAt < arrivalAt) {
    return null;
  }
  const minutes = Math.round((departureAt - arrivalAt) / 60000);
  if (minutes < 1) {
    return '1분 미만';
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) {
    return `${m}분`;
  }
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** The time a visit belongs to on the timeline: arrival if known, otherwise when received. */
export const visitTime = (v: Visit) => v.arrivalAt ?? v.receivedAt;

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export type DaySection = { key: string; title: string; data: Visit[] };

/** Groups visits by local day: newest day first, visits within a day in time order. */
export function groupByDay(visits: Visit[]): DaySection[] {
  const byDay = new Map<string, Visit[]>();
  for (const v of visits) {
    const key = dayKey(visitTime(v));
    const list = byDay.get(key);
    if (list) {
      list.push(v);
    } else {
      byDay.set(key, [v]);
    }
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, data]) => {
      const sorted = [...data].sort(
        (a, b) => visitTime(a) - visitTime(b) || a.id - b.id,
      );
      return {
        key,
        title: formatDateHeader(visitTime(sorted[0])),
        data: sorted,
      };
    });
}
