import {
  formatClock,
  formatDateHeader,
  formatDuration,
  groupByDay,
} from '../src/format';
import type { Visit } from '../src/visitMonitor';

const at = (h: number, m: number, day = 15) =>
  new Date(2030, 0, day, h, m).getTime();

const visit = (
  id: number,
  arrivalAt: number | null,
  receivedAt: number,
): Visit => ({
  id,
  latitude: 0,
  longitude: 0,
  horizontalAccuracy: 10,
  arrivalAt,
  departureAt: null,
  receivedAt,
});

test('clock and date header use local time', () => {
  expect(formatClock(at(8, 5))).toBe('08:05');
  expect(formatDateHeader(at(8, 5))).toBe('2030년 1월 15일 화요일');
});

test('duration only from valid arrival and departure', () => {
  expect(formatDuration(at(8, 10), at(9, 32))).toBe('1시간 22분');
  expect(formatDuration(at(8, 10), at(10, 10))).toBe('2시간');
  expect(formatDuration(at(8, 10), at(8, 48))).toBe('38분');
  expect(formatDuration(at(8, 10), at(8, 10))).toBe('1분 미만');
  expect(formatDuration(null, at(9, 0))).toBeNull();
  expect(formatDuration(at(9, 0), null)).toBeNull();
  expect(formatDuration(at(9, 0), at(8, 0))).toBeNull();
});

test('groups by day, newest day first, visits in time order', () => {
  const sections = groupByDay([
    visit(3, at(19, 30, 16), at(20, 0, 16)),
    visit(2, at(9, 40), at(10, 0)),
    visit(1, at(8, 10), at(8, 30)),
    visit(4, null, at(12, 0)), // unknown arrival falls back to received time
  ]);
  expect(sections.map(s => s.title)).toEqual([
    '2030년 1월 16일 수요일',
    '2030년 1월 15일 화요일',
  ]);
  expect(sections[1].data.map(v => v.id)).toEqual([1, 2, 4]);
});
