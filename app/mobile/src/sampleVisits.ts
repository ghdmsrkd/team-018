import type { Visit } from './visitMonitor';

// JS-only demo rows. Never written to SQLite and never usable as tagged places.
// Coordinates and times are fictional. Negative ids cannot collide with SQLite row ids.
export const SAMPLE_VISITS: Visit[] = [
  {
    id: -1,
    latitude: 12.34567,
    longitude: -45.6789,
    horizontalAccuracy: 35,
    arrivalAt: Date.UTC(2030, 0, 15, 9, 0),
    departureAt: Date.UTC(2030, 0, 15, 11, 30),
    receivedAt: Date.UTC(2030, 0, 15, 11, 42),
  },
  {
    id: -2,
    latitude: -23.45678,
    longitude: 67.89012,
    horizontalAccuracy: 80,
    arrivalAt: Date.UTC(2030, 0, 15, 13, 15),
    departureAt: null,
    receivedAt: Date.UTC(2030, 0, 15, 13, 27),
  },
];
