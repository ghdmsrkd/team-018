// Node 전용(테스트, 생성기, CLI). 앱 번들에서 import 하지 않는다.
// Node 22 에서는 `--experimental-sqlite` 가 필요하다 (22.13 부터 불필요).
import { DatabaseSync } from "node:sqlite";
import { AGENT_VIEWS_DDL, MEMORY_DDL, RAW_DDL } from "@haru/schema";
import { memoryInserts } from "./store";
import type { MemoryData, RawPoint } from "./types";

export { DatabaseSync };

export function openMemoryDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(MEMORY_DDL);
  db.exec(AGENT_VIEWS_DDL);
  return db;
}

export function openRawDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(RAW_DDL);
  return db;
}

export function writeMemory(db: DatabaseSync, data: MemoryData, meta: Record<string, string> = {}): void {
  db.exec("BEGIN");
  try {
    for (const { sql, params } of memoryInserts(data)) db.prepare(sql).run(...params);
    for (const [k, v] of Object.entries(meta)) {
      db.prepare("INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)").run(k, v);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function writePoints(db: DatabaseSync, points: RawPoint[], source: "live" | "dummy" = "dummy"): void {
  const stmt = db.prepare("INSERT INTO points (t,lat,lng,accuracy,speed,source) VALUES (?,?,?,?,?,?)");
  db.exec("BEGIN");
  try {
    for (const p of points) stmt.run(p.t, p.lat, p.lng, p.accuracy ?? null, p.speed ?? null, source);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function readPoints(db: DatabaseSync): RawPoint[] {
  return db.prepare("SELECT t,lat,lng,accuracy,speed FROM points ORDER BY t").all() as unknown as RawPoint[];
}
