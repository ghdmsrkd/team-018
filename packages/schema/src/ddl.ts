/**
 * 하루 SQLite 스키마 (계약 v0.1). 앱, 생성기, 엔진, 에이전트가 모두 이 문자열을 쓴다.
 *
 * 규칙
 * - 시각은 unix 초(UTC). `day`는 한국 시간(KST, +9h) 기준 'YYYY-MM-DD'.
 * - raw.db 는 에이전트가 열지 않는다. memory.db 의 v_* 뷰만 에이전트에 노출된다.
 * - 뷰에는 좌표(lat/lng)가 없다. 집/회사 장소는 이름이 '집'/'회사'로만 나오고 동 이름도 숨긴다.
 */

export const SCHEMA_VERSION = 1;

/** raw.db: 원시 위치. 에이전트 접근 금지. */
export const RAW_DDL = `
CREATE TABLE IF NOT EXISTS points (
  id        INTEGER PRIMARY KEY,
  t         INTEGER NOT NULL,
  lat       REAL NOT NULL,
  lng       REAL NOT NULL,
  accuracy  REAL,
  speed     REAL,
  source    TEXT NOT NULL DEFAULT 'live' CHECK (source IN ('live','dummy'))
);
CREATE INDEX IF NOT EXISTS idx_points_t ON points(t);

-- iOS CLVisit 원본 (docs/data/ios-visit-sample.json 과 같은 필드, 시각은 초 단위로 변환해 저장)
CREATE TABLE IF NOT EXISTS visits_raw (
  id          INTEGER PRIMARY KEY,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  accuracy    REAL,
  arrival_t   INTEGER NOT NULL,
  departure_t INTEGER,              -- NULL = 아직 머무는 중
  received_t  INTEGER,
  source      TEXT NOT NULL DEFAULT 'live' CHECK (source IN ('live','dummy'))
);
CREATE INDEX IF NOT EXISTS idx_visits_raw_arrival ON visits_raw(arrival_t);
`;

/** memory.db: 의미화 결과. 앱 화면과 에이전트가 읽는다. */
export const MEMORY_DDL = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS places (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  poi_category  TEXT,
  sido          TEXT,
  sigungu       TEXT,
  dong          TEXT,
  tag           TEXT CHECK (tag IN ('집','회사','밥집','커피','운동','쇼핑','관광') OR tag IS NULL),
  tag_source    TEXT CHECK (tag_source IN ('human','ai') OR tag_source IS NULL),
  ai_confidence REAL CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  ai_reason     TEXT,
  -- 태그가 없으면 출처도 없다. AI 가 비워 둔 경우 이유는 ai_reason 에 남긴다.
  CHECK ((tag IS NULL) = (tag_source IS NULL))
);

CREATE TABLE IF NOT EXISTS trips (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  start_t     INTEGER NOT NULL,
  end_t       INTEGER NOT NULL,
  nights      INTEGER NOT NULL,
  regions     TEXT NOT NULL,        -- 방문 지역, 쉼표로 구분. 예: '강원도,강릉시,속초시'
  distance_m  INTEGER
);

CREATE TABLE IF NOT EXISTS stays (
  id        TEXT PRIMARY KEY,
  place_id  TEXT NOT NULL REFERENCES places(id),
  start_t   INTEGER NOT NULL,
  end_t     INTEGER NOT NULL,
  day       TEXT NOT NULL,          -- 도착한 날 (KST)
  trip_id   TEXT REFERENCES trips(id)
);
CREATE INDEX IF NOT EXISTS idx_stays_day ON stays(day);
CREATE INDEX IF NOT EXISTS idx_stays_place ON stays(place_id);
CREATE INDEX IF NOT EXISTS idx_stays_trip ON stays(trip_id);

CREATE TABLE IF NOT EXISTS moves (
  id          TEXT PRIMARY KEY,
  from_stay   TEXT NOT NULL REFERENCES stays(id),
  to_stay     TEXT NOT NULL REFERENCES stays(id),
  start_t     INTEGER NOT NULL,
  end_t       INTEGER NOT NULL,
  mode        TEXT CHECK (mode IN ('walk','car','transit') OR mode IS NULL),
  distance_m  INTEGER,
  path        TEXT                  -- 지도 재생용 경로. JSON [[lat,lng],...] (앱 전용, 뷰에 없음)
);
CREATE INDEX IF NOT EXISTS idx_moves_from ON moves(from_stay);

CREATE TABLE IF NOT EXISTS days (
  day              TEXT PRIMARY KEY,
  stay_count       INTEGER NOT NULL,
  distance_m       INTEGER NOT NULL,
  first_activity_t INTEGER,
  photo_count      INTEGER NOT NULL DEFAULT 0,
  summary          TEXT
);

CREATE TABLE IF NOT EXISTS photos (
  id       TEXT PRIMARY KEY,
  taken_t  INTEGER NOT NULL,
  lat      REAL,
  lng      REAL,
  stay_id  TEXT REFERENCES stays(id)
);
`;

/**
 * 에이전트용 읽기 전용 뷰. 에이전트는 이 이름들만 조회할 수 있다 (AGENT_VIEWS).
 * 시각은 KST 문자열로 내려준다 (모델이 시간대 변환을 하지 않게).
 */
export const AGENT_VIEWS_DDL = `
DROP VIEW IF EXISTS v_places;
CREATE VIEW v_places AS
SELECT
  id,
  CASE WHEN tag IN ('집','회사') THEN tag ELSE name END AS name,
  poi_category,
  sido,
  sigungu,
  CASE WHEN tag IN ('집','회사') THEN NULL ELSE dong END AS dong,
  tag,
  tag_source,
  ai_confidence
FROM places;

DROP VIEW IF EXISTS v_trips;
CREATE VIEW v_trips AS
SELECT
  id,
  name,
  date(start_t, 'unixepoch', '+9 hours') AS start_date,
  date(end_t,   'unixepoch', '+9 hours') AS end_date,
  nights,
  regions,
  distance_m
FROM trips;

DROP VIEW IF EXISTS v_stays;
CREATE VIEW v_stays AS
SELECT
  id,
  day,
  datetime(start_t, 'unixepoch', '+9 hours') AS start_at,
  datetime(end_t,   'unixepoch', '+9 hours') AS end_at,
  (end_t - start_t) / 60 AS minutes,
  place_id,
  trip_id
FROM stays;

-- 방문 + 장소를 미리 조인한 편의 뷰. 집계 질문은 대부분 이것만 쓴다.
DROP VIEW IF EXISTS v_stay_places;
CREATE VIEW v_stay_places AS
SELECT
  s.id AS stay_id,
  s.day,
  datetime(s.start_t, 'unixepoch', '+9 hours') AS start_at,
  (s.end_t - s.start_t) / 60 AS minutes,
  s.trip_id,
  p.id AS place_id,
  CASE WHEN p.tag IN ('집','회사') THEN p.tag ELSE p.name END AS place_name,
  p.poi_category,
  p.sido,
  p.sigungu,
  CASE WHEN p.tag IN ('집','회사') THEN NULL ELSE p.dong END AS dong,
  p.tag,
  p.tag_source
FROM stays s
JOIN places p ON p.id = s.place_id;

DROP VIEW IF EXISTS v_days;
CREATE VIEW v_days AS
SELECT
  day,
  stay_count,
  distance_m,
  datetime(first_activity_t, 'unixepoch', '+9 hours') AS first_activity_at,
  photo_count,
  summary
FROM days;
`;

/** 에이전트가 SELECT 할 수 있는 이름 (SQL 가드의 허용 목록). */
export const AGENT_VIEWS = [
  "v_places",
  "v_trips",
  "v_stays",
  "v_stay_places",
  "v_days",
] as const;

/** 모델 프롬프트에 넣는 스키마 설명. DDL 이 바뀌면 같이 고친다. */
export const AGENT_SCHEMA_DOC = `
-- 시각은 모두 한국 시간(KST). 'YYYY-MM-DD' 또는 'YYYY-MM-DD HH:MM:SS' 문자열.
-- 좌표는 없다. 집/회사는 이름이 '집'/'회사'로만 나온다.

v_trips(id, name, start_date, end_date, nights, regions, distance_m)
  -- regions: 쉼표 구분 방문 지역. 예 '강원도,강릉시,속초시'. 지역 검색은 regions LIKE '%강원%'

v_stay_places(stay_id, day, start_at, minutes, trip_id, place_id, place_name,
              poi_category, sido, sigungu, dong, tag, tag_source)
  -- 방문(머문 곳) 한 건당 한 행. tag: 집|회사|밥집|커피|운동|쇼핑|관광|NULL

v_stays(id, day, start_at, end_at, minutes, place_id, trip_id)
v_places(id, name, poi_category, sido, sigungu, dong, tag, tag_source, ai_confidence)
v_days(day, stay_count, distance_m, first_activity_at, photo_count, summary)
`.trim();
