import {
  ComponentRef,
  ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  addDays,
  clockMinutes,
  Period,
  periodEyebrow,
  periodRange,
  periodTitle,
  previousRange,
  Range,
  startOfDay,
  weekdayShort,
} from './calendar';
import type { DataSource } from './dataSource';
import { formatClock } from './format';
import { Ring, Tick } from './Ring';
import {
  deltas,
  formatHM,
  normalizeVisits,
  perDay,
  PeriodSummary,
  Segment,
  summarize,
  TagTotal,
} from './summary';
import { EMPTY_COLOR, FUTURE_COLOR, tagColor, UNTAGGED } from './tagColors';
import { colors } from './theme';
import type { Visit } from './visitMonitor';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: '하루' },
  { key: 'week', label: '한 주' },
  { key: 'month', label: '한 달' },
  { key: 'year', label: '1년' },
];

const DELTA_CAPTION: Record<Period, string> = {
  day: '▲▼ 어제 대비',
  week: '▲▼ 지난주 대비',
  month: '▲▼ 지난달 대비',
  year: '▲▼ 작년 대비',
};

const DAY_TICKS = 288; // 5 minutes each
const SHARE_TICKS = 180; // 2 degrees each
const MINI_TICKS = 48;
const RING = 290;
const THICK = 36;

type Props = {
  source: DataSource;
  /** Bumped by the parent when stored data changed (new visit, tag edit). */
  refreshToken: number;
  /** Only for live data: open the tag sheet for a stored visit. */
  onTagVisit?: (visit: Visit) => void;
  recording?: boolean;
  notice?: ReactElement | null;
};

/** Wall-clock minute span of a segment within its local day; end of day = 1440. */
function minuteSpan(seg: Segment, range: Range): [number, number] | null {
  const a = clockMinutes(seg.start);
  const b = seg.end >= range.to ? 1440 : clockMinutes(seg.end);
  return b > a ? [a, b] : null;
}

function dayTicks(
  summary: PeriodSummary,
  range: Range,
  now: number,
  selected: string | null,
): Tick[] {
  const nowMin =
    now >= range.to ? 1440 : now < range.from ? 0 : clockMinutes(now);
  const spans = summary.segments
    .map(s => ({ tag: s.tag, span: minuteSpan(s, range) }))
    .filter(s => s.span != null) as { tag: string; span: [number, number] }[];
  return Array.from({ length: DAY_TICKS }, (_, i) => {
    const mid = ((i + 0.5) * 1440) / DAY_TICKS;
    if (mid > nowMin) {
      return { color: i % 2 ? FUTURE_COLOR : EMPTY_COLOR };
    }
    const hit = spans.find(s => s.span[0] <= mid && mid < s.span[1]);
    if (!hit) {
      return { color: EMPTY_COLOR };
    }
    return {
      color: tagColor(hit.tag),
      dim: selected != null && hit.tag !== selected,
    };
  });
}

function shareTicks(
  totals: TagTotal[],
  count: number,
  selected: string | null,
): { ticks: Tick[]; tags: (string | null)[] } {
  const sum = totals.reduce((a, t) => a + t.ms, 0);
  if (sum <= 0) {
    return {
      ticks: Array.from({ length: count }, () => ({ color: EMPTY_COLOR })),
      tags: Array.from({ length: count }, () => null),
    };
  }
  const tags: (string | null)[] = [];
  let acc = 0;
  let k = 0;
  for (let i = 0; i < count; i++) {
    const f = (i + 0.5) / count;
    while (k < totals.length - 1 && f > (acc + totals[k].ms) / sum) {
      acc += totals[k].ms;
      k++;
    }
    tags.push(totals[k].tag);
  }
  return {
    tags,
    ticks: tags.map(t => ({
      color: tagColor(t!),
      dim: selected != null && t !== selected,
    })),
  };
}

function Delta({ value }: { value: number | null | undefined }) {
  if (value == null || value === 0) {
    return null;
  }
  return (
    <Text style={[styles.delta, value > 0 ? styles.up : styles.down]}>
      {value > 0 ? '▲' : '▼'} {Math.abs(value)}%
    </Text>
  );
}

function DateStrip({
  days,
  selected,
  today,
  onSelect,
}: {
  days: number[];
  selected: number;
  today: number;
  onSelect: (d: number) => void;
}) {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.dates}
      onContentSizeChange={() => ref.current?.scrollToEnd({ animated: false })}
    >
      {days.map(d => {
        const on = d === selected;
        const date = new Date(d);
        return (
          <Pressable
            key={d}
            testID={`date-${d}`}
            onPress={() => onSelect(d)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${
              date.getMonth() + 1
            }월 ${date.getDate()}일 ${weekdayShort(d)}요일${
              d === today ? ', 오늘' : ''
            }`}
            style={[styles.date, on && styles.dateOn]}
          >
            <Text style={[styles.dateDow, on && styles.dateDowOn]}>
              {d === today ? '오늘' : weekdayShort(d)}
            </Text>
            <Text style={[styles.dateNum, on && styles.dateNumOn]}>
              {date.getDate()}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function TodayScreen({
  source,
  refreshToken,
  onTagVisit,
  recording,
  notice,
}: Props) {
  const [period, setPeriod] = useState<Period>('day');
  const [anchor, setAnchor] = useState(() => startOfDay(source.initialDay()));
  const [selected, setSelected] = useState<string | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const now = source.now();
  const range = useMemo(() => periodRange(period, anchor), [period, anchor]);
  const prev = useMemo(
    () => previousRange(period, range.from),
    [period, range],
  );

  useEffect(() => {
    let alive = true;
    source
      .visitsInRange(prev.from, range.to)
      .then(v => {
        if (alive) {
          setVisits(v);
          setError(null);
          setLoaded(true);
        }
      })
      .catch(e => alive && setError(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
    // prev/range derive from period and anchor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, period, anchor, refreshToken]);

  useEffect(() => setSelected(null), [period, anchor]);

  const stays = useMemo(() => normalizeVisits(visits, now), [visits, now]);
  const cur = useMemo(() => summarize(stays, range, now), [stays, range, now]);
  const before = useMemo(() => summarize(stays, prev, now), [stays, prev, now]);
  const change = deltas(cur.totals, before.totals);

  const today = startOfDay(now);
  const stripDays = useMemo(() => {
    const last =
      source.kind === 'demo'
        ? addDays(startOfDay(source.initialDay()), 3)
        : today;
    return Array.from({ length: 21 }, (_, i) => addDays(last, i - 20));
  }, [source, today]);

  const isDay = period === 'day';
  const share = isDay ? null : shareTicks(cur.totals, SHARE_TICKS, selected);
  const ticks = isDay ? dayTicks(cur, range, now, selected) : share!.ticks;
  const toggle = (tag: string | null) =>
    setSelected(s => (tag == null || s === tag ? null : tag));

  const onPressTick = (i: number) => {
    if (!isDay) {
      toggle(share!.tags[i]);
      return;
    }
    const mid = ((i + 0.5) * 1440) / DAY_TICKS;
    const seg = cur.segments.find(s => {
      const span = minuteSpan(s, range);
      return span != null && span[0] <= mid && mid < span[1];
    });
    toggle(seg?.tag ?? null);
  };

  const sum = cur.trackedMs;
  const pct = (ms: number) => (sum > 0 ? Math.round((ms / sum) * 100) : 0);
  const dotFraction =
    isDay && now >= range.from && now < range.to
      ? clockMinutes(now) / 1440
      : null;

  let centerKey: string;
  let centerValue: string;
  let centerSub: string | null = null;
  let centerColor: string | null = null;
  const sel = selected ? cur.totals.find(t => t.tag === selected) : null;
  if (sel) {
    centerKey = sel.tag;
    centerColor = tagColor(sel.tag);
    centerValue = formatHM(sel.ms);
    if (isDay) {
      const spans = cur.segments
        .filter(s => s.tag === sel.tag)
        .map(
          s =>
            `${formatClock(s.start)}–${
              s.end >= range.to ? '24:00' : formatClock(s.end)
            }`,
        );
      centerSub =
        spans.slice(0, 2).join(', ') +
        (spans.length > 2 ? ` 외 ${spans.length - 2}` : '');
    } else {
      const n = cur.stays.filter(s => s.tag === sel.tag).length;
      centerSub = `${pct(sel.ms)}% · 방문 ${n}번`;
    }
  } else if (isDay && cur.current && cur.current.start != null) {
    centerKey = `지금 · ${cur.current.tag}`;
    centerColor = tagColor(cur.current.tag);
    centerValue = formatHM(now - cur.current.start);
    centerSub = `${formatClock(cur.current.start)}부터 머무는 중`;
  } else if (sum > 0) {
    centerKey = '기록된 시간';
    centerValue = formatHM(sum);
  } else {
    centerKey = loaded ? '기록 없음' : '불러오는 중';
    centerValue = '–';
    centerSub = loaded
      ? range.from > now
        ? '아직 오지 않은 날이에요'
        : '이 기간에 시간이 확인된 방문이 없어요'
      : null;
  }

  const ringLabel = sel
    ? `${centerKey} ${centerValue}${centerSub ? `, ${centerSub}` : ''}`
    : `${periodTitle(period, range)} ${
        cur.totals
          .map(t => `${t.tag} ${isDay ? formatHM(t.ms) : `${pct(t.ms)}%`}`)
          .join(', ') || '기록 없음'
      }`;

  const max = cur.totals[0]?.ms ?? 1;

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      {notice}
      <View style={styles.top}>
        <View>
          <Text style={styles.eyebrow}>{periodEyebrow(period, range)}</Text>
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">
              {periodTitle(period, range)}
            </Text>
            {isDay && range.from === today ? (
              <Text style={styles.titleSub}>오늘</Text>
            ) : null}
          </View>
        </View>
        {source.kind === 'demo' ? (
          <Text style={styles.sample}>샘플</Text>
        ) : recording ? (
          <View style={styles.live} accessible accessibilityLabel="기록 중">
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>기록 중</Text>
          </View>
        ) : null}
      </View>

      <DateStrip
        days={stripDays}
        selected={anchor}
        today={today}
        onSelect={d => setAnchor(d)}
      />

      <View style={styles.tabs} accessibilityRole="tablist">
        {PERIODS.map(p => (
          <Pressable
            key={p.key}
            testID={`period-${p.key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: period === p.key }}
            onPress={() => setPeriod(p.key)}
            style={[styles.tab, period === p.key && styles.tabOn]}
          >
            <Text
              style={[styles.tabText, period === p.key && styles.tabTextOn]}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.ringWrap}>
        <Ring
          size={RING}
          thickness={THICK}
          ticks={ticks}
          dot={dotFraction}
          onPressTick={onPressTick}
          accessibilityLabel={ringLabel}
          labels={
            isDay
              ? [0, 6, 12, 18].map(h => ({
                  fraction: h / 24,
                  text: <Text style={styles.hour}>{h}</Text>,
                }))
              : undefined
          }
        >
          <View style={styles.centerKeyRow}>
            {centerColor ? (
              <View style={[styles.swatch, { backgroundColor: centerColor }]} />
            ) : null}
            <Text style={styles.centerKey} numberOfLines={1}>
              {centerKey}
            </Text>
          </View>
          <Text style={styles.centerValue}>{centerValue}</Text>
          {centerSub ? (
            <Text style={styles.centerSub} numberOfLines={3}>
              {centerSub}
            </Text>
          ) : null}
        </Ring>
      </View>
      <Text style={styles.hint}>
        {isDay
          ? `0시가 맨 위 · 시계 방향${
              dotFraction != null ? ' · 주황 점이 지금' : ''
            }`
          : '태그별 비중 · 시간이 확인된 방문 기준'}
      </Text>
      {error ? <Text style={styles.error}>오류: {error}</Text> : null}

      {cur.totals.length > 0 ? (
        <>
          <View style={styles.cap}>
            <Text style={styles.capText}>태그별 시간</Text>
            <Text style={styles.capText}>{DELTA_CAPTION[period]}</Text>
          </View>
          <View style={styles.card}>
            {cur.totals.map((t, i) => (
              <Pressable
                key={t.tag}
                testID={`legend-${t.tag}`}
                onPress={() => toggle(t.tag)}
                accessibilityRole="button"
                accessibilityState={{ selected: selected === t.tag }}
                style={[
                  styles.row,
                  i > 0 && styles.rowBorder,
                  selected != null && selected !== t.tag && styles.rowDim,
                ]}
              >
                <View style={styles.rowTop}>
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: tagColor(t.tag) },
                      t.tag === UNTAGGED && styles.swatchNone,
                    ]}
                  />
                  <Text style={styles.rowName}>{t.tag}</Text>
                  <Delta value={change[t.tag]} />
                  <View style={styles.flex} />
                  <Text style={styles.rowValue}>
                    {isDay
                      ? formatHM(t.ms)
                      : `${pct(t.ms)}% · ${formatHM(t.ms)}`}
                  </Text>
                </View>
                <View style={styles.meter}>
                  <View
                    style={[
                      styles.meterFill,
                      {
                        width: `${Math.max(2, (t.ms / max) * 100)}%`,
                        backgroundColor: tagColor(t.tag),
                      },
                    ]}
                  />
                </View>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <View style={[styles.card, styles.stats]}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{cur.visitCount}</Text>
          <Text style={styles.statLabel}>방문</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {cur.firstArrival != null ? formatClock(cur.firstArrival) : '–'}
          </Text>
          <Text style={styles.statLabel}>
            {isDay ? '첫 방문' : '가장 이른 도착'}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{cur.unknownCount}</Text>
          <Text style={styles.statLabel}>시간 미확인</Text>
        </View>
      </View>

      {isDay ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>머문 곳</Text>
          {cur.stays.length === 0 ? (
            <Text style={styles.emptyText}>
              {range.from > now
                ? '아직 오지 않은 날이에요.'
                : '이 날 기록된 방문이 없어요.'}
            </Text>
          ) : (
            cur.stays.map(s => {
              const open = s.status === 'ongoing';
              const right = open
                ? '지금'
                : s.status === 'complete' && s.start != null && s.end != null
                ? formatHM(s.end - s.start)
                : s.status === 'invalid'
                ? '시간 오류'
                : '종료 미상';
              // Live: stored rows only. Demo: the in-memory sample rows.
              const canTag =
                onTagVisit != null &&
                (source.kind === 'demo' || s.visit.id > 0);
              return (
                <View key={s.visit.id} style={styles.stay}>
                  <Text style={styles.stayTime}>
                    {s.start != null ? formatClock(s.start) : '미확인'}
                  </Text>
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: tagColor(s.tag) },
                      s.tag === UNTAGGED && styles.swatchNone,
                    ]}
                  />
                  {canTag ? (
                    <Pressable
                      style={styles.flex}
                      onPress={() => onTagVisit!(s.visit)}
                      accessibilityRole="button"
                      accessibilityHint="태그를 바꿔요"
                    >
                      <Text style={styles.stayName}>
                        {s.visit.placeName ? `${s.visit.placeName} · ` : ''}
                        {s.tag}
                        {s.tag === UNTAGGED ? (
                          <Text style={styles.tagCta}> 태그 달기</Text>
                        ) : null}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={[styles.stayName, styles.flex]}>
                      {s.visit.placeName ? `${s.visit.placeName} · ` : ''}
                      {s.tag}
                    </Text>
                  )}
                  <Text style={[styles.stayRight, open && styles.now]}>
                    {right}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      ) : null}

      {period === 'week' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>요일별 하루</Text>
          <View style={styles.minis}>
            {perDay(stays, range, now).map(d => {
              const sh = shareTicks(d.totals, MINI_TICKS, selected);
              return (
                <Pressable
                  key={d.dayStart}
                  style={styles.mini}
                  onPress={() => {
                    setAnchor(d.dayStart);
                    setPeriod('day');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${weekdayShort(d.dayStart)}요일 ${
                    d.totals
                      .map(t => `${t.tag} ${formatHM(t.ms)}`)
                      .join(', ') || '기록 없음'
                  }`}
                >
                  <Ring size={40} thickness={7} ticks={sh.ticks} />
                  <Text
                    style={[
                      styles.miniLabel,
                      d.dayStart === today && styles.miniToday,
                    ]}
                  >
                    {weekdayShort(d.dayStart)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 24 },
  top: {
    paddingHorizontal: 20,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  eyebrow: { fontSize: 11, letterSpacing: 1, color: colors.muted },
  titleRow: { flexDirection: 'row', alignItems: 'baseline' },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  titleSub: { marginLeft: 8, fontSize: 15, color: colors.muted },
  live: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.orange,
    marginRight: 6,
  },
  liveText: { fontSize: 12, fontWeight: '600', color: '#A8480A' },
  sample: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    paddingBottom: 6,
  },
  dates: { paddingHorizontal: 20, paddingTop: 14, gap: 6 },
  date: {
    width: 46,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D5D9D3',
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  dateOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  dateDow: { fontSize: 11, color: colors.muted },
  dateDowOn: { color: '#C9CEC6' },
  dateNum: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  dateNumOn: { color: '#FFFFFF' },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 14,
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#E2E6DF',
  },
  tab: {
    flex: 1,
    minHeight: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: { backgroundColor: colors.card },
  tabText: { fontSize: 13, fontWeight: '500', color: colors.muted },
  tabTextOn: { color: colors.ink, fontWeight: '700' },
  ringWrap: { alignItems: 'center', marginTop: 16 },
  hour: { fontSize: 10, color: colors.muted, fontVariant: ['tabular-nums'] },
  centerKeyRow: { flexDirection: 'row', alignItems: 'center', maxWidth: 170 },
  centerKey: { fontSize: 13, color: colors.muted },
  centerValue: {
    marginTop: 4,
    fontSize: 40,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  centerSub: {
    marginTop: 4,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 160,
  },
  hint: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.muted,
    marginTop: 8,
  },
  error: { marginHorizontal: 20, marginTop: 8, color: colors.danger },
  cap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 24,
    marginTop: 16,
  },
  capText: { fontSize: 12, color: colors.muted },
  card: {
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D5D9D3',
    paddingVertical: 4,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  row: { paddingHorizontal: 16, paddingVertical: 12 },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ECEEEA',
  },
  rowDim: { opacity: 0.4 },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  rowName: {
    marginLeft: 10,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  rowValue: { fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
  delta: { marginLeft: 6, fontSize: 11, fontWeight: '600' },
  up: { color: '#2F8A5B' },
  down: { color: '#B5452E' },
  meter: {
    marginTop: 8,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ECEEEA',
    overflow: 'hidden',
  },
  meterFill: { height: 4, borderRadius: 2 },
  swatch: { width: 12, height: 12, borderRadius: 4, marginRight: 6 },
  swatchNone: { borderWidth: 1, borderColor: '#8A939B', borderStyle: 'dashed' },
  stats: { flexDirection: 'row', paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  statLabel: { marginTop: 2, fontSize: 12, color: colors.muted },
  emptyText: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    fontSize: 14,
    color: colors.muted,
  },
  stay: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  stayTime: {
    width: 56,
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  stayName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  tagCta: { fontSize: 12, fontWeight: '500', color: colors.blue },
  stayRight: { marginLeft: 8, fontSize: 12, color: colors.muted },
  now: { color: '#A8480A', fontWeight: '600' },
  minis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  mini: { alignItems: 'center' },
  miniLabel: { marginTop: 4, fontSize: 11, color: colors.muted },
  miniToday: { color: colors.ink, fontWeight: '700' },
});
