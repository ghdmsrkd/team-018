import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useWindowSafeAreaInsets } from './safeArea';
import { colors } from './theme';

type Props = {
  onStart: () => void;
  onDemo: () => void;
};

// Illustration only. These are not records and no times or places are read from the device.
const EXAMPLE_DAY = [
  { time: '08:10', label: '집' },
  { time: '09:02', label: '카페' },
  { time: '09:40', label: '회사' },
  { time: '19:30', label: '저녁 약속' },
];

const INFO = [
  {
    icon: 'pin',
    title: '머문 곳을 알아서 기록해요',
    body: 'iPhone이 방문을 감지하면 도착·출발 시각과 좌표를 남겨요. 위치 권한을 "항상"으로 두면 앱을 열지 않아도 기록돼요.',
  },
  {
    icon: 'clock',
    title: '날짜별 타임라인',
    body: '도착·출발 시각이 모두 있으면 머문 시간을 보여 줘요. iOS가 방문을 알려 주기까지 시간이 걸릴 수 있어요.',
  },
  {
    icon: 'tag',
    title: '장소 태그',
    body: '기록에 집, 회사 같은 태그를 직접 붙이면 50m 안의 다음 방문에도 같은 태그가 붙어요.',
  },
  {
    icon: 'phone',
    title: '이 iPhone에만 저장',
    body: '기록은 서버로 보내지 않고 이 기기에 저장해요.',
  },
] as const;

function Icon({ kind }: { kind: (typeof INFO)[number]['icon'] }) {
  return (
    <View
      style={styles.iconBox}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {kind === 'pin' ? (
        <View style={styles.ring}>
          <View style={styles.ringDot} />
        </View>
      ) : kind === 'clock' ? (
        <View style={styles.ring}>
          <View style={styles.handV} />
          <View style={styles.handH} />
        </View>
      ) : kind === 'tag' ? (
        <View style={styles.tagShape}>
          <View style={styles.tagHole} />
        </View>
      ) : (
        <View style={styles.phone} />
      )}
    </View>
  );
}

function ExampleTimeline() {
  const label = `예시 하루: ${EXAMPLE_DAY.map(s => `${s.time} ${s.label}`).join(
    ', ',
  )}`;
  return (
    <View style={styles.timeline} accessible accessibilityLabel={label}>
      <View style={styles.track}>
        <View style={styles.trackGray} />
        <View style={styles.trackBlue} />
      </View>
      <View style={styles.stops}>
        {EXAMPLE_DAY.map((stop, i) => {
          const last = i === EXAMPLE_DAY.length - 1;
          return (
            <View key={stop.time} style={styles.stop}>
              <View
                style={[
                  styles.stopDot,
                  last ? styles.dotOrange : styles.dotBlue,
                ]}
              />
              <Text style={styles.stopTime}>{stop.time}</Text>
              <Text style={styles.stopLabel}>{stop.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * First screen of every cold UI launch. Never requests permission by itself: the primary
 * button is the only path that asks iOS for Always, and the secondary button opens a
 * demo that touches no native APIs.
 */
/** Above this Dynamic Type scale the buttons scroll with the content instead of staying fixed. */
const FIXED_FOOTER_MAX_FONT_SCALE = 1.3;

export function Onboarding({ onStart, onDemo }: Props) {
  const { fontScale } = useWindowDimensions();
  const insets = useWindowSafeAreaInsets();
  const fixedFooter = fontScale <= FIXED_FOOTER_MAX_FONT_SCALE;

  const actions = (
    <View style={styles.actions}>
      <Pressable
        testID="onboarding-start"
        accessibilityRole="button"
        accessibilityHint='iOS 위치 권한 창이 열려요. 방문을 기록하려면 "항상"이 필요해요.'
        onPress={onStart}
        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
      >
        <Text style={styles.primaryText}>위치 권한 허용하고 시작하기</Text>
      </Pressable>
      <Pressable
        testID="onboarding-demo"
        accessibilityRole="button"
        accessibilityHint="권한을 요청하지 않고 저장되지 않는 샘플 기록을 보여 줘요."
        onPress={onDemo}
        style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
      >
        <Text style={styles.secondaryText}>샘플 하루로 먼저 둘러보기</Text>
      </Pressable>
    </View>
  );

  // Top inset: the ScrollView's automatic content inset adjustment (UIKit) keeps content
  // below the status bar / Dynamic Island. With a fixed footer the ScrollView ends above it,
  // so UIKit adds no bottom inset there, and the footer pads itself with the window's real
  // bottom inset so both buttons sit above the home indicator. With large text the buttons
  // scroll with the content and the ScrollView's automatic bottom inset clears the indicator.
  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <Text style={styles.wordmark} accessibilityLabel="HARU">
          HARU
        </Text>
        <ExampleTimeline />
        <Text
          style={styles.title}
          accessibilityRole="header"
          accessibilityLabel="적지 않아도 하루가 남아요"
        >
          {'적지 않아도\n하루가 남아요'}
        </Text>
        <Text style={styles.lead}>
          지금 이 버전은 iPhone이 알려 주는 방문 기록을 이 기기에 모아 하루를
          보여 줘요.
        </Text>
        <View style={styles.info}>
          {INFO.map(item => (
            <View
              key={item.title}
              style={styles.infoRow}
              accessible
              accessibilityLabel={`${item.title}. ${item.body}`}
            >
              <Icon kind={item.icon} />
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>{item.title}</Text>
                <Text style={styles.infoBody}>{item.body}</Text>
              </View>
            </View>
          ))}
        </View>
        {fixedFooter ? null : actions}
      </ScrollView>
      {fixedFooter ? (
        <View
          testID="onboarding-footer"
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + FOOTER_BOTTOM_GAP,
              paddingLeft: insets.left + 24,
              paddingRight: insets.right + 24,
            },
          ]}
        >
          {actions}
        </View>
      ) : null}
    </View>
  );
}

const FOOTER_BOTTOM_GAP = 16;

const DOT = 12;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
  },
  footer: {
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  wordmark: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 4,
    color: colors.ink,
  },
  timeline: { marginTop: 32, marginBottom: 28 },
  track: {
    position: 'absolute',
    top: DOT / 2 - 1,
    left: '12.5%',
    right: '12.5%',
    height: 2,
  },
  trackGray: { ...StyleSheet.absoluteFill, backgroundColor: colors.line },
  // From the first stop (집) to the third (회사): two of three gaps.
  trackBlue: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '66.67%',
    backgroundColor: colors.blue,
  },
  stops: { flexDirection: 'row' },
  stop: { flex: 1, alignItems: 'center' },
  stopDot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    borderColor: colors.background,
  },
  dotBlue: { backgroundColor: colors.blue },
  dotOrange: { backgroundColor: colors.orange },
  stopTime: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  stopLabel: {
    marginTop: 2,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  title: {
    fontSize: 32,
    lineHeight: 42,
    fontWeight: '800',
    color: colors.ink,
  },
  lead: { marginTop: 12, fontSize: 16, lineHeight: 24, color: colors.text },
  info: { marginTop: 24 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  infoText: { flex: 1, marginLeft: 12 },
  infoTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  infoBody: { marginTop: 2, fontSize: 14, lineHeight: 20, color: colors.muted },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink,
  },
  handV: {
    position: 'absolute',
    width: 2,
    height: 5,
    top: 2,
    left: 5,
    backgroundColor: colors.ink,
  },
  handH: {
    position: 'absolute',
    width: 4,
    height: 2,
    top: 6,
    left: 5,
    backgroundColor: colors.ink,
  },
  tagShape: {
    width: 16,
    height: 12,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: colors.ink,
    justifyContent: 'center',
    paddingLeft: 2,
  },
  tagHole: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.ink,
  },
  phone: {
    width: 11,
    height: 17,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  actions: { marginTop: 4 },
  primary: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  secondary: {
    marginTop: 10,
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  secondaryText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'center',
  },
  pressed: { opacity: 0.7 },
});
