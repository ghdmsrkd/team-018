// Colors follow design/haru-mockup.html (TAG). Tags outside the mockup's names get a stable
// color from a fallback palette, so custom tags stay distinguishable.
export const UNTAGGED = '미분류';
export const UNTAGGED_COLOR = '#C9CEC6';
export const EMPTY_COLOR = '#E2E6DF';
export const FUTURE_COLOR = '#ECEFE9';

const KNOWN: Record<string, string> = {
  집: '#2B3138',
  회사: '#1F4FD1',
  밥집: '#E86A10',
  식당: '#E86A10',
  커피: '#9A6B47',
  카페: '#9A6B47',
  운동: '#2F8A5B',
  헬스장: '#2F8A5B',
  쇼핑: '#C2417A',
  마트: '#C2417A',
  백화점: '#C2417A',
  관광: '#D9A515',
};

const FALLBACK = [
  '#6B5CA5',
  '#3E8E9E',
  '#B07A2A',
  '#7A8F3A',
  '#A0525E',
  '#4E6E9E',
  '#8C6A9E',
  '#5A7F6B',
];

export function tagColor(tag: string): string {
  if (tag === UNTAGGED) {
    return UNTAGGED_COLOR;
  }
  const known = KNOWN[tag];
  if (known) {
    return known;
  }
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h * 31 + tag.charCodeAt(i)) % 2147483647;
  }
  return FALLBACK[h % FALLBACK.length];
}
