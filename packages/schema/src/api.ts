/**
 * Lambda API 계약 (v0.1). 앱 → Lambda Function URL.
 * 인증은 없다. 모델 ID, maxTokens 는 서버가 고정하므로 앱이 보내도 무시된다.
 * 형식은 Bedrock Converse 의 JSON 과 같다 (Lambda 는 그대로 중계한다).
 */

export interface ToolSpec {
  toolSpec: {
    name: string;
    description: string;
    inputSchema: { json: Record<string, unknown> };
  };
}

export type ContentBlock =
  | { text: string }
  | { toolUse: { toolUseId: string; name: string; input: Record<string, unknown> } }
  | {
      toolResult: {
        toolUseId: string;
        content: Array<{ text: string } | { json: unknown }>;
        status?: "success" | "error";
      };
    };

export interface Message {
  role: "user" | "assistant";
  content: ContentBlock[];
}

/** POST /chat */
export interface ChatRequest {
  system: Array<{ text: string }>;
  messages: Message[];
  toolConfig?: { tools: ToolSpec[] };
}

export interface ChatResponse {
  output: { message: Message };
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | "content_filtered" | string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}

/** POST /geocode  (2차: Kakao Local coord2regioncode / coord2address 중계) */
export interface GeocodeRequest {
  lat: number;
  lng: number;
}

/** GET /health */
export interface HealthResponse {
  ok: true;
  model: string;
  /** /places/nearby 가 쓰는 공급자. 키가 없으면 null */
  placesProvider: PlacesProvider | null;
}

/** Google 키가 있으면 google, 없고 Kakao 키만 있으면 kakao. 한 요청은 한 공급자에게만 간다. */
export type PlacesProvider = "google" | "kakao";

/**
 * POST /places/nearby  (Google Places API (New) Nearby Search 또는 Kakao Local 카테고리 검색 중계)
 * 방문 하나의 좌표와 정확도만 보낸다. 다른 필드가 있으면 400 이다.
 * 반경은 서버가 horizontalAccuracy 를 50~300m 로 제한해 정한다. 결과는 최대 10개, 직선거리 가까운 순, id 중복 제거.
 * 키가 없으면 501 { error: "places_not_configured" }, 공급자 오류는 502/429/504 { error: "places_error", provider }.
 */
export interface PlacesNearbyRequest {
  lat: number;
  lng: number;
  /** m, 0~5000 */
  horizontalAccuracy: number;
}

export interface PlaceAttribution {
  provider: string;
  providerUri?: string;
}

export interface PlaceCandidate {
  /** 공급자의 장소 ID (Google place ID 또는 Kakao 장소 id). 앱이 저장하는 값은 이것뿐이다. */
  id: string;
  provider: PlacesProvider;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  /** 요청 좌표에서 직선거리 (m, 반올림) */
  distanceMeters: number;
  /** 있으면 화면에 함께 표시해야 하는 제3자 출처 */
  attributions?: PlaceAttribution[];
}

export interface PlacesNearbyResponse {
  /** 정상 결과가 없으면 빈 배열 */
  places: PlaceCandidate[];
  radiusMeters: number;
  provider: PlacesProvider;
  source: "google_places" | "kakao_local";
  /** Kakao 에서 일부 카테고리 조회가 실패하면 true (나머지 결과만 들어 있다) */
  incomplete?: boolean;
}

export interface ApiError {
  error: string;
  detail?: string;
}

/** 근거 카드: 모델은 type 과 id 만 준다. 내용은 앱이 DB 에서 다시 조회한다. */
export type CardRef =
  | { type: "trip"; id: string }
  | { type: "day"; id: string }      // id = 'YYYY-MM-DD'
  | { type: "stay"; id: string }
  | { type: "place"; id: string };

export interface AgentAnswer {
  text: string;
  cards: CardRef[];
}
