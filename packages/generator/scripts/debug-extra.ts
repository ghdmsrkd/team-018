// 엔진이 정답지에 없는 Stay 를 만든 경우를 찾아 출력한다 (정밀도 점검용)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { haversineM, kstDay } from "@haru/schema";
import { DatabaseSync } from "@haru/engine/src/node-sqlite";
import type { GroundTruth } from "@haru/engine";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const gt = JSON.parse(readFileSync(join(root, "artifacts/ground-truth.json"), "utf8")) as GroundTruth;
const db = new DatabaseSync(join(root, "artifacts/memory.db"), { readOnly: true });
const rows = db
  .prepare("SELECT s.id,s.start_t,s.end_t,p.name,p.lat,p.lng FROM stays s JOIN places p ON p.id=s.place_id ORDER BY s.start_t")
  .all() as unknown as Array<{ id: string; start_t: number; end_t: number; name: string; lat: number; lng: number }>;

let extra = 0;
const byName = new Map<string, number>();
const samples: string[] = [];
for (const r of rows) {
  const ok = gt.stays.some((g) => haversineM(g, r) <= 120 && Math.min(g.end, r.end_t) > Math.max(g.start, r.start_t));
  if (ok) continue;
  extra++;
  byName.set(r.name, (byName.get(r.name) ?? 0) + 1);
  if (samples.length < 12) samples.push(`${kstDay(r.start_t)} ${((r.end_t - r.start_t) / 60).toFixed(0)}분 ${r.name} (${r.lat.toFixed(4)},${r.lng.toFixed(4)})`);
}
console.log("정답지에 없는 Stay", extra, "/", rows.length);
console.log([...byName].sort((a, b) => b[1] - a[1]).slice(0, 8));
console.log(samples.join("\n"));
