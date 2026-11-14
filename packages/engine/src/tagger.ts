import { TAGS, type ChatRequest, type ChatResponse, type Tag } from "@haru/schema";

/** 장소 태그 추론. 목록 안의 태그 하나를 고르거나, 확신이 없으면 null 로 비워 둔다. */
export interface PlaceFeatures {
  id: string;
  name: string;
  poi_category: string | null;
  visits: number;
  median_minutes: number;
  typical_time: "아침" | "점심" | "오후" | "저녁" | "밤";
  weekend_ratio: number; // 0~1
}

export interface ClassifyResult {
  tag: Tag | null;
  confidence: number; // 0~1
  reason: string;
}

export type Classifier = (features: PlaceFeatures[]) => Promise<Map<string, ClassifyResult>>;

const RULES: Array<[RegExp, Tag]> = [
  [/(카페|커피|디저트|베이커리)/, "커피"],
  [/(음식점|식당|한식|양식|일식|중식|분식|고기|국밥|횟집|파스타|치킨|맛집)/, "밥집"],
  [/(헬스|피트니스|요가|필라테스|수영장|체육|운동|클라이밍)/, "운동"],
  [/(쇼핑|백화점|마트|편집숍|아울렛|패션|상가)/, "쇼핑"],
  [/(관광|해변|해수욕장|공원|명소|전망|산|박물관|미술관|궁|한옥|케이블카)/, "관광"],
];

/** 결정적인 규칙 분류기. 카테고리 이름으로만 판단하고, 맞는 게 없으면 비워 둔다. 테스트와 LLM 없는 빌드에 쓴다. */
export const ruleClassifier: Classifier = async (features) => {
  const out = new Map<string, ClassifyResult>();
  for (const f of features) {
    const text = `${f.poi_category ?? ""} ${f.name}`;
    const hit = RULES.find(([re]) => re.test(text));
    out.set(
      f.id,
      hit
        ? { tag: hit[1], confidence: 0.8, reason: `장소 분류(${f.poi_category ?? f.name})로 판단` }
        : {
            tag: null,
            confidence: 0,
            reason: `방문 ${f.visits}회, 평균 ${f.median_minutes}분 머묾. 태그 목록에 맞는 곳인지 확신할 수 없음`,
          },
    );
  }
  return out;
};

export const SET_TAGS_TOOL = {
  toolSpec: {
    name: "set_tags",
    description: "각 장소에 태그 목록 중 하나를 고른다. 확신이 없으면 tag 를 null 로 둔다.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                tag: { type: ["string", "null"], enum: [...TAGS, null] },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                reason: { type: "string", description: "고른 근거 또는 비워 둔 이유 (한국어 한 문장)" },
              },
              required: ["id", "tag", "confidence", "reason"],
            },
          },
        },
        required: ["results"],
      },
    },
  },
};

const SYSTEM = `당신은 위치 기록 앱의 장소 분류기입니다. 각 장소에 아래 태그 목록 중 정확히 하나를 고르거나, 확신이 없으면 null 로 둡니다.
태그 목록: ${TAGS.join(", ")}.
규칙: 목록에 없는 태그를 만들지 않는다. '기타' 같은 버림 태그는 없다. 숙소, 시장처럼 목록에 맞지 않거나 근거가 약하면 null.
집·회사는 이미 정해져 있으므로 고르지 않는다. 근거는 장소 이름, 분류, 방문 횟수, 머문 시간, 시간대만 사용한다.
반드시 set_tags 도구로만 답한다.`;

export type ChatFn = (req: ChatRequest) => Promise<ChatResponse>;

/** LLM 분류기. 출력은 enum + null 로 검증하고, 목록 밖 값은 null 로 바꾼다. */
export function llmClassifier(chat: ChatFn, batchSize = 30): Classifier {
  return async (features) => {
    const out = new Map<string, ClassifyResult>();
    for (let i = 0; i < features.length; i += batchSize) {
      const batch = features.slice(i, i + batchSize);
      const res = await chat({
        system: [{ text: SYSTEM }],
        messages: [{ role: "user", content: [{ text: JSON.stringify(batch) }] }],
        toolConfig: { tools: [SET_TAGS_TOOL as never], toolChoice: { tool: { name: "set_tags" } } } as never,
      });
      const block = res.output.message.content.find((c): c is Extract<typeof c, { toolUse: unknown }> => "toolUse" in c);
      const results = (block?.toolUse.input as { results?: unknown[] } | undefined)?.results ?? [];
      for (const r of results as Array<Record<string, unknown>>) {
        const id = String(r.id ?? "");
        if (!batch.some((f) => f.id === id)) continue;
        const tag = TAGS.includes(r.tag as Tag) ? (r.tag as Tag) : null;
        const conf = Math.max(0, Math.min(1, Number(r.confidence) || 0));
        out.set(id, { tag, confidence: tag ? conf : 0, reason: String(r.reason ?? "").slice(0, 200) });
      }
      for (const f of batch) {
        if (!out.has(f.id)) out.set(f.id, { tag: null, confidence: 0, reason: "AI 응답에 이 장소가 없어 비워 둠" });
      }
    }
    return out;
  };
}
