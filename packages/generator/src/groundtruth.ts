import { haversineM, kstDay, type Day, type Move, type Place, type Stay, type Trip } from "@haru/schema";
import { splitAtMidnight, type GeoInfo, type Geocoder, type GroundTruth, type MemoryData } from "@haru/engine";
import { CATALOG, CATALOG_BY_KEY } from "./catalog";
import { routeBetween } from "./points";
import { travelMode } from "./schedule";

/** 더미 데이터용 지오코더: 카탈로그에서 가장 가까운 장소(150m 이내)를 돌려준다. 실사용은 Lambda /geocode 어댑터를 쓴다. */
export const catalogGeocoder: Geocoder = async (lat, lng) => {
  let best: { d: number; info: GeoInfo } | null = null;
  for (const p of CATALOG) {
    const d = haversineM({ lat, lng }, p);
    if (d <= 150 && (!best || d < best.d)) {
      best = { d, info: { name: p.name, poi_category: p.category, sido: p.sido, sigungu: p.sigungu, dong: p.dong } };
    }
  }
  return best?.info ?? { name: "알 수 없는 곳", poi_category: null, sido: null, sigungu: null, dong: null };
};

/**
 * 정답지에서 곧바로 memory.db 데이터를 만든다. 엔진을 거치지 않으므로 항상 "정답"이다.
 * 앱 개발자가 엔진 없이 화면을 만들 때 쓰는 시드 데이터의 기준이고, 엔진 출력과 비교하는 기준이기도 하다.
 */
export function memoryFromGroundTruth(input: GroundTruth): MemoryData {
  const gt = { ...input, stays: splitAtMidnight(input.stays) };
  const used = new Set(gt.stays.map((s) => s.placeKey));
  const humanKeys = new Set(["gym", "cafe_home"]); // 사람이 직접 단 태그 예시

  const places: Place[] = [...used].map((key) => {
    const c = CATALOG_BY_KEY.get(key)!;
    const human = humanKeys.has(key) && c.truthTag;
    const base: Place = {
      id: `p_${key}`,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      poi_category: c.category,
      sido: c.sido,
      sigungu: c.sigungu,
      dong: c.dong,
      tag: null,
      tag_source: null,
      ai_confidence: null,
      ai_reason: null,
    };
    if (human) return { ...base, tag: c.truthTag, tag_source: "human" };
    if (c.truthTag) {
      const conf = c.truthTag === "집" || c.truthTag === "회사" ? 0.96 : 0.78 + (key.length % 5) * 0.04;
      return { ...base, tag: c.truthTag, tag_source: "ai", ai_confidence: Number(conf.toFixed(2)), ai_reason: `장소 분류(${c.category})와 머문 시간대로 판단` };
    }
    return { ...base, ai_reason: `${c.category}는 태그 목록(집·회사·밥집·커피·운동·쇼핑·관광)에 맞지 않아 비워 둠` };
  });

  const trips: Trip[] = gt.trips.map((t) => ({
    id: `t_${t.start}`,
    name: t.name,
    start_t: t.start,
    end_t: t.end,
    nights: t.nights,
    regions: "",
    distance_m: null,
  }));

  const stays: Stay[] = gt.stays.map((s) => ({
    id: `s_${s.start}`,
    place_id: `p_${s.placeKey}`,
    start_t: s.start,
    end_t: s.end,
    day: kstDay(s.start),
    trip_id: trips.find((t) => s.start >= t.start_t && s.end <= t.end_t + 1)?.id ?? null,
  }));

  // 여행 지역: 여행 중 방문한 곳의 시/도, 시/군/구
  for (const t of trips) {
    const regions: string[] = [];
    for (const s of stays.filter((x) => x.trip_id === t.id)) {
      const p = places.find((q) => q.id === s.place_id)!;
      for (const r of [p.sido, p.sigungu]) if (r && !regions.includes(r)) regions.push(r);
    }
    t.regions = regions.join(",");
  }

  const moves: Move[] = [];
  for (let i = 1; i < stays.length; i++) {
    const a = gt.stays[i - 1]!;
    const b = gt.stays[i]!;
    const dist = haversineM(a, b);
    if (b.start - a.end <= 60 || dist < 30) continue;
    const path = routeBetween(a, b);
    let len = 0;
    for (let k = 1; k < path.length; k++) len += haversineM(path[k - 1]!, path[k]!);
    moves.push({
      id: `m_${a.end}`,
      from_stay: stays[i - 1]!.id,
      to_stay: stays[i]!.id,
      start_t: a.end,
      end_t: b.start,
      mode: travelMode(dist),
      distance_m: Math.round(len),
      path: JSON.stringify(path.map((p) => [Number(p.lat.toFixed(5)), Number(p.lng.toFixed(5))])),
    });
  }
  for (const t of trips) {
    t.distance_m = moves.filter((m) => m.start_t >= t.start_t && m.end_t <= t.end_t).reduce((a, m) => a + (m.distance_m ?? 0), 0);
  }

  const byDay = new Map<string, Stay[]>();
  for (const s of stays) (byDay.get(s.day) ?? byDay.set(s.day, []).get(s.day)!).push(s);
  const days: Day[] = [...byDay].map(([day, list]) => {
    const dm = moves.filter((m) => kstDay(m.start_t) === day);
    const dist = dm.reduce((a, m) => a + (m.distance_m ?? 0), 0);
    return {
      day,
      stay_count: list.length,
      distance_m: dist,
      first_activity_t: dm.length ? Math.min(...dm.map((m) => m.start_t)) : null,
      photo_count: 0,
      summary: `${new Set(list.map((s) => s.place_id)).size}곳에 머물렀고 ${(dist / 1000).toFixed(1)}km 이동했어요.`,
    };
  });
  days.sort((a, b) => a.day.localeCompare(b.day));

  return { places, stays, moves, trips, days, photos: [] };
}
