import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { kstToUnix, haversineM } from "@haru/schema";
import { DatabaseSync } from "@haru/engine/src/node-sqlite";
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const raw = new DatabaseSync(join(root, "artifacts/raw.db"), { readOnly: true });
const t0 = kstToUnix("2025-11-17", 8, 25);
const pts = raw.prepare("SELECT t,lat,lng,accuracy FROM points WHERE t>=? AND t<? AND accuracy<=100 ORDER BY t").all(t0, t0 + 3600 * 1.2) as any[];
const hm = (t:number)=>new Date((t+32400)*1000).toISOString().slice(11,19);
let prev:any=null;
for (const p of pts) { if (prev) { const d=haversineM(prev,p); if (p.t-prev.t>120||d<60) console.log(hm(prev.t),"->",hm(p.t),"gap",p.t-prev.t,"s dist",d.toFixed(0)); } prev=p; }
console.log("n",pts.length);
import { detectStays } from "@haru/engine";
console.log(detectStays(pts).map((s)=>({a:hm(s.start),b:hm(s.end),n:s.pointCount,lat:s.lat.toFixed(4),lng:s.lng.toFixed(4)})));
console.log(pts.slice(0,3).map((p)=>hm(p.t)), "...", pts.filter(p=>p.t>=t0+ 400).slice(0,0));
const idx = pts.findIndex((p)=>hm(p.t)==="09:01:41");
console.log(pts.slice(idx-4, idx+3).map((p)=>hm(p.t)+" "+p.lat.toFixed(4)+","+p.lng.toFixed(4)));
