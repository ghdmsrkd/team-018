// 하루 API 중계 Lambda. 앱 → Function URL → (Bedrock Converse | Kakao Local | Google Places Nearby)
// 자격 증명은 Lambda 실행 역할과 환경변수에만 있다. 요청 본문(위치 데이터 포함 가능)은 로그에 남기지 않는다.
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const REGION = process.env.AWS_REGION || "ap-northeast-2";
const MODEL_ID = process.env.MODEL_ID || "global.anthropic.claude-haiku-4-5-20251001-v1:0";
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 1024);
const MAX_BODY_BYTES = 200_000;
const MAX_MESSAGES = 60;

const client = new BedrockRuntimeClient({ region: REGION });

const json = (statusCode, obj) => ({
  statusCode,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(obj),
});

export const handler = async (event) => {
  const method = event.requestContext?.http?.method ?? "POST";
  const path = event.rawPath ?? "/";

  if (method === "GET" && path === "/health") {
    return json(200, { ok: true, model: MODEL_ID, placesProvider: placesProvider() });
  }
  if (method !== "POST") return json(405, { error: "method_not_allowed" });

  let raw = event.body ?? "";
  if (event.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return json(413, { error: "too_large" });

  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return json(400, { error: "invalid_json" });
  }

  if (path === "/chat") return chat(body);
  if (path === "/geocode") return geocode(body);
  if (path === "/places/nearby") return placesNearby(body);
  return json(404, { error: "not_found" });
};

async function chat(body) {
  const { system, messages, toolConfig } = body;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return json(400, { error: "invalid_messages" });
  }
  if (system !== undefined && !Array.isArray(system)) return json(400, { error: "invalid_system" });

  try {
    const out = await client.send(
      new ConverseCommand({
        modelId: MODEL_ID, // 앱이 보낸 modelId 는 무시한다
        system,
        messages,
        toolConfig,
        inferenceConfig: { maxTokens: MAX_TOKENS, temperature: 0 },
      }),
    );
    return json(200, { output: out.output, stopReason: out.stopReason, usage: out.usage });
  } catch (e) {
    // 본문은 로그에 남기지 않고, 오류 종류만 남긴다.
    console.error("bedrock_error", e?.name, e?.$metadata?.httpStatusCode, String(e?.message ?? "").slice(0, 400));
    const status = e?.name === "ThrottlingException" ? 429 : e?.name === "ValidationException" ? 400 : 502;
    return json(status, { error: "bedrock_error", detail: e?.name ?? "unknown" });
  }
}

async function geocode(body) {
  const key = process.env.KAKAO_REST_KEY;
  if (!key) return json(501, { error: "geocode_not_configured" });
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return json(400, { error: "invalid_coordinates" });
  }
  const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`;
  const r = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  return json(r.ok ? 200 : 502, await r.json().catch(() => ({})));
}

// ---- POST /places/nearby : 주변 장소 후보 조회 (Google Places API (New) 또는 Kakao Local) ----
// 입력은 방문 하나의 lat, lng, horizontalAccuracy 뿐이다. 공급자는 요청마다 하나만 쓴다:
// GOOGLE_PLACES_API_KEY 가 있으면 Google, 없고 KAKAO_REST_KEY 만 있으면 Kakao. 둘 다 없으면 501.
// 좌표를 두 공급자에게 동시에 보내지 않는다. 좌표·키·응답 본문은 로그에 남기지 않는다.
const PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby";
const PLACES_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.attributions";
const KAKAO_CATEGORY_URL = "https://dapi.kakao.com/v2/local/search/category.json";
// category_group_code 는 필수라 고정 목록만 병렬로 조회한다: 음식점, 카페, 편의점, 대형마트, 문화시설, 관광명소, 숙박
export const KAKAO_CATEGORIES = ["FD6", "CE7", "CS2", "MT1", "CT1", "AT4", "AD5"];
const PLACES_MIN_RADIUS_M = 50;
const PLACES_MAX_RADIUS_M = 300;
const PLACES_MAX_RESULTS = 10;
const PLACES_MAX_ACCURACY_M = 5000;
const PLACES_TIMEOUT_MS = 8000;
const PLACES_KEYS = new Set(["lat", "lng", "horizontalAccuracy"]);

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** 설정된 공급자 하나. Google 키가 우선이다. */
export function placesProvider() {
  if (process.env.GOOGLE_PLACES_API_KEY) return "google";
  if (process.env.KAKAO_REST_KEY) return "kakao";
  return null;
}

export function validateNearby(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "invalid_body";
  for (const k of Object.keys(body)) if (!PLACES_KEYS.has(k)) return "unexpected_field";
  const { lat, lng, horizontalAccuracy } = body;
  if (!isNum(lat) || !isNum(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return "invalid_coordinates";
  }
  if (!isNum(horizontalAccuracy) || horizontalAccuracy < 0 || horizontalAccuracy > PLACES_MAX_ACCURACY_M) {
    return "invalid_accuracy";
  }
  return null;
}

/** 검색 반경 = 방문 정확도를 50~300m 로 제한한 값. */
export const nearbyRadius = (accuracy) =>
  Math.min(PLACES_MAX_RADIUS_M, Math.max(PLACES_MIN_RADIUS_M, accuracy));

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function fetchWithTimeout(fetchImpl, url, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PLACES_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const networkError = (provider, e) => {
  const detail = e?.name === "AbortError" ? "timeout" : "network";
  console.error("places_error", provider, detail);
  return json(detail === "timeout" ? 504 : 502, { error: "places_error", provider, detail });
};

const upstreamError = (provider, status) => {
  // 상태 코드만 남긴다. 공급자 오류 본문은 요청 정보를 담을 수 있어 로그·응답에 넣지 않는다.
  console.error("places_error", provider, status);
  return json(status === 429 ? 429 : 502, { error: "places_error", provider, detail: `upstream_${status}` });
};

const finish = (provider, lat, lng, radiusMeters, list, extra = {}) => {
  const seen = new Set();
  const places = list
    .map((p) => ({ ...p, distanceMeters: Math.round(distanceMeters(lat, lng, p.lat, p.lng)) }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .slice(0, PLACES_MAX_RESULTS);
  return json(200, { places, radiusMeters, provider, source: provider === "google" ? "google_places" : "kakao_local", ...extra });
};

export async function placesNearby(body, fetchImpl = fetch) {
  const invalid = validateNearby(body);
  if (invalid) return json(400, { error: invalid });
  const provider = placesProvider();
  if (!provider) return json(501, { error: "places_not_configured" });
  const { lat, lng, horizontalAccuracy } = body;
  const radiusMeters = nearbyRadius(horizontalAccuracy);
  return provider === "google"
    ? googleNearby(lat, lng, radiusMeters, fetchImpl)
    : kakaoNearby(lat, lng, radiusMeters, fetchImpl);
}

async function googleNearby(lat, lng, radiusMeters, fetchImpl) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  let r;
  try {
    r = await fetchWithTimeout(fetchImpl, PLACES_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": PLACES_FIELD_MASK },
      body: JSON.stringify({
        maxResultCount: PLACES_MAX_RESULTS,
        rankPreference: "DISTANCE",
        languageCode: "ko",
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters } },
      }),
    });
  } catch (e) {
    return networkError("google", e);
  }
  if (!r.ok) return upstreamError("google", r.status);
  const data = await r.json().catch(() => null);
  if (!data || typeof data !== "object") {
    return json(502, { error: "places_error", provider: "google", detail: "invalid_upstream_body" });
  }
  const list = (Array.isArray(data.places) ? data.places : [])
    .filter((p) => p && typeof p.id === "string" && isNum(p.location?.latitude) && isNum(p.location?.longitude))
    .map((p) => {
      const attributions = (Array.isArray(p.attributions) ? p.attributions : [])
        .filter((a) => a && typeof a.provider === "string")
        .map((a) => ({ provider: a.provider, ...(typeof a.providerUri === "string" ? { providerUri: a.providerUri } : {}) }));
      return {
        id: p.id,
        provider: "google",
        name: typeof p.displayName?.text === "string" ? p.displayName.text : "",
        address: typeof p.formattedAddress === "string" ? p.formattedAddress : null,
        lat: p.location.latitude,
        lng: p.location.longitude,
        ...(attributions.length ? { attributions } : {}),
      };
    });
  return finish("google", lat, lng, radiusMeters, list);
}

async function kakaoNearby(lat, lng, radiusMeters, fetchImpl) {
  const key = process.env.KAKAO_REST_KEY;
  const radius = Math.round(radiusMeters);
  const results = await Promise.all(
    KAKAO_CATEGORIES.map(async (code) => {
      const qs = new URLSearchParams({
        category_group_code: code,
        x: String(lng),
        y: String(lat),
        radius: String(radius),
        sort: "distance",
        size: "15",
      });
      try {
        const r = await fetchWithTimeout(fetchImpl, `${KAKAO_CATEGORY_URL}?${qs}`, {
          method: "GET",
          headers: { Authorization: `KakaoAK ${key}` },
        });
        if (!r.ok) return { status: r.status };
        const data = await r.json().catch(() => null);
        return data && Array.isArray(data.documents) ? { docs: data.documents } : { status: "invalid_upstream_body" };
      } catch (e) {
        return { error: e?.name === "AbortError" ? "timeout" : "network" };
      }
    }),
  );
  const ok = results.filter((x) => x.docs);
  if (ok.length === 0) {
    const first = results[0] ?? {};
    if (first.error) return networkError("kakao", { name: first.error === "timeout" ? "AbortError" : "Error" });
    if (typeof first.status === "number") return upstreamError("kakao", first.status);
    return json(502, { error: "places_error", provider: "kakao", detail: "invalid_upstream_body" });
  }
  const failed = results.length - ok.length;
  if (failed > 0) console.error("places_partial", "kakao", failed);
  const list = ok
    .flatMap((x) => x.docs)
    .map((d) => ({ d, la: Number(d?.y), lo: Number(d?.x) }))
    .filter(({ d, la, lo }) => d && typeof d.id === "string" && d.id && Number.isFinite(la) && Number.isFinite(lo))
    .map(({ d, la, lo }) => ({
      id: d.id,
      provider: "kakao",
      name: typeof d.place_name === "string" ? d.place_name : "",
      address: (typeof d.road_address_name === "string" && d.road_address_name) ||
        (typeof d.address_name === "string" && d.address_name) || null,
      lat: la,
      lng: lo,
    }));
  return finish("kakao", lat, lng, radiusMeters, list, failed > 0 ? { incomplete: true } : {});
}
