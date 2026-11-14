import type {
  AgentAnswer,
  CardRef,
  ContentBlock,
  Message,
  ToolSpec,
} from '@haru/schema';
import { NativeModules, Platform } from 'react-native';
import { buildChatRequest, postChat } from './chatClient';

// "서버 연동 테스트": /chat over the bundled fixed demo memory.db (a synthetic persona).
// The model can only call the fixed tools below; the app runs them natively with
// validated arguments. No SQL from the model is executed, no coordinates are returned,
// and the user's own CLVisit records are never read here.

type DemoNative = {
  getInfo(): Promise<DemoInfo>;
  runTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ result: unknown }>;
  getCard(type: string, id: string): Promise<Record<string, unknown> | null>;
};

export type DemoInfo = {
  available: boolean;
  first_day?: string;
  last_day?: string;
  stay_count?: number;
  trip_count?: number;
};

const native: DemoNative | undefined =
  Platform.OS === 'ios' ? NativeModules.DemoMemoryModule : undefined;

export const demoMemory = {
  isSupported: native != null,
  getInfo: (): Promise<DemoInfo> =>
    native ? native.getInfo() : Promise.resolve({ available: false }),
};

const TAGS = ['집', '회사', '밥집', '커피', '운동', '쇼핑', '관광'];

export const DEMO_TOOLS: ToolSpec[] = [
  {
    toolSpec: {
      name: 'data_range',
      description: '데모 기록의 첫 날, 마지막 날(오늘), 전체 방문 수.',
      inputSchema: { json: { type: 'object', properties: {} } },
    },
  },
  {
    toolSpec: {
      name: 'trips_by_region',
      description:
        '여행 목록. regions 에 지역명(예: 강원, 부산, 강릉)이 들어간 여행을 날짜순으로 준다. id 는 trip 카드에 쓴다.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            region: { type: 'string', description: '지역명 일부' },
          },
          required: ['region'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'day_summary',
      description:
        '하루 요약과 그날 머문 곳 목록. day 는 YYYY-MM-DD (한국 시간).',
      inputSchema: {
        json: {
          type: 'object',
          properties: { day: { type: 'string' } },
          required: ['day'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'count_tag_stays',
      description: `태그별 방문 횟수와 총 시간(분). tag 는 ${TAGS.join(
        ', ',
      )} 중 하나. from/to 는 YYYY-MM-DD.`,
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            tag: { type: 'string', enum: TAGS },
            from: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['tag', 'from', 'to'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'final_answer',
      description:
        '최종 답. text 는 한국어 1~3문장. cards 에는 도구 결과에 나온 id 만 넣는다 (trip: t_..., day: YYYY-MM-DD, stay: s_...).',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            cards: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['trip', 'day', 'stay'] },
                  id: { type: 'string' },
                },
                required: ['type', 'id'],
              },
            },
          },
          required: ['text', 'cards'],
        },
      },
    },
  },
];

const SYSTEM = `너는 "하루" 앱의 기억 챗이다. 지금 대화의 데이터는 실제 사용자가 아니라 고정된 데모 페르소나의 1년 기록이다.
반드시 도구로 조회한 결과만 근거로 답하고, 도구 결과에 없으면 "기록이 없어요"라고 답한다.
날짜는 한국 시간이고, 데모 기준 오늘은 data_range 의 last_day 다. "올해"는 last_day 의 연도다.
답은 항상 final_answer 도구로 끝낸다. cards 에는 도구 결과에 실제로 나온 id 만 넣는다.`;

export type DemoCard = { ref: CardRef; data: Record<string, unknown> };

export type DemoRun = {
  answer: AgentAnswer;
  cards: DemoCard[];
  toolCalls: string[];
};

const MAX_TOOL_ROUNDS = 6;

/** Collects ids seen in tool results, so cards can only point at data actually returned. */
function collectIds(value: unknown, into: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach(v => collectIds(v, into));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (
        (k === 'id' || k === 'stay_id' || k === 'day') &&
        typeof v === 'string'
      ) {
        into.add(v);
      } else {
        collectIds(v, into);
      }
    }
  }
}

export async function askDemo(
  question: string,
  post: typeof postChat = postChat,
  tools: DemoNative | undefined = native,
): Promise<DemoRun> {
  if (!tools) {
    throw new Error('데모 데이터를 열 수 없어요.');
  }
  const messages: Message[] = [{ role: 'user', content: [{ text: question }] }];
  const seen = new Set<string>();
  const toolCalls: string[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await post(buildChatRequest(SYSTEM, messages, DEMO_TOOLS));
    const msg = res.output.message;
    messages.push(msg);
    const uses = msg.content.filter(
      (b): b is Extract<ContentBlock, { toolUse: unknown }> => 'toolUse' in b,
    );
    const final = uses.find(u => u.toolUse.name === 'final_answer');
    if (final) {
      const input = final.toolUse.input as { text?: unknown; cards?: unknown };
      const text = typeof input.text === 'string' ? input.text : '';
      const refs = (Array.isArray(input.cards) ? input.cards : []).filter(
        (c: any): c is CardRef =>
          c &&
          ['trip', 'day', 'stay'].includes(c.type) &&
          typeof c.id === 'string' &&
          seen.has(c.id),
      );
      const cards: DemoCard[] = [];
      for (const ref of refs.slice(0, 6)) {
        const data = await tools.getCard(ref.type, ref.id);
        if (data) {
          cards.push({ ref, data });
        }
      }
      return { answer: { text, cards: refs }, cards, toolCalls };
    }
    if (uses.length === 0 || round === MAX_TOOL_ROUNDS) {
      const text = msg.content
        .map(b => ('text' in b ? b.text : ''))
        .join('')
        .trim();
      return {
        answer: { text: text || '답을 만들지 못했어요.', cards: [] },
        cards: [],
        toolCalls,
      };
    }
    const results: ContentBlock[] = [];
    for (const u of uses) {
      toolCalls.push(u.toolUse.name);
      try {
        const out = await tools.runTool(u.toolUse.name, u.toolUse.input ?? {});
        collectIds(out.result, seen);
        results.push({
          toolResult: {
            toolUseId: u.toolUse.toolUseId,
            content: [{ json: out.result }],
            status: 'success',
          },
        });
      } catch (e: any) {
        results.push({
          toolResult: {
            toolUseId: u.toolUse.toolUseId,
            content: [{ text: String(e?.message ?? e) }],
            status: 'error',
          },
        });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  return {
    answer: { text: '답을 만들지 못했어요.', cards: [] },
    cards: [],
    toolCalls,
  };
}

export const DEMO_TEST_QUESTIONS = [
  '나 올해에 강원도를 몇 번 갔지?',
  '지난달 커피 몇 번 마셨어?',
  '오늘 어디 있었어?',
];
