import { haversineM, type LatLng } from "@haru/schema";
import { splitAtMidnight } from "./stays";
import type { MemoryData } from "./types";

/** 생성기가 내보내는 정답지. 엔진 출력과 비교해 감지 정확도를 낸다. */
export interface GtStay {
  placeKey: string;
  lat: number;
  lng: number;
  start: number;
  end: number;
}
export interface GtTrip {
  name: string;
  start: number;
  end: number;
  nights: number;
}
export interface GroundTruth {
  asOf: number;
  home: LatLng;
  work: LatLng;
  stays: GtStay[];
  trips: GtTrip[];
}

export interface EvalReport {
  gtStays: number;
  detectedStays: number;
  stayRecall: number;
  stayPrecision: number;
  medianStartErrorMin: number;
  medianEndErrorMin: number;
  gtTrips: number;
  detectedTrips: number;
  tripRecall: number;
  tripPrecision: number;
  tripNightsCorrect: number;
  homeCorrect: boolean;
  workCorrect: boolean;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[s.length >> 1] as number) : 0;
};
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function evaluate(gt: GroundTruth, got: MemoryData, minStayMinutes = 10, radiusM = 120): EvalReport {
  const placeById = new Map(got.places.map((p) => [p.id, p]));
  const det = got.stays.map((s) => {
    const p = placeById.get(s.place_id)!;
    return { s, lat: p.lat, lng: p.lng };
  });
  const gtStays = splitAtMidnight(gt.stays).filter((s) => s.end - s.start >= minStayMinutes * 60);

  const usedDet = new Set<number>();
  let matched = 0;
  const startErr: number[] = [];
  const endErr: number[] = [];
  for (const g of gtStays) {
    let best = -1;
    let bestOv = 0;
    det.forEach((d, i) => {
      if (haversineM(g, d) > radiusM) return;
      const ov = overlap(g.start, g.end, d.s.start_t, d.s.end_t);
      if (ov > bestOv) {
        bestOv = ov;
        best = i;
      }
    });
    if (best >= 0 && bestOv >= 0.5 * (g.end - g.start)) {
      matched++;
      usedDet.add(best);
      startErr.push(Math.abs(g.start - (det[best] as (typeof det)[number]).s.start_t) / 60);
      endErr.push(Math.abs(g.end - (det[best] as (typeof det)[number]).s.end_t) / 60);
    }
  }

  // 정밀도: 감지한 Stay 중 정답지와 겹치는 비율
  let precise = 0;
  det.forEach((d, i) => {
    if (usedDet.has(i)) return precise++;
    const ok = gtStays.some((g) => haversineM(g, d) <= radiusM && overlap(g.start, g.end, d.s.start_t, d.s.end_t) > 0);
    if (ok) precise++;
  });

  // Trip
  let tripMatched = 0;
  let nightsOk = 0;
  const usedTrips = new Set<number>();
  for (const g of gt.trips) {
    let best = -1;
    let bestOv = 0;
    got.trips.forEach((t, i) => {
      const ov = overlap(g.start, g.end, t.start_t, t.end_t);
      if (ov > bestOv) {
        bestOv = ov;
        best = i;
      }
    });
    if (best >= 0 && bestOv >= 0.5 * (g.end - g.start)) {
      tripMatched++;
      usedTrips.add(best);
      if ((got.trips[best] as (typeof got.trips)[number]).nights === g.nights) nightsOk++;
    }
  }

  const homePlace = got.places.find((p) => p.tag === "집");
  const workPlace = got.places.find((p) => p.tag === "회사");
  return {
    gtStays: gtStays.length,
    detectedStays: det.length,
    stayRecall: gtStays.length ? matched / gtStays.length : 0,
    stayPrecision: det.length ? precise / det.length : 0,
    medianStartErrorMin: Number(median(startErr).toFixed(1)),
    medianEndErrorMin: Number(median(endErr).toFixed(1)),
    gtTrips: gt.trips.length,
    detectedTrips: got.trips.length,
    tripRecall: gt.trips.length ? tripMatched / gt.trips.length : 0,
    tripPrecision: got.trips.length ? usedTrips.size / got.trips.length : 0,
    tripNightsCorrect: gt.trips.length ? nightsOk / gt.trips.length : 0,
    homeCorrect: !!homePlace && haversineM(homePlace, gt.home) <= radiusM,
    workCorrect: !!workPlace && haversineM(workPlace, gt.work) <= radiusM,
  };
}
