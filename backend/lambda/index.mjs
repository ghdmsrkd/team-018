// 하루 API 중계 Lambda. 앱 → Function URL → (Bedrock Converse | Kakao Local)
// 자격 증명은 Lambda 실행 역할과 환경변수에만 있다. 요청 본문(위치 데이터 포함 가능)은 로그에 남기지 않는다.
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const REGION = process.env.AWS_REGION || "ap-northeast-2";
const MODEL_ID = process.env.MODEL_ID || "global.openai.gpt-6-luna";
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

  if (method === "GET" && path === "/health") return json(200, { ok: true, model: MODEL_ID });
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
    console.error("bedrock_error", e?.name, e?.$metadata?.httpStatusCode);
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
