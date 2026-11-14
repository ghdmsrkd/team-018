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
