import {
  kstDay,
  kstHour,
  kstWeekday,
  type Day,
  type Move,
  type Place,
  type Stay,
  type Trip,
} from "@haru/schema";
import { buildMove } from "./moves";
import { clusterPlaces, inferHomeWork, placeIdFor } from "./places";
import { detectStays, splitAtMidnight } from "./stays";
import { ruleClassifier, type Classifier, type PlaceFeatures } from "./tagger";
import { detectTrips } from "./trips";
import { DEFAULTS, type EngineOptions, type Geocoder, type MemoryData, type RawPoint } from "./types";

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[s.length >> 1] as number) : 0;
};

const timeBand = (h: number): PlaceFeatures["typical_time"] =>
  h < 5 ? "밤" : h < 11 ? "아침" : h < 14 ? "점심" : h < 18 ? "오후" : h < 22 ? "저녁" : "밤";

/** t0 < t < t1 인 점들 (정렬된 배열에서 이진 탐색) */
function sliceByTime(sorted: RawPoint[], t0: number, t1: number): RawPoint[] {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((sorted[mid] as RawPoint).t <= t0) lo = mid + 1;
    else hi = mid;
  }
  const out: RawPoint[] = [];
  for (let i = lo; i < sorted.length && (sorted[i] as RawPoint).t < t1; i++) out.push(sorted[i] as RawPoint);
  return out;
}

export interface BuildOptions extends EngineOptions {
  geocode: Geocoder;
  /** 장소 태그 분류기. 기본은 규칙 분류기(LLM 없음). */
  classify?: Classifier;
  /** 이 장소 id 는 사람이 정한 태그라 AI 가 건드리지 않는다 */
  humanTags?: Map<string, Place["tag"]>;
}

/**
 * 원시 점 → memory.db 에 들어갈 전체 데이터.
 * Stay 감지 → 장소 묶기 → 지오코딩 → 집/회사 추론 → 태그 → Trip → 이동 → 하루 요약.
 */
export async function buildMemory(points: RawPoint[], options: BuildOptions): Promise<MemoryData> {
  const o = { ...DEFAULTS, ...options };
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const rawStays = splitAtMidnight(detectStays(sorted, o));
  const clusters = clusterPlaces(rawStays, o);
  const clusterOfStay = new Map<number, number>();
  clusters.forEach((c, k) => c.stayIdx.forEach((i) => clusterOfStay.set(i, k)));

  // 지오코딩 (장소당 1회)
  const geo = new Array(clusters.length);
  for (let i = 0; i < clusters.length; i += 5) {
    await Promise.all(
      clusters.slice(i, i + 5).map(async (c, j) => {
        geo[i + j] = await o.geocode(c.lat, c.lng);
      }),
    );
  }

  const { home, work } = inferHomeWork(clusters, rawStays);

  // 태그 후보 특징
  const features: PlaceFeatures[] = [];
  clusters.forEach((c, k) => {
    if (k === home || k === work) return;
    const g = geo[k];
    const mins = c.stayIdx.map((i) => (rawStays[i]!.end - rawStays[i]!.start) / 60);
    const hours = c.stayIdx.map((i) => kstHour(rawStays[i]!.start));
    const weekend = c.stayIdx.filter((i) => [0, 6].includes(kstWeekday(rawStays[i]!.start))).length;
    features.push({
      id: c.id,
      name: g.name,
      poi_category: g.poi_category ?? null,
      visits: c.stayIdx.length,
      median_minutes: Math.round(median(mins)),
      typical_time: timeBand(median(hours)),
      weekend_ratio: Number((weekend / c.stayIdx.length).toFixed(2)),
    });
  });
  const classify = o.classify ?? ruleClassifier;
  const results = await classify(features);

  const places: Place[] = clusters.map((c, k) => {
    const g = geo[k];
    const base: Place = {
      id: c.id,
      name: g.name,
      lat: c.lat,
      lng: c.lng,
      poi_category: g.poi_category ?? null,
      sido: g.sido ?? null,
      sigungu: g.sigungu ?? null,
      dong: g.dong ?? null,
      tag: null,
      tag_source: null,
      ai_confidence: null,
      ai_reason: null,
    };
    const human = o.humanTags?.get(c.id);
    if (human) return { ...base, tag: human, tag_source: "human" };
    if (k === home) {
      const nights = c.stayIdx.length;
      return { ...base, tag: "집", tag_source: "ai", ai_confidence: 0.97, ai_reason: `새벽(00~06시)에 가장 오래 머문 곳 (방문 ${nights}회)` };
    }
    if (k === work) {
      return { ...base, tag: "회사", tag_source: "ai", ai_confidence: 0.95, ai_reason: "평일 낮(10~17시)에 가장 오래 머문 곳" };
    }
    const r = results.get(c.id);
    if (r?.tag) return { ...base, tag: r.tag, tag_source: "ai", ai_confidence: Number(r.confidence.toFixed(2)), ai_reason: r.reason };
    return { ...base, ai_reason: r?.reason ?? "분류하지 않음" };
  });

  const stays: Stay[] = rawStays.map((s, i) => ({
    id: `s_${s.start}`,
    place_id: clusters[clusterOfStay.get(i) as number]!.id,
    start_t: s.start,
    end_t: s.end,
    day: kstDay(s.start),
    trip_id: null,
  }));

  // Trip
  const homeC = home != null ? clusters[home]! : null;
  const placeById = new Map(places.map((p) => [p.id, p]));
  const tripCands = detectTrips(
    stays.map((s) => {
      const p = placeById.get(s.place_id)!;
      return { id: s.id, start: s.start_t, end: s.end_t, lat: p.lat, lng: p.lng, sido: p.sido, sigungu: p.sigungu };
    }),
    homeC,
    o,
  );
  const stayById = new Map(stays.map((s) => [s.id, s]));
  const trips: Trip[] = tripCands.map((t) => {
    const id = `t_${t.start}`;
    t.stayIds.forEach((sid) => (stayById.get(sid)!.trip_id = id));
    return { id, name: t.name, start_t: t.start, end_t: t.end, nights: t.nights, regions: t.regions.join(","), distance_m: null };
  });

  // 이동
  const moves: Move[] = [];
  for (let i = 1; i < rawStays.length; i++) {
    const a = rawStays[i - 1]!;
    const b = rawStays[i]!;
    if (b.start - a.end > 8 * 3600) continue; // 사이 기록이 없는 구간
    const between = sliceByTime(sorted, a.end, b.start);
    const m = buildMove(between, { lat: a.lat, lng: a.lng, end: a.end }, { lat: b.lat, lng: b.lng, start: b.start });
    if (!m) continue;
    moves.push({
      id: `m_${a.end}`,
      from_stay: stays[i - 1]!.id,
      to_stay: stays[i]!.id,
      start_t: m.startT,
      end_t: m.endT,
      mode: m.mode,
      distance_m: m.distanceM,
      path: JSON.stringify(m.path.map((p) => [Number(p.lat.toFixed(5)), Number(p.lng.toFixed(5))])),
    });
  }
  // Trip 이동 거리
  for (const t of trips) {
    t.distance_m = moves.filter((m) => m.start_t >= t.start_t && m.end_t <= t.end_t).reduce((a, m) => a + (m.distance_m ?? 0), 0);
  }

  // 하루
  const days: Day[] = [];
  const byDay = new Map<string, Stay[]>();
  for (const s of stays) (byDay.get(s.day) ?? byDay.set(s.day, []).get(s.day)!).push(s);
  for (const [day, list] of byDay) {
    const dm = moves.filter((m) => kstDay(m.start_t) === day);
    const dist = dm.reduce((a, m) => a + (m.distance_m ?? 0), 0);
    const placesToday = new Set(list.map((s) => s.place_id)).size;
    days.push({
      day,
      stay_count: list.length,
      distance_m: dist,
      first_activity_t: dm.length ? Math.min(...dm.map((m) => m.start_t)) : null,
      photo_count: 0,
      summary: `${placesToday}곳에 머물렀고 ${(dist / 1000).toFixed(1)}km 이동했어요.`,
    });
  }
  days.sort((a, b) => a.day.localeCompare(b.day));

  return { places, stays, moves, trips, days, photos: [] };
}

export { placeIdFor };
