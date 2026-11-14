import type { MemoryData } from "./types";

export interface InsertStatement {
  sql: string;
  params: Array<string | number | null>;
}

/**
 * MemoryData → INSERT 문 목록. DB 드라이버(expo-sqlite, node:sqlite)에 상관없이 쓸 수 있다.
 * 순서는 외래 키를 지키는 순서다 (places, trips, stays, moves, days, photos).
 */
export function memoryInserts(d: MemoryData): InsertStatement[] {
  const out: InsertStatement[] = [];
  for (const p of d.places) {
    out.push({
      sql: "INSERT OR REPLACE INTO places (id,name,lat,lng,poi_category,sido,sigungu,dong,tag,tag_source,ai_confidence,ai_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      params: [p.id, p.name, p.lat, p.lng, p.poi_category, p.sido, p.sigungu, p.dong, p.tag, p.tag_source, p.ai_confidence, p.ai_reason],
    });
  }
  for (const t of d.trips) {
    out.push({
      sql: "INSERT OR REPLACE INTO trips (id,name,start_t,end_t,nights,regions,distance_m) VALUES (?,?,?,?,?,?,?)",
      params: [t.id, t.name, t.start_t, t.end_t, t.nights, t.regions, t.distance_m],
    });
  }
  for (const s of d.stays) {
    out.push({
      sql: "INSERT OR REPLACE INTO stays (id,place_id,start_t,end_t,day,trip_id) VALUES (?,?,?,?,?,?)",
      params: [s.id, s.place_id, s.start_t, s.end_t, s.day, s.trip_id],
    });
  }
  for (const m of d.moves) {
    out.push({
      sql: "INSERT OR REPLACE INTO moves (id,from_stay,to_stay,start_t,end_t,mode,distance_m,path) VALUES (?,?,?,?,?,?,?,?)",
      params: [m.id, m.from_stay, m.to_stay, m.start_t, m.end_t, m.mode, m.distance_m, m.path],
    });
  }
  for (const y of d.days) {
    out.push({
      sql: "INSERT OR REPLACE INTO days (day,stay_count,distance_m,first_activity_t,photo_count,summary) VALUES (?,?,?,?,?,?)",
      params: [y.day, y.stay_count, y.distance_m, y.first_activity_t, y.photo_count, y.summary],
    });
  }
  for (const f of d.photos) {
    out.push({
      sql: "INSERT OR REPLACE INTO photos (id,taken_t,lat,lng,stay_id) VALUES (?,?,?,?,?)",
      params: [f.id, f.taken_t, f.lat, f.lng, f.stay_id],
    });
  }
  return out;
}
