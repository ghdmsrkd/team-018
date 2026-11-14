import type { AgentAnswer, CardRef } from '@haru/schema';
import { SAMPLE_VISITS } from '../sampleVisits';
import type { Visit } from '../visitMonitor';

/** 'YYYY-MM-DD' in KST (+9h), the `day` convention of packages/schema/src/ddl.ts. */
export function kstDay(ms: number): string {
  const d = new Date(ms + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    '0',
  )}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const LAST_DAY = kstDay(SAMPLE_VISITS.find(v => v.id === -9)!.arrivalAt!);
const stay = (id: number): CardRef => ({ type: 'stay', id: String(id) });

export type DemoQA = { question: string; answer: AgentAnswer };

/**
 * Fixed AgentAnswer fixtures for the sample mode only. No model is called. Each text states
 * only what the sample rows show (place names and times are fixed), and every card refers
 * to a local sample item by id, so cards are re-read from the sample data.
 */
export const DEMO_QA: DemoQA[] = [
  {
    question: '샘플 마지막 날에 어디 갔어?',
    answer: {
      text: '마지막 날에는 블루보틀 성수, 서울숲, 명동교자 본점에 들렀고, 지금은 남산서울타워에 머무는 중이에요.',
      cards: [
        { type: 'day', id: LAST_DAY },
        stay(-9),
        stay(-10),
        stay(-11),
        stay(-12),
      ],
    },
  },
  {
    question: '명동교자 몇 번 갔어?',
    answer: {
      text: '명동교자 본점에는 샘플 기간 동안 두 번 갔어요.',
      cards: [stay(-2), stay(-11)],
    },
  },
  {
    question: '블루보틀 성수에는 얼마나 있었어?',
    answer: {
      text: '블루보틀 성수에는 두 번 들러 모두 1시간 50분 머물렀어요.',
      cards: [stay(-7), stay(-9)],
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
