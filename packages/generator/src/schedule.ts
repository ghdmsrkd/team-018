import { addDays, haversineM, kstToUnix, kstWeekday, type MoveMode } from "@haru/schema";
import type { GroundTruth, GtStay, GtTrip } from "@haru/engine";
import { CATALOG_BY_KEY, LUNCH_POOL } from "./catalog";
import { Rng } from "./rng";

/** 데이터 기준 시각: 2026-11-14 16:20 (KST). 디자인의 "오늘" 화면과 맞춘다. */
export const AS_OF_DAY = "2026-11-14";
export const AS_OF_T = kstToUnix(AS_OF_DAY, 16, 20);
export const FIRST_DAY = "2025-11-15";

type Stop = [key: string, minutes: number];
interface TripPlan {
  start: string;
  days: Stop[][]; // 날짜별 방문. 마지막 날을 제외한 날은 마지막 항목이 숙소
  lodging?: string;
}

/** 여행 계획. 강원도 8회(2026), 부산 1박 2일, 가평 당일. */
const TRIPS: TripPlan[] = [
  { start: "2026-01-24", days: [[["gn_tofu", 70], ["gn_gyeongpo", 80], ["gn_anmok", 60], ["gn_hotel", 600]], [["gn_sijang", 80], ["gn_gyeongpo", 40]]] },
  { start: "2026-02-14", days: [[["cc_dakgalbi", 80], ["cc_skywalk", 60], ["cc_cafe", 60]]] },
  { start: "2026-03-21", days: [[["sc_hoe", 80], ["sc_beach", 70], ["sc_market", 70], ["sc_hotel", 600]], [["sc_seorak", 150], ["sc_market", 60]]] },
  { start: "2026-04-10", days: [[["bs_gukbap", 70], ["bs_gamcheon", 120], ["bs_jagalchi", 60], ["bs_hotel", 600]], [["bs_haeundae", 90], ["bs_gwangan", 70]]] },
  { start: "2026-05-05", days: [[["gn_tofu", 70], ["gn_anmok", 70], ["gn_gyeongpo", 50]]] },
  { start: "2026-06-06", days: [[["sc_beach", 80], ["sc_hoe", 80], ["sc_hotel", 600]], [["sc_market", 60], ["sc_beach", 50]]] },
  { start: "2026-07-25", days: [[["gn_tofu", 70], ["gn_anmok", 70], ["gn_hotel", 600]], [["gn_sijang", 60], ["sc_beach", 90], ["sc_hoe", 80], ["sc_hotel", 600]], [["sc_seorak", 120], ["sc_market", 50]]] },
  { start: "2026-08-15", days: [[["cc_dakgalbi", 80], ["cc_skywalk", 60], ["cc_cafe", 50]]] },
  { start: "2026-09-12", days: [[["gp_dakgalbi", 70], ["gp_nami", 120], ["gp_cafe", 60]]] },
  // 데모 질문 "저번에 강원도 갔던 게 며칠이었지?" 의 정답: 10월 3일~5일 2박 3일, 강릉 → 속초
  { start: "2026-10-03", days: [[["gn_tofu", 70], ["gn_anmok", 70], ["gn_gyeongpo", 60], ["gn_hotel", 600]], [["gn_sijang", 70], ["sc_beach", 90], ["sc_hoe", 80], ["sc_hotel", 600]], [["sc_seorak", 120], ["sc_market", 60]]] },
];

/** 이동 방식과 소요 시간 (생성기와 정답지가 같은 규칙을 쓴다) */
export function travelMode(distM: number): MoveMode {
  return distM < 1000 ? "walk" : distM < 30_000 ? "transit" : "car";
}
export function travelSeconds(distM: number): number {
  const mode = travelMode(distM);
  if (mode === "walk") return (distM * 1.25) / 1.3;
  if (mode === "transit") return 8 * 60 + (distM * 1.3) / 7.5;
  return 5 * 60 + (distM * 1.2) / 21;
}

class Builder {
  stays: GtStay[] = [];
  constructor() {}
  get last(): GtStay {
    return this.stays[this.stays.length - 1] as GtStay;
  }
  place(key: string) {
    const p = CATALOG_BY_KEY.get(key);
    if (!p) throw new Error(`unknown place ${key}`);
    return p;
  }
  begin(key: string, t: number) {
    const p = this.place(key);
    this.stays.push({ placeKey: key, lat: p.lat, lng: p.lng, start: t, end: t });
  }
  /** 마지막 Stay 가 집이면 출발 시각까지 늘린다 */
  departAt(t: number) {
    if (this.last.end < t) this.last.end = t;
  }
  visit(key: string, minutes: number, opts: { startAt?: number } = {}) {
    const p = this.place(key);
    const prev = this.last;
    const d = haversineM(prev, p);
    const start = opts.startAt ?? prev.end + Math.round(travelSeconds(d));
    this.stays.push({ placeKey: key, lat: p.lat, lng: p.lng, start, end: start + minutes * 60 });
  }
  /** 집으로 돌아와 머무르기 시작 (끝은 다음 출발 때 정해진다) */
  goHome() {
    this.visit("home", 0);
  }
}

/** 정답지용 여행 이름 (엔진의 이름 규칙과 같은 모양) */
function tripLabel(keys: string[], nights: number): string {
  const names: string[] = [];
  for (const k of keys) {
    const p = CATALOG_BY_KEY.get(k);
    if (!p || p.key === "home") continue;
    const n = /(특별시|광역시)$/.test(p.sido) ? p.sido.replace(/(특별시|광역시)$/, "") : p.sigungu.replace(/(시|군)$/, "");
    if (!names.includes(n)) names.push(n);
  }
  const place = names.slice(0, 3).join("·");
  return nights > 0 ? `${place} ${nights}박 ${nights + 1}일` : `${place} 당일치기`;
}

const isWeekend = (day: string) => [0, 6].includes(kstWeekday(kstToUnix(day, 12)));

export interface Schedule extends GroundTruth {
  seed: number;
}

export function generateSchedule(seed = 20261114): Schedule {
  const b = new Builder();
  b.begin("home", kstToUnix(FIRST_DAY, 0));
  const gtTrips: GtTrip[] = [];
  const tripByStart = new Map(TRIPS.map((t) => [t.start, t]));

  let day = FIRST_DAY;
  let gymThisWeek = 0;
  while (day <= AS_OF_DAY) {
    const rng = new Rng(`${seed}:${day}`);
    const wd = kstWeekday(kstToUnix(day, 12));
    const at = (h: number, m = 0) => kstToUnix(day, h, m) + Math.round(rng.between(-10, 10) * 60);
    if (wd === 1) gymThisWeek = 0;

    // 여행
    const trip = tripByStart.get(day);
    if (trip) {
      const departT = kstToUnix(day, 7, 30) + Math.round(rng.between(-15, 15) * 60);
      b.departAt(departT);
      const tripStayStart = b.stays.length;
      trip.days.forEach((stops, di) => {
        const d = addDays(day, di);
        const r2 = new Rng(`${seed}:${d}:trip`);
        stops.forEach(([key, min], si) => {
          const isLodging = si === stops.length - 1 && di < trip.days.length - 1;
          const nb = di > 0 && si === 0 ? kstToUnix(d, 9, 30) : 0;
          if (nb) b.stays[b.stays.length - 1]!.end = Math.max(b.last.end, nb);
          b.visit(key, isLodging ? min : min + Math.round(r2.between(-10, 10)));
        });
      });
      b.goHome();
      const lastDay = addDays(day, trip.days.length - 1);
      const nights = trip.days.length - 1;
      gtTrips.push({
        name: tripLabel(b.stays.slice(tripStayStart).map((s) => s.placeKey), nights),
        start: departT,
        end: b.last.start,
        nights,
      });
      day = addDays(lastDay, 1);
      continue;
    }

    if (day === AS_OF_DAY) {
      // 오늘: 디자인의 "오늘" 화면과 맞춘 하루
      b.departAt(kstToUnix(day, 10, 14));
      b.visit("cafe_home", 45, { startAt: kstToUnix(day, 10, 20) });
      b.visit("event", 0, { startAt: kstToUnix(day, 11, 40) });
      b.last.end = AS_OF_T;
      break;
    }

    if (day === "2025-12-25") {
      b.departAt(at(11, 0));
      b.visit("hongdae_shop", 120);
      b.visit("yeonnam_cafe", 70);
      b.visit("itaewon_food", 110);
      b.goHome();
    } else if (day === "2026-10-17") {
      b.departAt(at(11, 30));
      b.visit("lunch_pasta", 80); // 데모 질문 "성수동에서 갔던 그 파스타집 어디였지?"
      b.visit("cafe_work1", 60);
      b.visit("sungsu_shop", 50);
      b.goHome();
    } else if (!isWeekend(day)) {
      weekday(b, rng, day, at, wd, () => gymThisWeek++ < 2);
    } else {
      weekend(b, rng, at, wd);
    }
    day = addDays(day, 1);
  }

  // 마지막 Stay 는 현재 시각에서 끊는다
  if (b.last.end > AS_OF_T) b.last.end = AS_OF_T;
  // 길이 0 인 Stay(집에 돌아온 직후 다음 출발이 없는 경우)는 정답지에서 뺀다
  const stays = b.stays.filter((s) => s.end > s.start);
  return {
    seed,
    asOf: AS_OF_T,
    home: { lat: b.place("home").lat, lng: b.place("home").lng },
    work: { lat: b.place("work").lat, lng: b.place("work").lng },
    stays,
    trips: gtTrips,
  };
}

function weekday(b: Builder, rng: Rng, day: string, at: (h: number, m?: number) => number, wd: number, gymOk: () => boolean) {
  // 평일에 쉬는 날(연차) 가끔
  if (rng.chance(0.03)) {
    weekend(b, rng, at, 6);
    return;
  }
  b.departAt(at(8, 20));
  b.visit("work", 0);
  b.last.end = Math.max(b.last.start + 3 * 3600, at(12, 25));
  const month = Number(day.slice(5, 7));
  const cafeP = [6, 7, 8].includes(month) ? 0.75 : [11, 12, 1].includes(month) ? 0.3 : 0.5;
  b.visit(rng.pick(LUNCH_POOL), 50 + rng.int(-10, 10));
  if (rng.chance(cafeP)) b.visit(rng.pick(["cafe_work1", "cafe_work2"] as const), 25 + rng.int(-5, 10));
  b.visit("work", 0);
  b.last.end = Math.max(b.last.start + 2 * 3600, wd === 5 ? at(18, 0) : at(18, 30));
  if ((wd === 1 || wd === 4) && rng.chance(0.85) && gymOk()) {
    b.visit("gym", 75 + rng.int(-10, 10));
  } else if (rng.chance(0.2)) {
    b.visit(rng.pick(["dinner_work", "hapjeong_food"] as const), 80 + rng.int(-10, 20));
  }
  b.goHome();
}

function weekend(b: Builder, rng: Rng, at: (h: number, m?: number) => number, wd: number) {
  if (wd === 0 && rng.chance(0.4)) return; // 일요일은 집에서
  b.departAt(at(wd === 6 ? 10 : 11, 30));
  const spots = ["hongdae_shop", "yeonnam_cafe", "hapjeong_food", "the_hyundai", "coex", "seoul_forest", "bukchon", "sungsu_shop", "han_river", "cafe_home", "itaewon_food", "friend_home"] as const;
  const n = rng.int(2, 4);
  const used = new Set<string>();
  for (let i = 0; i < n; i++) {
    let k = rng.pick(spots);
    for (let g = 0; g < 5 && used.has(k); g++) k = rng.pick(spots);
    used.add(k);
    b.visit(k, 60 + rng.int(-15, 45));
  }
  b.goHome();
}
