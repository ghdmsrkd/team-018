import { haversineM, type LatLng } from "@haru/schema";
import type { GtStay, RawPoint } from "@haru/engine";
import { Rng, hashString } from "./rng";
import { travelMode } from "./schedule";

const M_PER_DEG_LAT = 110540;
const mPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

function jitter(p: LatLng, sigmaM: number, rng: Rng): LatLng {
  return { lat: p.lat + (rng.gauss() * sigmaM) / M_PER_DEG_LAT, lng: p.lng + (rng.gauss() * sigmaM) / mPerDegLng(p.lat) };
}

function offset(p: LatLng, distM: number, rng: Rng): LatLng {
  const a = rng.float() * 2 * Math.PI;
  return { lat: p.lat + (Math.sin(a) * distM) / M_PER_DEG_LAT, lng: p.lng + (Math.cos(a) * distM) / mPerDegLng(p.lat) };
}

/**
 * 두 장소 사이의 경로 (결정적). 직선에서 한쪽으로 휘게 해서 길처럼 보이게 한다.
 * 지도 재생용 정답 경로와 원시 점 생성이 같은 경로를 쓴다.
 */
export function routeBetween(a: LatLng, b: LatLng): LatLng[] {
  const dist = haversineM(a, b);
  const h = hashString(`${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}`);
  const bow = ((h % 1000) / 1000 - 0.5) * 0.18 * dist; // 최대 ±9%
  const dx = (b.lng - a.lng) * mPerDegLng(a.lat);
  const dy = (b.lat - a.lat) * M_PER_DEG_LAT;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts: LatLng[] = [];
  const N = 6;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const w = Math.sin(Math.PI * f); // 가운데가 가장 휜다
    pts.push({
      lat: a.lat + (b.lat - a.lat) * f + (ny * bow * w) / M_PER_DEG_LAT,
      lng: a.lng + (b.lng - a.lng) * f + (nx * bow * w) / mPerDegLng(a.lat),
    });
  }
  return pts;
}

function along(path: LatLng[], f: number): LatLng {
  const lens: number[] = [0];
  for (let i = 1; i < path.length; i++) lens.push((lens[i - 1] as number) + haversineM(path[i - 1] as LatLng, path[i] as LatLng));
  const total = lens[lens.length - 1] as number;
  const target = f * total;
  for (let i = 1; i < path.length; i++) {
    if (target <= (lens[i] as number)) {
      const seg = (lens[i] as number) - (lens[i - 1] as number) || 1;
      const g = (target - (lens[i - 1] as number)) / seg;
      const a = path[i - 1] as LatLng;
      const c = path[i] as LatLng;
      return { lat: a.lat + (c.lat - a.lat) * g, lng: a.lng + (c.lng - a.lng) * g };
    }
  }
  return path[path.length - 1] as LatLng;
}

/** 정답지 Stay → 노이즈가 섞인 원시 GPS 점. 지하철 구간 신호 끊김, 튀는 점, 정확도 필드를 포함한다. */
export function generatePoints(stays: GtStay[], seed = 1): RawPoint[] {
  const rng = new Rng(`points:${seed}`);
  const out: RawPoint[] = [];

  const push = (t: number, p: LatLng, accuracy: number, speed: number) => {
    let q = p;
    let acc = accuracy;
    const r = rng.float();
    if (r < 0.004) {
      q = offset(p, rng.between(150, 400), rng); // 크게 튄 점 (정확도 나쁨 → 필터에 걸림)
      acc = rng.between(100, 250);
    } else if (r < 0.005) {
      q = offset(p, rng.between(120, 200), rng); // 정확도는 멀쩡해 보이는 튄 점 (연속 이탈 규칙으로 걸러야 함)
      acc = rng.between(20, 40);
    }
    out.push({ t: Math.round(t), lat: q.lat, lng: q.lng, accuracy: Number(acc.toFixed(1)), speed: Number(speed.toFixed(2)) });
  };

  for (let i = 0; i < stays.length; i++) {
    const s = stays[i] as GtStay;
    const isHome = s.placeKey === "home";
    // 머무는 동안: 집은 드물게, 나머지는 2~5분 간격
    let t = s.start;
    for (;;) {
      push(t, jitter(s, 7, rng), rng.between(8, 30), rng.between(0, 0.3));
      const step = isHome ? rng.between(480, 720) : rng.between(120, 300);
      if (t + step >= s.end) break;
      t += step;
    }
    if (s.end > t) push(s.end, jitter(s, 7, rng), rng.between(8, 30), 0);

    // 다음 Stay 까지 이동
    const n = stays[i + 1];
    if (!n) continue;
    const dur = n.start - s.end;
    if (dur <= 60) continue;
    const dist = haversineM(s, n);
    if (dist < 30) continue;
    const mode = travelMode(dist);
    const route = routeBetween(s, n);
    const step = mode === "car" && dist > 30_000 ? 60 : rng.between(15, 30);
    const speed = dist / dur;
    for (let tt = s.end + step; tt < n.start - 5; tt += step * rng.between(0.8, 1.2)) {
      const f = (tt - s.end) / dur;
      // 지하철: 구간 가운데에서 신호가 끊긴다
      if (mode === "transit" && dist > 1500 && f > 0.2 && f < 0.8) continue;
      push(tt, jitter(along(route, f), 6, rng), rng.between(6, 25), speed * rng.between(0.8, 1.2));
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}
