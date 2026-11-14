import type { AgentAnswer, CardRef } from '@haru/schema';
import { SAMPLE_VISITS } from '../sampleVisits';
import type { Visit } from '../visitMonitor';

/** 'YYYY-MM-DD' in KST (+9h), the `day` convention of packages/schema/src/ddl.ts. */
export function kstDay(ms: number): string {
  const d = new Date(ms + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

const SAMPLE_DAY = kstDay(SAMPLE_VISITS[0].arrivalAt ?? SAMPLE_VISITS[0].receivedAt);

export type DemoQA = { question: string; answer: AgentAnswer };

/**
 * Fixed AgentAnswer fixtures for the sample mode only. No model is called. Text states only
 * what the sample rows show, and cards reference real local sample items by id.
 */
export const DEMO_QA: DemoQA[] = [
  {
    question: '샘플 하루에 몇 곳에 머물렀어?',
    answer: {
      text: '샘플 하루에는 두 곳에 머물렀어요. 한 곳은 도착과 출발이 모두 기록됐고, 다른 한 곳은 출발이 아직 기록되지 않았어요.',
      cards: [
        { type: 'day', id: SAMPLE_DAY },
        { type: 'stay', id: String(SAMPLE_VISITS[0].id) },
        { type: 'stay', id: String(SAMPLE_VISITS[1].id) },
      ],
    },
  },
  {
    question: '출발 기록이 없는 방문은 어디야?',
    answer: {
      text: '출발 시각이 없는 방문은 한 번이에요. 아직 머무는 중이거나 출발이 기록되지 않은 경우예요.',
      cards: [{ type: 'stay', id: String(SAMPLE_VISITS[1].id) }],
    },
  },
];

export type ResolvedCard =
  | { ref: CardRef; kind: 'day'; day: string; visits: Visit[] }
  | { ref: CardRef; kind: 'stay'; visit: Visit };

/**
 * Builds evidence cards from local rows only. Refs that do not resolve are dropped, so a
 * card can never show text the model wrote. trip/place cards have no local source yet.
 */
export function resolveCards(refs: CardRef[], visits: Visit[]): ResolvedCard[] {
  const out: ResolvedCard[] = [];
  for (const ref of refs) {
    if (ref.type === 'day') {
      const dayVisits = visits.filter(
        v => kstDay(v.arrivalAt ?? v.departureAt ?? v.receivedAt) === ref.id,
      );
      if (dayVisits.length > 0) {
        out.push({ ref, kind: 'day', day: ref.id, visits: dayVisits });
      }
    } else if (ref.type === 'stay') {
      const visit = visits.find(v => String(v.id) === ref.id);
      if (visit) {
        out.push({ ref, kind: 'stay', visit });
      }
    }
  }
  return out;
}
