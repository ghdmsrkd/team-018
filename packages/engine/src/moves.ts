import { haversineM, type LatLng, type MoveMode } from "@haru/schema";
import type { RawPoint } from "./types";

/** Douglas-Peucker 경로 단순화 (허용 오차 m) */
export function simplifyPath(path: LatLng[], toleranceM = 25): LatLng[] {
  if (path.length <= 2) return path;
  const keep = new Array<boolean>(path.length).fill(false);
  keep[0] = keep[path.length - 1] = true;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distToSegmentM(path[i] as LatLng, path[a] as LatLng, path[b] as LatLng);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > toleranceM) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  return path.filter((_, i) => keep[i]);
}

function distToSegmentM(p: LatLng, a: LatLng, b: LatLng): number {
  // 작은 구간이라 평면 근사로 충분하다
  const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
  const ky = 110540;
  const ax = a.lng * kx, ay = a.lat * ky, bx = b.lng * kx, by = b.lat * ky, px = p.lng * kx, py = p.lat * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export interface BuiltMove {
  startT: number;
  endT: number;
  mode: MoveMode | null;
  distanceM: number;
  path: LatLng[];
}

/**
 * 두 Stay 사이(fromEnd~toStart)의 점으로 이동 구간을 만든다.
 * 지하철처럼 중간에 신호가 끊기면 transit, 걷는 속도면 walk, 그 외 car.
 */
export function buildMove(
  points: RawPoint[],
  from: LatLng & { end: number },
  to: LatLng & { start: number },
): BuiltMove | null {
  const dur = to.start - from.end;
  const straight = haversineM(from, to);
  if (dur <= 0 || straight < 30) return null;

  const between = points.filter((p) => p.t > from.end && p.t < to.start && (p.accuracy == null || p.accuracy <= 100));
  const raw: LatLng[] = [from, ...between, to];
  const path = simplifyPath(raw, 25);

  let dist = 0;
  for (let i = 1; i < path.length; i++) dist += haversineM(path[i - 1] as LatLng, path[i] as LatLng);

  let maxGap = 0;
  const times = [from.end, ...between.map((p) => p.t), to.start];
  for (let i = 1; i < times.length; i++) maxGap = Math.max(maxGap, (times[i] as number) - (times[i - 1] as number));

  const avg = dist / dur;
  let mode: MoveMode;
  if (avg < 2.0 && maxGap < 600) mode = "walk";
  else if (maxGap >= 180 && dist > 1500) mode = "transit";
  else mode = "car";

  return { startT: from.end, endT: to.start, mode, distanceM: Math.round(dist), path };
}
