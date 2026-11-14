import { askDemo } from '../src/api/demoAgent';

test('demo agent runs only fixed tools and keeps only cards seen in tool results', async () => {
  const calls: string[] = [];
  const tools = {
    getInfo: async () => ({ available: true }),
    runTool: async (name: string) => {
      calls.push(name);
      return { result: [{ id: 't_1', name: '강릉 1박 2일' }] };
    },
    getCard: async (type: string, id: string) => ({
      id,
      type,
      name: '강릉 1박 2일',
    }),
  };
  let n = 0;
  const post = async () => {
    n++;
    return n === 1
      ? {
          output: {
            message: {
              role: 'assistant' as const,
              content: [
                {
                  toolUse: {
                    toolUseId: 'u1',
                    name: 'trips_by_region',
                    input: { region: '강원' },
                  },
                },
              ],
            },
          },
          stopReason: 'tool_use',
        }
      : {
          output: {
            message: {
              role: 'assistant' as const,
              content: [
                {
                  toolUse: {
                    toolUseId: 'u2',
                    name: 'final_answer',
                    input: {
                      text: '1번 갔어요.',
                      cards: [
                        { type: 'trip', id: 't_1' },
                        { type: 'trip', id: 't_made_up' },
                      ],
                    },
                  },
                },
              ],
            },
          },
          stopReason: 'tool_use',
        };
  };
  const r = await askDemo('강원도 몇 번?', post as any, tools as any);
  expect(calls).toEqual(['trips_by_region']);
  expect(r.answer.text).toBe('1번 갔어요.');
  expect(r.cards.map(c => c.ref.id)).toEqual(['t_1']);
});
