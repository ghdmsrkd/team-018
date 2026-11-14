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
