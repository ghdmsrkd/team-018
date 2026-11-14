/** 닫힌 태그 목록. 'AI 가 목록 밖 이름을 만들지 않는다'의 기준. */
export const TAGS = ["집", "회사", "밥집", "커피", "운동", "쇼핑", "관광"] as const;
export type Tag = (typeof TAGS)[number];
export type TagSource = "human" | "ai";
export type MoveMode = "walk" | "car" | "transit";

export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  poi_category: string | null;
  sido: string | null;
  sigungu: string | null;
  dong: string | null;
  tag: Tag | null;
  tag_source: TagSource | null;
  ai_confidence: number | null;
  ai_reason: string | null;
}

export interface Stay {
  id: string;
  place_id: string;
  start_t: number;
  end_t: number;
  day: string;
  trip_id: string | null;
}

export interface Move {
  id: string;
  from_stay: string;
  to_stay: string;
  start_t: number;
  end_t: number;
  mode: MoveMode | null;
  distance_m: number | null;
  /** JSON 문자열 [[lat,lng],...] */
  path: string | null;
}

export interface Trip {
  id: string;
  name: string;
  start_t: number;
  end_t: number;
  nights: number;
  regions: string;
  distance_m: number | null;
}

export interface Day {
  day: string;
  stay_count: number;
  distance_m: number;
  first_activity_t: number | null;
  photo_count: number;
  summary: string | null;
}

export interface Photo {
  id: string;
  taken_t: number;
  lat: number | null;
  lng: number | null;
  stay_id: string | null;
}
