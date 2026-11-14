/**
 * 더미 데이터 생성 CLI
 *   pnpm --filter @haru/generator generate            # artifacts/ 에 파일 생성
 *
 * 만드는 것
 *   artifacts/ground-truth.json      정답지 (Stay/Trip 일과표)
 *   artifacts/memory.groundtruth.db  정답지에서 곧바로 만든 memory.db (엔진 없이 쓰는 시드)
 *   artifacts/memory.db              원시 점 → 엔진 → memory.db (앱이 번들에 넣을 파일)
 *   artifacts/raw.db                 원시 GPS 점 (용량이 커서 git 에 올리지 않는다)
 *   artifacts/eval.json              엔진 정확도 (정답지와 비교)
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMemory, evaluate } from "@haru/engine";
import { openMemoryDb, openRawDb, readPoints, writeMemory, writePoints } from "@haru/engine/src/node-sqlite";
import { catalogGeocoder, generatePoints, generateSchedule, memoryFromGroundTruth } from "../src";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = join(root, "artifacts");
mkdirSync(out, { recursive: true });
const fresh = (p: string) => {
  for (const s of ["", "-wal", "-shm"]) if (existsSync(p + s)) rmSync(p + s);
  return p;
};

const t0 = Date.now();
const gt = generateSchedule();
writeFileSync(join(out, "ground-truth.json"), JSON.stringify(gt));
console.log(`일과표: Stay ${gt.stays.length}개, Trip ${gt.trips.length}개`);

// 1) 정답지에서 곧바로
const gtMem = memoryFromGroundTruth(gt);
{
  const db = openMemoryDb(fresh(join(out, "memory.groundtruth.db")));
  writeMemory(db, gtMem, { source: "ground-truth", as_of: String(gt.asOf), schema_version: "1" });
  db.close();
}

// 2) 원시 점 → 엔진
const points = generatePoints(gt.stays);
console.log(`원시 점: ${points.length}개`);
{
  const raw = openRawDb(fresh(join(out, "raw.db")));
  writePoints(raw, points, "dummy");
  raw.close();
}
const raw = openRawDb(join(out, "raw.db"));
const read = readPoints(raw);
raw.close();

const engineMem = await buildMemory(read, { geocode: catalogGeocoder });
{
  const db = openMemoryDb(fresh(join(out, "memory.db")));
  writeMemory(db, engineMem, { source: "engine", as_of: String(gt.asOf), schema_version: "1" });
  db.close();
}

const report = evaluate(gt, engineMem);
writeFileSync(join(out, "eval.json"), JSON.stringify(report, null, 2));
console.log("엔진 정확도", report);
console.log(`완료 ${((Date.now() - t0) / 1000).toFixed(1)}초`);
