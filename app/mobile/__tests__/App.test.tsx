/**
 * @format
 */
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('shows an honest unsupported message when the native module is absent', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const json = JSON.stringify(renderer.toJSON());
  expect(json).toContain('only available on iOS');
});
