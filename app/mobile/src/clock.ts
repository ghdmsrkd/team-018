/** Wall clock used by the summary screens. Separate so tests can fix "now". */
export const clock = {
  now: (): number => Date.now(),
};
