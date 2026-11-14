import { addDays, haversineM, kstDay, kstToUnix } from "@haru/schema";
import { DEFAULTS, type EngineOptions, type RawPoint, type RawStay } from "./types";

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

const center = (pts: RawPoint[]) => ({
  lat: median(pts.map((p) => p.lat)),
  lng: median(pts.map((p) => p.lng)),
});

/**
 * 원시 점 → 머문 구간(Stay).
 * 반경 안에 minStayMinutes 이상 있으면 Stay. 튀는 점은 정확도 필터와 "연속 3점 이탈해야 떠난 것으로 본다"는 규칙으로 걸러낸다.
 */
export function detectStays(points: RawPoint[], options: EngineOptions = {}): RawStay[] {
  const o = { ...DEFAULTS, ...options };
  const pts = points
    .filter((p) => p.accuracy == null || p.accuracy <= o.maxAccuracyM)
    .sort((a, b) => a.t - b.t);

  const out: RawStay[] = [];
  let cl: RawPoint[] = [];
  let miss: RawPoint[] = [];

  const close = () => {
    // 마감 직전에 중심에서 너무 먼 점(튄 점, 신호 끊김 뒤 점)을 걷어내고 시간을 다시 잰다
    if (cl.length >= 2) {
      const c0 = center(cl);
      const valid = cl.filter((p) => haversineM(c0, p) <= o.stayRadiusM * 1.5);
      if (valid.length >= 2) {
        const first = valid[0] as RawPoint;
        const last = valid[valid.length - 1] as RawPoint;
        if (last.t - first.t >= o.minStayMinutes * 60) {
          const c = center(valid);
          out.push({ start: first.t, end: last.t, lat: c.lat, lng: c.lng, pointCount: valid.length });
        }
      }
    }
  };

  const step = (p: RawPoint) => {
    if (cl.length === 0) {
      cl = [p];
      return;
    }
    if (haversineM(center(cl), p) <= o.stayRadiusM) {
      cl.push(p); // 돌아왔으니 사이의 이탈 점(miss)은 튄 점으로 보고 버린다
      miss = [];
    } else {
      miss.push(p);
      if (miss.length >= 3) {
        close();
        // 이탈 점들로 새 묶음을 시작하되, 하나씩 다시 먹여서 서로 멀리 떨어진 점이 한 묶음이 되지 않게 한다
        const again = miss;
        cl = [];
        miss = [];
        for (const q of again) step(q);
      }
    }
  };

  for (const p of pts) step(p);
  close();
  return mergeStays(out, o);
}

/** 가까운 Stay 가 짧은 간격으로 이어지면 하나로 합친다 (튄 점으로 쪼개진 경우) */
export function mergeStays(stays: RawStay[], options: EngineOptions = {}): RawStay[] {
  const o = { ...DEFAULTS, ...options };
  const out: RawStay[] = [];
  for (const s of stays) {
    const prev = out[out.length - 1];
    if (
      prev &&
      s.start - prev.end <= 15 * 60 &&
      haversineM(prev, s) <= o.stayRadiusM * 1.5
    ) {
      const w1 = prev.pointCount;
      const w2 = s.pointCount;
      prev.lat = (prev.lat * w1 + s.lat * w2) / (w1 + w2);
      prev.lng = (prev.lng * w1 + s.lng * w2) / (w1 + w2);
      prev.end = s.end;
      prev.pointCount = w1 + w2;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

/**
 * 자정(KST)을 넘는 Stay 를 날짜별로 쪼갠다.
 * "오늘 00:00~09:50 집" 처럼 하루 타임라인과 태그별 하루 체류 시간(도넛 차트)이 날짜 경계에서 맞아야 해서다.
 */
export function splitAtMidnight<T extends { start: number; end: number }>(stays: T[]): T[] {
  const out: T[] = [];
  for (const s of stays) {
    let start = s.start;
    while (kstDay(start) !== kstDay(s.end) && kstToUnix(addDays(kstDay(start), 1), 0) < s.end) {
      const cut = kstToUnix(addDays(kstDay(start), 1), 0);
      out.push({ ...s, start, end: cut });
      start = cut;
    }
    out.push({ ...s, start, end: s.end });
  }
  return out;
}
