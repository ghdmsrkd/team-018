import { KST_OFFSET_S, addDays, haversineM, kstDay, type LatLng } from "@haru/schema";
import { DEFAULTS, type EngineOptions, type RawStay } from "./types";

export interface PlaceCluster extends LatLng {
  id: string;
  stayIdx: number[];
  minutes: number;
}

export const placeIdFor = (c: LatLng) => `p_${c.lat.toFixed(4)}_${c.lng.toFixed(4)}`;

/** Stay 중심들을 반경 안에서 묶어 장소(Place) 후보로 만든다. 두 번 돌려서 처음 묶음의 쏠림을 보정한다. */
export function clusterPlaces(stays: RawStay[], options: EngineOptions = {}): PlaceCluster[] {
  const o = { ...DEFAULTS, ...options };
  let clusters: { lat: number; lng: number; w: number; idx: number[] }[] = [];

  const assign = (centers: LatLng[] | null) => {
    const next: { lat: number; lng: number; w: number; idx: number[] }[] = centers
      ? centers.map((c) => ({ ...c, w: 0, idx: [] }))
      : [];
    stays.forEach((s, i) => {
      let best = -1;
      let bestD = o.placeRadiusM;
      next.forEach((c, k) => {
        const d = haversineM(c, s);
        if (d <= bestD) {
          bestD = d;
          best = k;
        }
      });
      const w = s.end - s.start;
      if (best < 0) {
        next.push({ lat: s.lat, lng: s.lng, w, idx: [i] });
      } else {
        const c = next[best] as (typeof next)[number];
        if (!centers) {
          c.lat = (c.lat * c.w + s.lat * w) / (c.w + w);
          c.lng = (c.lng * c.w + s.lng * w) / (c.w + w);
        }
        c.w += w;
        c.idx.push(i);
      }
    });
    return next.filter((c) => c.idx.length > 0);
  };

  clusters = assign(null);
  // 두 번째 패스: 최종 중심으로 다시 배정하고 중심을 가중 평균으로 갱신한다
  clusters = assign(clusters.map((c) => ({ lat: c.lat, lng: c.lng })));
  return clusters.map((c) => {
    const lat = c.idx.reduce((a, i) => a + (stays[i] as RawStay).lat, 0) / c.idx.length;
    const lng = c.idx.reduce((a, i) => a + (stays[i] as RawStay).lng, 0) / c.idx.length;
    const center = { lat, lng };
    return { ...center, id: placeIdFor(center), stayIdx: c.idx, minutes: Math.round(c.w / 60) };
  });
}

/** [start,end) 구간 중 한국 시간 h0~h1 사이에 겹치는 분 (평일만 보려면 weekdaysOnly) */
export function overlapMinutes(
  startT: number,
  endT: number,
  h0: number,
  h1: number,
  weekdaysOnly = false,
): number {
  let total = 0;
  let day = kstDay(startT);
  const lastDay = kstDay(endT);
  for (let guard = 0; guard < 400; guard++) {
    const base = Date.parse(`${day}T00:00:00Z`) / 1000 - KST_OFFSET_S;
    const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (!weekdaysOnly || (wd >= 1 && wd <= 5)) {
      const a = Math.max(startT, base + h0 * 3600);
      const b = Math.min(endT, base + h1 * 3600);
      if (b > a) total += (b - a) / 60;
    }
    if (day >= lastDay) break;
    day = addDays(day, 1);
  }
  return total;
}

export interface HomeWork {
  home: number | null; // 클러스터 인덱스
  work: number | null;
}

/** 집 = 새벽(00~06시) 최빈 장소, 회사 = 평일 낮(10~17시) 최빈 장소 (집 제외) */
export function inferHomeWork(clusters: PlaceCluster[], stays: RawStay[]): HomeWork {
  const night = clusters.map((c) =>
    c.stayIdx.reduce((a, i) => a + overlapMinutes((stays[i] as RawStay).start, (stays[i] as RawStay).end, 0, 6), 0),
  );
  let home: number | null = null;
  let best = 0;
  night.forEach((m, i) => {
    if (m > best) {
      best = m;
      home = i;
    }
  });
  if (best < 180) home = null; // 새벽 3시간 분량도 못 모았으면 확정하지 않는다

  let work: number | null = null;
  let bestW = 0;
  clusters.forEach((c, i) => {
    if (i === home) return;
    const m = c.stayIdx.reduce(
      (a, k) => a + overlapMinutes((stays[k] as RawStay).start, (stays[k] as RawStay).end, 10, 17, true),
      0,
    );
    if (m > bestW) {
      bestW = m;
      work = i;
    }
  });
  if (bestW < 600) work = null; // 평일 낮 10시간 미만이면 회사로 보지 않는다
  return { home, work };
}
