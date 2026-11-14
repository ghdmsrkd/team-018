/**
 * @format
 */
import ReactTestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { Onboarding } from '../src/Onboarding';

let mockFontScale = 1;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: 393,
    height: 852,
    scale: 3,
    fontScale: mockFontScale,
  }),
}));

jest.mock('../src/safeArea', () => ({
  useWindowSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

async function mount() {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    r = ReactTestRenderer.create(
      <Onboarding onStart={() => {}} onDemo={() => {}} />,
    );
  });
  return r;
}

const insideScroll = (r: ReactTestRenderer.ReactTestRenderer, testID: string) =>
  r.root
    .findByType(require('react-native').ScrollView)
    .findAll(n => n.props.testID === testID).length > 0;

test('default text size: both buttons in a fixed footer padded by the real bottom inset', async () => {
  mockFontScale = 1;
  const r = await mount();
  const footer = r.root.findByProps({ testID: 'onboarding-footer' });
  expect(StyleSheet.flatten(footer.props.style).paddingBottom).toBe(34 + 16);
  expect(
    footer.findAll(n => n.props.testID === 'onboarding-start').length,
  ).toBeGreaterThan(0);
  expect(
    footer.findAll(n => n.props.testID === 'onboarding-demo').length,
  ).toBeGreaterThan(0);
  expect(insideScroll(r, 'onboarding-demo')).toBe(false);
  await ReactTestRenderer.act(async () => r.unmount());
});

test('large Dynamic Type: buttons scroll with the content', async () => {
  mockFontScale = 2;
  const r = await mount();
  expect(
    r.root.findAll(n => n.props.testID === 'onboarding-footer'),
  ).toHaveLength(0);
  expect(insideScroll(r, 'onboarding-start')).toBe(true);
  expect(insideScroll(r, 'onboarding-demo')).toBe(true);
  await ReactTestRenderer.act(async () => r.unmount());
});
