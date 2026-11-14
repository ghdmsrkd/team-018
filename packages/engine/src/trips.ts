import { daysBetween, haversineM, kstDay, type LatLng } from "@haru/schema";
import { DEFAULTS, type EngineOptions } from "./types";

export interface StayLite {
  id: string;
  start: number;
  end: number;
  lat: number;
  lng: number;
  sido: string | null;
  sigungu: string | null;
}

export interface TripCandidate {
  start: number; // 생활권을 떠난 시각(마지막 생활권 안 Stay 의 끝)
  end: number; // 생활권으로 돌아온 시각(다음 생활권 안 Stay 의 시작)
  stayIds: string[];
  regions: string[];
  nights: number;
  name: string;
}

const shortSido = (s: string) => s.replace(/(특별자치도|특별자치시|특별시|광역시|도)$/, "");

function tripName(stays: StayLite[], nights: number): string {
  const names: string[] = [];
  for (const s of stays) {
    let n: string | null = null;
    if (s.sido && /(특별시|광역시|특별자치시)$/.test(s.sido)) n = shortSido(s.sido);
    else if (s.sigungu) n = s.sigungu.replace(/(시|군)$/, "");
    else if (s.sido) n = shortSido(s.sido);
    if (n && !names.includes(n)) names.push(n);
  }
  const place = names.slice(0, 3).join("·") || "여행";
  return nights > 0 ? `${place} ${nights}박 ${nights + 1}일` : `${place} 당일치기`;
}

/** 집 기준 생활권(homeZoneM)을 벗어난 연속 구간을 Trip 으로 묶는다. stays 는 시간순. */
export function detectTrips(stays: StayLite[], home: LatLng | null, options: EngineOptions = {}): TripCandidate[] {
  const o = { ...DEFAULTS, ...options };
  if (!home) return [];
  const outside = stays.map((s) => haversineM(home, s) > o.homeZoneM);
  const trips: TripCandidate[] = [];

  let i = 0;
  while (i < stays.length) {
    if (!outside[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < stays.length && outside[j + 1]) j++;
    const group = stays.slice(i, j + 1);
    const first = group[0] as StayLite;
    const last = group[group.length - 1] as StayLite;
    if (last.end - first.start >= o.minTripMinutes * 60) {
      const before = i > 0 ? (stays[i - 1] as StayLite) : null;
      const after = j + 1 < stays.length ? (stays[j + 1] as StayLite) : null;
      const start = before ? before.end : first.start;
      const end = after ? after.start : last.end;
      const nights = Math.max(0, daysBetween(kstDay(start), kstDay(end)));
      const regions: string[] = [];
      for (const s of group) {
        for (const r of [s.sido, s.sigungu]) if (r && !regions.includes(r)) regions.push(r);
      }
      trips.push({
        start,
        end,
        stayIds: group.map((s) => s.id),
        regions,
        nights,
        name: tripName(group, nights),
      });
    }
    i = j + 1;
  }
  return trips;
}
