import type { Day, Move, Photo, Place, Stay, Trip } from "@haru/schema";

export interface RawPoint {
  t: number;
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
}

/** 감지된 머문 구간 (장소 배정 전) */
export interface RawStay {
  start: number;
  end: number;
  lat: number;
  lng: number;
  pointCount: number;
}

/** 역지오코딩 결과. 더미 데이터는 생성기 카탈로그가, 실사용은 Lambda(/geocode, /places)가 채운다. */
export interface GeoInfo {
  name: string;
  poi_category?: string | null;
  sido?: string | null;
  sigungu?: string | null;
  dong?: string | null;
}

export type Geocoder = (lat: number, lng: number) => Promise<GeoInfo>;

export interface MemoryData {
  places: Place[];
  stays: Stay[];
  moves: Move[];
  trips: Trip[];
  days: Day[];
  photos: Photo[];
}

export interface EngineOptions {
  /** 같은 곳에 머문다고 보는 반경(m) */
  stayRadiusM?: number;
  /** 머문 곳으로 인정하는 최소 시간(분). README 미결 항목: 10 vs 15 */
  minStayMinutes?: number;
  /** 이 정확도(m)보다 나쁜 점은 버린다 */
  maxAccuracyM?: number;
  /** 같은 장소로 묶는 반경(m) */
  placeRadiusM?: number;
  /** 집에서 이 거리(m)를 넘으면 생활권 밖 */
  homeZoneM?: number;
  /** 여행으로 인정하는 생활권 밖 최소 체류(분) */
  minTripMinutes?: number;
}

export const DEFAULTS: Required<EngineOptions> = {
  stayRadiusM: 100,
  minStayMinutes: 10,
  maxAccuracyM: 100,
  placeRadiusM: 80,
  homeZoneM: 30_000,
  minTripMinutes: 180,
};
