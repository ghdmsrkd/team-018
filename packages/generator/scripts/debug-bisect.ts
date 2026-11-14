import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { kstToUnix } from "@haru/schema";
import { detectStays } from "@haru/engine";
import { DatabaseSync } from "@haru/engine/src/node-sqlite";
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const raw = new DatabaseSync(join(root, "artifacts/raw.db"), { readOnly: true });
const hm = (t:number)=>new Date((t+32400)*1000).toISOString().slice(11,16);
for (const [h,m] of [[0,0],[7,0],[8,0],[8,20],[8,24],[8,26],[8,28]] as const) {
  const t0 = kstToUnix("2025-11-17", h, m);
  const pts = raw.prepare("SELECT t,lat,lng,accuracy FROM points WHERE t>=? AND t<? ORDER BY t").all(t0, t0 + 3600*4) as any[];
  const st = detectStays(pts).map((s)=>hm(s.start)+"-"+hm(s.end)+"("+s.pointCount+")");
  console.log(`${h}:${m} start ->`, st.join(" "));
}
