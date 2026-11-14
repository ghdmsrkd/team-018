/**
 * @format
 */
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

let mockVisits: unknown[] = [];

jest.mock('../src/visitMonitor', () => ({
  isSupported: true,
  visitMonitor: {
    getState: jest.fn(() =>
      Promise.resolve({
        authorization: 'always',
        optedIn: true,
        monitoring: true,
        alwaysRequested: true,
        requestPending: false,
        visitCount: 0,
        lastError: null,
      }),
    ),
    getVisits: jest.fn(() => Promise.resolve(mockVisits)),
    getTags: jest.fn(() => Promise.resolve([])),
    requestAlways: jest.fn(() => Promise.resolve({})),
    start: jest.fn(),
    stop: jest.fn(),
    setVisitTag: jest.fn(),
    clearVisitTag: jest.fn(),
    createTag: jest.fn(),
    renameTag: jest.fn(),
    subscribe: jest.fn(() => () => {}),
    openSettings: jest.fn(() => Promise.resolve()),
  },
}));

const mockNative: Record<string, jest.Mock> = jest.requireMock(
  '../src/visitMonitor',
).visitMonitor;

let mounted: ReactTestRenderer.ReactTestRenderer | null = null;

beforeEach(() => jest.clearAllMocks());

// SectionList schedules batched renders; unmount inside act so none run after a test.
afterEach(async () => {
  const r = mounted;
  mounted = null;
  if (r) {
    await ReactTestRenderer.act(async () => r.unmount());
  }
});

const realVisit = {
  id: 7,
  latitude: 37.5,
  longitude: 127,
  horizontalAccuracy: 20,
  arrivalAt: new Date(2031, 4, 2, 8, 10).getTime(),
  departureAt: new Date(2031, 4, 2, 9, 32).getTime(),
  receivedAt: new Date(2031, 4, 2, 9, 40).getTime(),
  tag: { id: 4, name: '카페', source: 'auto', matchDistance: 12.4 },
};

async function mount() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  mounted = renderer;
  return renderer;
}

type Node = ReactTestRenderer.ReactTestRendererJSON;

/** All rendered text, joined. Ignores props, which may hold React elements. */
function json(r: ReactTestRenderer.ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (n: Node | Node[] | string | null) => {
    if (n == null) {
      return;
    }
    if (typeof n === 'string') {
      out.push(n);
    } else if (Array.isArray(n)) {
      n.forEach(walk);
    } else {
      (n.children ?? []).forEach(walk);
    }
  };
  walk(r.toJSON());
  return out.join('|');
}

async function press(r: ReactTestRenderer.ReactTestRenderer, testID: string) {
  await ReactTestRenderer.act(async () => {
    r.root.findByProps({ testID }).props.onPress();
  });
}

test('onboarding shows first and makes no native calls or permission request', async () => {
  const r = await mount();
  const out = json(r);
  expect(out).toContain('HARU');
  expect(out).toContain('적지 않아도\n하루가 남아요');
  expect(out).toContain('위치 권한 허용하고 시작하기');
  expect(out).toContain('샘플 하루로 먼저 둘러보기');
  for (const fn of Object.values(mockNative)) {
    expect(fn).not.toHaveBeenCalled();
  }
});

test('primary button requests Always once and opens the real visit screen', async () => {
  mockVisits = [realVisit];
  const r = await mount();
  await press(r, 'onboarding-start');
  expect(mockNative.requestAlways).toHaveBeenCalledTimes(1);
  const out = json(r);
  expect(out).toContain('2031년 5월 2일 금요일');
  expect(out).toContain('머문 시간 ');
  expect(out).toContain('1시간 22분');
  expect(out).toContain('장소: 카페 (자동 · 12 m)');
  expect(out).toContain('변경');
  expect(out).not.toContain('12.34567');
});

test('real screen falls back to sample rows without a tag control', async () => {
  mockVisits = [];
  const r = await mount();
  await press(r, 'onboarding-start');
  const out = json(r);
  expect(out).toContain('12.34567');
  expect(out).not.toContain('변경');
  expect(out).not.toContain('장소');
});

test('demo shows samples with no native calls and can return to onboarding', async () => {
  const r = await mount();
  await press(r, 'onboarding-demo');
  const out = json(r);
  expect(out).toContain('샘플 하루');
  expect(out).toContain('12.34567');
  expect(out).not.toContain('변경');
  for (const fn of Object.values(mockNative)) {
    expect(fn).not.toHaveBeenCalled();
  }
  await press(r, 'demo-back');
  expect(json(r)).toContain('위치 권한 허용하고 시작하기');
  expect(mockNative.requestAlways).not.toHaveBeenCalled();
});
