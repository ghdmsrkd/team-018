import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { kstToUnix } from "@haru/schema";
import { detectStays } from "@haru/engine";
import { DatabaseSync } from "@haru/engine/src/node-sqlite";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const raw = new DatabaseSync(join(root, "artifacts/raw.db"), { readOnly: true });
const day = process.argv[2] ?? "2025-11-17";
const t0 = kstToUnix(day, 0);
const pts = raw.prepare("SELECT t,lat,lng,accuracy FROM points WHERE t>=? AND t<? ORDER BY t").all(t0, t0 + 86400) as any[];
const stays = detectStays(pts);
for (const s of stays) console.log(new Date((s.start + 32400) * 1000).toISOString().slice(11, 16), new Date((s.end + 32400) * 1000).toISOString().slice(11, 16), s.lat.toFixed(4), s.lng.toFixed(4), s.pointCount);
const odd = stays.find((s) => s.end - s.start < 40 * 60 && s.end - s.start > 20 * 60 && Math.abs(s.lng - 126.9013) > 0.01 && Math.abs(s.lng - 127.0557) > 0.01);
if (odd) {
  console.log("--- 이상한 Stay 주변 점");
  for (const p of pts.filter((p) => p.t >= odd.start - 300 && p.t <= odd.end + 300)) {
    console.log(new Date((p.t + 32400) * 1000).toISOString().slice(11, 19), p.lat.toFixed(5), p.lng.toFixed(5), p.accuracy);
  }
}
