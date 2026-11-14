import { clock } from './clock';
import { demoVisits } from './demoStore';
import { SAMPLE_INITIAL_DAY, SAMPLE_NOW } from './sampleVisits';
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

// Demo "now" is fixed on the last sample day, with one stay still in progress. Nothing here
// touches native code, the database or the network.
const DEMO_NOW = SAMPLE_NOW;

export const demoSource: DataSource = {
  kind: 'demo',
  now: () => DEMO_NOW,
  visitsInRange: async (from, to) =>
    demoVisits().filter(v => {
      const start = v.arrivalAt ?? v.departureAt ?? v.receivedAt;
      return (
        start < to &&
        (v.departureAt == null ? start >= from : v.departureAt > from)
      );
    }),
  initialDay: () => SAMPLE_INITIAL_DAY,
};
