/** 좌표·시간 공용 함수. 앱(React Native)과 Node에서 같이 쓴다. 의존성 없음. */

export const KST_OFFSET_S = 9 * 3600;

export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** 두 좌표 사이 거리(m) */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** unix 초 → 한국 날짜 'YYYY-MM-DD' */
export function kstDay(t: number): string {
  return new Date((t + KST_OFFSET_S) * 1000).toISOString().slice(0, 10);
}

/** unix 초 → 한국 시(0~23.99) */
export function kstHour(t: number): number {
  const d = new Date((t + KST_OFFSET_S) * 1000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

/** 한국 시간 0=일 ... 6=토 */
export function kstWeekday(t: number): number {
  return new Date((t + KST_OFFSET_S) * 1000).getUTCDay();
}

/** 한국 시간 기준 날짜·시각 → unix 초 */
export function kstToUnix(day: string, hour = 0, minute = 0): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, d, hour, minute) / 1000) - KST_OFFSET_S;
}

/** 'YYYY-MM-DD' 에 일수를 더한다 */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number) as [number, number, number];
  const [yb, mb, db] = b.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}
