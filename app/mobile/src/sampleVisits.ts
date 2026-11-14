import type { PlaceTag, Visit } from './visitMonitor';

// JS-only sample data. Never written to SQLite and never sent anywhere.
// Places are well-known public places in Seoul with coordinates near their real location.
// Only the visit times are made up. Dates use the device's local calendar.

/** Copy of the native preset list (ios/Team018Mobile/VisitStore.swift presetTagNames). */
export const PRESET_TAG_NAMES = [
  '집',
  '회사',
  '학교',
  '카페',
  '식당',
  '미용실',
  '병원',
  '약국',
  '헬스장',
  '마트',
  '편의점',
  '은행',
  '공원',
  '도서관',
  '교회',
  '친구 집',
  '부모님 댁',
  '주유소',
  '영화관',
  '백화점',
  '서점',
  '호텔',
  '공항',
  '기차역',
  '버스터미널',
];

/** Custom tags the sample user already made (shows custom-tag rename in the sheet). */
const SAMPLE_CUSTOM_TAGS = ['박물관', '관광', '쇼핑'];

export const SAMPLE_TAG_CATALOG: PlaceTag[] = [
  ...PRESET_TAG_NAMES.map((name, i) => ({ id: i + 1, name, isPreset: true })),
  ...SAMPLE_CUSTOM_TAGS.map((name, i) => ({
    id: PRESET_TAG_NAMES.length + i + 1,
    name,
    isPreset: false,
  })),
];

export type SamplePlace = {
  key: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
};

export const SAMPLE_PLACES: SamplePlace[] = [
  {
    key: 'seoul-station',
    name: '서울역',
    category: '교통',
    latitude: 37.5547,
    longitude: 126.9707,
  },
  {
    key: 'myeongdong-kyoja',
    name: '명동교자 본점',
    category: '식당',
    latitude: 37.5625,
    longitude: 126.9856,
  },
  {
    key: 'bluebottle-seongsu',
    name: '블루보틀 성수',
    category: '카페',
    latitude: 37.548,
    longitude: 127.0458,
  },
  {
    key: 'seoul-forest',
    name: '서울숲',
    category: '공원',
    latitude: 37.5444,
    longitude: 127.0374,
  },
  {
    key: 'coex-mall',
    name: '스타필드 코엑스몰',
    category: '쇼핑',
    latitude: 37.5116,
    longitude: 127.059,
  },
  {
    key: 'seoul-library',
    name: '서울도서관',
    category: '도서관',
    latitude: 37.5662,
    longitude: 126.9779,
  },
  {
    key: 'national-museum',
    name: '국립중앙박물관',
    category: '문화',
    latitude: 37.524,
    longitude: 126.9803,
  },
  {
    key: 'gyeongbokgung',
    name: '경복궁',
    category: '관광',
    latitude: 37.5796,
    longitude: 126.977,
  },
  {
    key: 'snuh',
    name: '서울대학교병원',
    category: '병원',
    latitude: 37.5796,
    longitude: 126.999,
  },
  {
    key: 'namsan-tower',
    name: '남산서울타워',
    category: '관광',
    latitude: 37.5512,
    longitude: 126.9882,
  },
];

const place = (key: string) => SAMPLE_PLACES.find(p => p.key === key)!;
const tagId = (name: string) =>
  SAMPLE_TAG_CATALOG.find(t => t.name === name)!.id;

/** Sample days: three consecutive local days. Day 3 is the "today" of the sample mode. */
const at = (day: 0 | 1 | 2, h: number, m: number) =>
  new Date(2030, 0, 13 + day, h, m).getTime();

type Seed = {
  id: number;
  place: string;
  accuracy: number;
  from: [0 | 1 | 2, number, number];
  to: [0 | 1 | 2, number, number] | null;
  tag: string | null;
};

const SEEDS: Seed[] = [
  {
    id: -1,
    place: 'seoul-station',
    accuracy: 60,
    from: [0, 8, 10],
    to: [0, 8, 45],
    tag: '기차역',
  },
  {
    id: -2,
    place: 'myeongdong-kyoja',
    accuracy: 35,
    from: [0, 12, 0],
    to: [0, 12, 50],
    tag: '식당',
  },
  {
    id: -3,
    place: 'seoul-library',
    accuracy: 40,
    from: [0, 13, 10],
    to: [0, 15, 30],
    tag: '도서관',
  },
  {
    id: -4,
    place: 'gyeongbokgung',
    accuracy: 80,
    from: [0, 16, 0],
    to: [0, 17, 40],
    tag: '관광',
  },
  {
    id: -5,
    place: 'snuh',
    accuracy: 45,
    from: [1, 9, 0],
    to: [1, 10, 20],
    tag: '병원',
  },
  {
    id: -6,
    place: 'national-museum',
    accuracy: 70,
    from: [1, 11, 0],
    to: [1, 13, 40],
    tag: '박물관',
  },
  {
    id: -7,
    place: 'bluebottle-seongsu',
    accuracy: 30,
    from: [1, 14, 20],
    to: [1, 15, 0],
    tag: '카페',
  },
  {
    id: -8,
    place: 'coex-mall',
    accuracy: 75,
    from: [1, 16, 0],
    to: [1, 19, 10],
    tag: '쇼핑',
  },
  {
    id: -9,
    place: 'bluebottle-seongsu',
    accuracy: 30,
    from: [2, 9, 30],
    to: [2, 10, 40],
    tag: '카페',
  },
  {
    id: -10,
    place: 'seoul-forest',
    accuracy: 65,
    from: [2, 10, 50],
    to: [2, 12, 30],
    tag: null,
  },
  {
    id: -11,
    place: 'myeongdong-kyoja',
    accuracy: 35,
    from: [2, 13, 0],
    to: [2, 13, 45],
    tag: '식당',
  },
  {
    id: -12,
    place: 'namsan-tower',
    accuracy: 50,
    from: [2, 14, 30],
    to: null,
    tag: '관광',
  },
];

/** "Now" in the sample mode: the last day, with the 남산서울타워 stay still in progress. */
export const SAMPLE_NOW = at(2, 16, 10);

/** Visits as first loaded (before in-memory tag edits). */
export const SAMPLE_VISITS: Visit[] = SEEDS.map(s => {
  const p = place(s.place);
  const arrivalAt = at(...s.from);
  const departureAt = s.to ? at(...s.to) : null;
  return {
    id: s.id,
    latitude: p.latitude,
    longitude: p.longitude,
    horizontalAccuracy: s.accuracy,
    arrivalAt,
    departureAt,
    // CLVisit callbacks arrive a while after the event; mimic ~12 minutes.
    receivedAt: (departureAt ?? arrivalAt) + 12 * 60000,
    tag: s.tag
      ? { id: tagId(s.tag), name: s.tag, source: 'manual', matchDistance: null }
      : null,
    placeName: p.name,
    placeCategory: p.category,
  };
});

/** Initially selected day in the sample mode: the day with the most places and a live stay. */
export const SAMPLE_INITIAL_DAY = at(2, 0, 0);

/**
 * An explicitly defined sample trip bundle for the 여행 filter. Real trip detection (leaving
 * the home area) does not exist yet, so live data never produces one.
 */
export const SAMPLE_TRIP = {
  name: '샘플 여행 · 서울 도심 한 바퀴',
  visitIds: [-1, -2, -3, -4, -5, -6],
};

/**
 * Seed rows for the live mode's "확인용 데이터 추가": exactly one visit per public place
 * (10 rows), reusing the sample fixture. Times are shifted so the sample "now" lands on
 * `now`, so the rows cover the last ~3 days and the 남산서울타워 stay is in progress.
 * Only preset tag names are passed; custom sample tags (박물관, 관광, 쇼핑) stay untagged so
 * seeding never creates user tags.
 */
export function seedRowsFor(now: number) {
  const shift = now - SAMPLE_NOW;
  const presets = new Set(PRESET_TAG_NAMES);
  const seen = new Set<string>();
  const rows = [];
  // Latest visit per place, so the in-progress 남산 and 서울숲 (untagged) are included.
  for (const s of [...SEEDS].reverse()) {
    if (seen.has(s.place)) {
      continue;
    }
    seen.add(s.place);
    const p = place(s.place);
    rows.push({
      key: `haru-seed-v1-${p.key}`,
      placeName: p.name,
      placeCategory: p.category,
      latitude: p.latitude,
      longitude: p.longitude,
      horizontalAccuracy: s.accuracy,
      arrivalAt: at(...s.from) + shift,
      departureAt: s.to ? at(...s.to) + shift : null,
      tagName: s.tag && presets.has(s.tag) ? s.tag : null,
    });
  }
  return [...rows.reverse(), ...olderSeedRows(now)];
}

type SeedRowOut = {
  key: string;
  placeName: string;
  placeCategory: string | null;
  latitude: number;
  longitude: number;
  horizontalAccuracy: number;
  arrivalAt: number;
  departureAt: number | null;
  tagName: string | null;
};

/** Total test seed rows: the 10 recent ones plus 90 older ones. */
export const SEED_TOTAL = 100;

const SEED_TAG: Record<string, string> = {
  교통: '기차역',
  식당: '식당',
  카페: '카페',
  공원: '공원',
  쇼핑: '백화점',
  도서관: '도서관',
  문화: '영화관',
  관광: '공원',
  병원: '병원',
};

// [start hour, start minute, base minutes]. The 4-slot day has a work-like long stay and an
// overnight stay that ends at 07:30 next morning, before that day's first slot.
const SLOTS_3: [number, number, number][] = [
  [8, 40, 50],
  [12, 30, 60],
  [18, 10, 140],
];
const SLOTS_4: [number, number, number][] = [
  [7, 50, 30],
  [9, 20, 480],
  [18, 0, 90],
  [22, 30, 540],
];

/**
 * 90 more seed rows for days 3–29 before today (the 10 recent rows cover days 0–2), 3 or 4
 * per day. Deterministic keys per (day offset, slot), so pressing again or relaunching never
 * duplicates, and existing installs with the first 10 only get the new rows added.
 * Mixes tags (presets only, plus 회사/집 for long and overnight stays), untagged rows,
 * open rows without a departure, varied accuracy and stay lengths.
 */
function olderSeedRows(now: number) {
  const today = new Date(now);
  const rows: SeedRowOut[] = [];
  for (let d = 3; d <= 29; d++) {
    const slots = (d - 3) % 3 === 1 ? SLOTS_4 : SLOTS_3;
    slots.forEach(([h, m, base], i) => {
      const p = SAMPLE_PLACES[(d * 4 + i * 3) % SAMPLE_PLACES.length];
      const start = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - d,
        h,
        m,
      ).getTime();
      const minutes = base + ((d * 7 + i * 5) % 40);
      const open = (d + i) % 13 === 0;
      const untagged = (d * 3 + i) % 9 === 0;
      const tag =
        base === 480 ? '회사' : h >= 22 ? '집' : SEED_TAG[p.category] ?? null;
      rows.push({
        key: `haru-seed-v2-d${d}-s${i}`,
        placeName:
          base === 480
            ? `${p.name} 인근 사무실`
            : h >= 22
            ? `${p.name} 근처 숙소`
            : p.name,
        placeCategory: base === 480 ? '회사' : h >= 22 ? '집' : p.category,
        latitude: p.latitude + (((d + i) % 5) - 2) * 0.0004,
        longitude: p.longitude + (((d * 2 + i) % 5) - 2) * 0.0004,
        horizontalAccuracy: 20 + ((d * 11 + i * 7) % 70),
        arrivalAt: start,
        departureAt: open ? null : start + minutes * 60000,
        tagName: untagged ? null : tag,
      });
    });
  }
  return rows;
}
