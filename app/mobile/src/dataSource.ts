import { clock } from './clock';
import { SAMPLE_VISITS } from './sampleVisits';
import { OPEN_STALE_MS } from './summary';
import { Visit, visitMonitor } from './visitMonitor';

/** Upper bound for "everything": the largest JS date (ms). */
export const ALL_TIME_END = 8.64e15;

export type DataSource = {
  kind: 'live' | 'demo';
  now(): number;
  /** Every visit that can overlap [from, to); no row limit. */
  visitsInRange(from: number, to: number): Promise<Visit[]>;
  /** Initially selected day. */
  initialDay(): number;
};

export const liveSource: DataSource = {
  kind: 'live',
  now: () => clock.now(),
  visitsInRange: (from, to) =>
    visitMonitor.getVisitsInRange(from, to, clock.now() - OPEN_STALE_MS),
  initialDay: () => clock.now(),
};

// Demo "now" is the last sample callback, so the sample day reads like a finished day with
// one stay still open. Nothing here touches native code or the database.
const DEMO_NOW = Math.max(...SAMPLE_VISITS.map(v => v.receivedAt));

export const demoSource: DataSource = {
  kind: 'demo',
  now: () => DEMO_NOW,
  visitsInRange: async (from, to) =>
    SAMPLE_VISITS.filter(v => {
      const start = v.arrivalAt ?? v.departureAt ?? v.receivedAt;
      return (
        start < to &&
        (v.departureAt == null ? start >= from : v.departureAt > from)
      );
    }),
  initialDay: () => SAMPLE_VISITS[0].arrivalAt ?? DEMO_NOW,
};
