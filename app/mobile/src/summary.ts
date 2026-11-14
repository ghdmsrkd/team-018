import { dayStarts, addDays, Range } from './calendar';
import { UNTAGGED } from './tagColors';
import type { Visit } from './visitMonitor';

/** An open row (no departure) counts as "here now" only if it started this recently. */
export const OPEN_STALE_MS = 24 * 3600 * 1000;
/** CLVisit arrival and departure callbacks for one stay report the same arrival. */
const SAME_ARRIVAL_MS = 2 * 60 * 1000;
const SAME_PLACE_M = 200;

export type StayStatus =
  | 'complete' // valid arrival and departure
  | 'ongoing' // latest open row, started within OPEN_STALE_MS: counted until now
  | 'openUnknown' // open row that is not the current stay: end unknown, not extended
  | 'arrivalUnknown' // departure only
  | 'invalid'; // departure before arrival, or arrival in the future

export type Stay = {
  /** Representative stored row (the completed row when duplicates were merged). */
  visit: Visit;
  start: number | null;
  /** Departure, or `now` for an ongoing stay. */
  end: number | null;
  status: StayStatus;
  tag: string;
};

export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** True when an open row is the arrival callback of the stay a completed row describes. */
function duplicates(open: Visit, done: Visit): boolean {
  if (
    open.arrivalAt == null ||
    done.arrivalAt == null ||
    done.departureAt == null
  ) {
    return false;
  }
  if (Math.abs(open.arrivalAt - done.arrivalAt) <= SAME_ARRIVAL_MS) {
    return true;
  }
  return (
    open.arrivalAt >= done.arrivalAt &&
    open.arrivalAt < done.departureAt &&
    distanceMeters(open, done) <= SAME_PLACE_M
  );
}

const startOf = (v: Visit) => v.arrivalAt ?? v.departureAt ?? v.receivedAt;

/**
 * Turns stored rows into stays: completed rows win over the open arrival rows of the same
 * stay, repeated open rows collapse to one, and only the latest recent open row is extended
 * to `now`. Older open rows keep an unknown end and add no time.
 */
export function normalizeVisits(visits: Visit[], now: number): Stay[] {
  const done = visits.filter(v => v.departureAt != null);
  const open = visits.filter(v => v.departureAt == null);
  const tagOverride = new Map<number, Visit['tag']>();
  const placeOverride = new Map<number, string>();
  const merged = new Map<number, number[]>();
  const mergeInto = (target: number, from: Visit) => {
    merged.set(target, [...(merged.get(target) ?? []), from.id, ...(merged.get(from.id) ?? [])]);
  };

  const keptOpen: Visit[] = [];
  for (const o of open) {
    const match = done.find(d => duplicates(o, d));
    if (match) {
      // Edits made while only the arrival row existed must survive the completed row.
      if (!match.tag && o.tag && !tagOverride.has(match.id)) {
        tagOverride.set(match.id, o.tag);
      }
      if (!match.googlePlaceId && o.googlePlaceId && !placeOverride.has(match.id)) {
        placeOverride.set(match.id, o.googlePlaceId);
      }
      mergeInto(match.id, o);
      continue;
    }
    const twin = keptOpen.findIndex(
      k =>
        k.arrivalAt != null &&
        o.arrivalAt != null &&
        Math.abs(k.arrivalAt - o.arrivalAt) <= SAME_ARRIVAL_MS,
    );
    if (twin >= 0) {
      const [keep, drop] =
        o.receivedAt > keptOpen[twin].receivedAt ? [o, keptOpen[twin]] : [keptOpen[twin], o];
      if (!keep.tag && drop.tag && !tagOverride.has(keep.id)) {
        tagOverride.set(keep.id, drop.tag);
      }
      if (!keep.googlePlaceId && drop.googlePlaceId && !placeOverride.has(keep.id)) {
        placeOverride.set(keep.id, drop.googlePlaceId);
      }
      mergeInto(keep.id, drop);
      keptOpen[twin] = keep;
      continue;
    }
    keptOpen.push(o);
  }

  const rows = [...done, ...keptOpen].sort(
    (a, b) => startOf(a) - startOf(b) || a.id - b.id,
  );
  const latestStart = rows.reduce((m, v) => Math.max(m, startOf(v)), -Infinity);

  return rows.map(v => {
    const tagged = v.tag ?? tagOverride.get(v.id) ?? null;
    const tag = tagged?.name ?? UNTAGGED;
    const place = v.googlePlaceId ?? placeOverride.get(v.id) ?? null;
    const ids = merged.get(v.id);
    const visit =
      tagged === v.tag && place === (v.googlePlaceId ?? null) && !ids
        ? v
        : { ...v, tag: tagged, googlePlaceId: place, mergedVisitIds: ids };
    const a = v.arrivalAt;
    const d = v.departureAt;
    if (d != null) {
      if (a == null) {
        return { visit, start: null, end: d, status: 'arrivalUnknown', tag };
      }
      if (d < a) {
        return { visit, start: a, end: d, status: 'invalid', tag };
      }
      return { visit, start: a, end: d, status: 'complete', tag };
    }
    if (a == null) {
      return { visit, start: null, end: null, status: 'openUnknown', tag };
    }
    if (a > now) {
      return { visit, start: a, end: null, status: 'invalid', tag };
    }
    const current = startOf(v) === latestStart && now - a <= OPEN_STALE_MS;
    return current
      ? { visit, start: a, end: now, status: 'ongoing', tag }
      : { visit, start: a, end: null, status: 'openUnknown', tag };
  });
}

export type Segment = { tag: string; start: number; end: number; stay: Stay };

/**
 * Time actually spent inside [range.from, min(range.to, now)], one segment per stay.
 * Stays crossing midnight or the range edge are cut at the edge. Overlapping stays are
 * trimmed so no minute is counted twice.
 */
export function segmentsIn(
  stays: Stay[],
  range: Range,
  now: number,
): Segment[] {
  const limit = Math.min(range.to, now);
  const out: Segment[] = [];
  let cursor = range.from;
  const timed = stays
    .filter(
      s =>
        (s.status === 'complete' || s.status === 'ongoing') &&
        s.start != null &&
        s.end != null,
    )
    .sort((a, b) => a.start! - b.start!);
  for (const stay of timed) {
    const start = Math.max(stay.start!, range.from, cursor);
    const end = Math.min(stay.end!, limit);
    if (end > start) {
      out.push({ tag: stay.tag, start, end, stay });
      cursor = end;
    }
  }
  return out;
}

export type TagTotal = { tag: string; ms: number };

export function totalsByTag(segments: Segment[]): TagTotal[] {
  const m = new Map<string, number>();
  for (const s of segments) {
    m.set(s.tag, (m.get(s.tag) ?? 0) + (s.end - s.start));
  }
  return [...m.entries()]
    .map(([tag, ms]) => ({ tag, ms }))
    .sort((a, b) => b.ms - a.ms || a.tag.localeCompare(b.tag));
}

/** Stays that belong to the range: their time overlaps it, or (no usable time) they start in it. */
export function staysIn(stays: Stay[], range: Range, now: number): Stay[] {
  const limit = Math.min(range.to, now);
  return stays.filter(s => {
    if (
      (s.status === 'complete' || s.status === 'ongoing') &&
      s.start != null &&
      s.end != null
    ) {
      return s.start < limit && s.end > range.from;
    }
    const t = s.start ?? s.end ?? s.visit.receivedAt;
    return t >= range.from && t < range.to;
  });
}

export type PeriodSummary = {
  segments: Segment[];
  totals: TagTotal[];
  trackedMs: number;
  stays: Stay[];
  visitCount: number;
  /** Earliest valid arrival inside the range. */
  firstArrival: number | null;
  /** The stay happening now, if `now` is inside the range. */
  current: Stay | null;
  /** Stays in the range without a usable duration. */
  unknownCount: number;
};

export function summarize(
  stays: Stay[],
  range: Range,
  now: number,
): PeriodSummary {
  const inRange = staysIn(stays, range, now);
  const segments = segmentsIn(inRange, range, now);
  const totals = totalsByTag(segments);
  const arrivals = inRange
    .filter(s => s.status !== 'invalid' && s.start != null)
    .map(s => s.start!)
    .filter(t => t >= range.from && t < range.to);
  const current =
    now >= range.from && now < range.to
      ? inRange.find(s => s.status === 'ongoing') ?? null
      : null;
  return {
    segments,
    totals,
    trackedMs: totals.reduce((a, t) => a + t.ms, 0),
    stays: inRange,
    visitCount: inRange.filter(s => s.status !== 'invalid').length,
    firstArrival: arrivals.length ? Math.min(...arrivals) : null,
    current,
    unknownCount: inRange.filter(
      s => s.status === 'openUnknown' || s.status === 'arrivalUnknown',
    ).length,
  };
}

/**
 * Percent change per tag versus the previous period. null when either side has less than
 * a minute, so a tag that simply did not exist before shows no arrow.
 */
export function deltas(
  cur: TagTotal[],
  prev: TagTotal[],
): Record<string, number | null> {
  const p = new Map(prev.map(t => [t.tag, t.ms]));
  const out: Record<string, number | null> = {};
  for (const t of cur) {
    const before = p.get(t.tag) ?? 0;
    out[t.tag] =
      before >= 60000 && t.ms >= 60000
        ? Math.round(((t.ms - before) / before) * 100)
        : null;
  }
  return out;
}

export type DayTotals = { dayStart: number; totals: TagTotal[] };

export function perDay(stays: Stay[], range: Range, now: number): DayTotals[] {
  return dayStarts(range.from, range.to).map(dayStart => ({
    dayStart,
    totals: totalsByTag(
      segmentsIn(stays, { from: dayStart, to: addDays(dayStart, 1) }, now),
    ),
  }));
}

export function formatHM(ms: number): string {
  const minutes = Math.round(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) {
    return `${m}m`;
  }
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
