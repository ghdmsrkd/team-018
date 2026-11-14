import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { formatClock } from './format';
import { formatHM, Stay } from './summary';
import { tagColor } from './tagColors';
import { colors } from './theme';

const BOX = 300;
const PAD = 28;
const SPEEDS = [1, 2, 4];

type Point = { x: number; y: number; stay: Stay };

/**
 * Equirectangular projection of the stays' own coordinates into a square box. There is no
 * map underneath and no route data: lines between stops are straight, not real paths.
 */
export function project(stays: Stay[]): Point[] {
  const pts = stays.filter(
    s =>
      Number.isFinite(s.visit.latitude) &&
      Number.isFinite(s.visit.longitude) &&
      Math.abs(s.visit.latitude) <= 90 &&
      Math.abs(s.visit.longitude) <= 180,
  );
  if (pts.length === 0) {
    return [];
  }
  const lat0 =
    (pts.reduce((a, s) => a + s.visit.latitude, 0) / pts.length) *
    (Math.PI / 180);
  const xs = pts.map(s => s.visit.longitude * Math.cos(lat0));
  const ys = pts.map(s => s.visit.latitude);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1e-9);
  const inner = BOX - PAD * 2;
  return pts.map((stay, i) => ({
    stay,
    x:
      PAD +
      ((xs[i] - minX) / span) * inner +
      (inner - ((maxX - minX) / span) * inner) / 2,
    y:
      PAD +
      ((maxY - ys[i]) / span) * inner +
      (inner - ((maxY - minY) / span) * inner) / 2,
  }));
}

function Line({ a, b }: { a: Point; b: Point }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) {
    return null;
  }
  return (
    <View
      style={[
        styles.line,
        {
          left: (a.x + b.x) / 2 - len / 2,
          top: (a.y + b.y) / 2 - 1,
          width: len,
          transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
        },
      ]}
    />
  );
}

type Props = {
  title: string;
  stays: Stay[] | null;
  onClose: () => void;
};

export function ReplayView({ title, stays, onClose }: Props) {
  const points = useMemo(() => (stays ? project(stays) : []), [stays]);
  const [index, setIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(true);
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  useEffect(() => {
    setIndex(0);
    setPlaying(true);
    if (points[0]) {
      pos.setValue({ x: points[0].x, y: points[0].y });
    }
  }, [points, pos]);

  useEffect(() => {
    if (!playing || points.length === 0) {
      return;
    }
    const next = index + 1;
    if (next >= points.length) {
      setPlaying(false);
      return;
    }
    const anim = Animated.sequence([
      Animated.delay(1400 / speed),
      Animated.timing(pos, {
        toValue: { x: points[next].x, y: points[next].y },
        duration: 900 / speed,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      }),
    ]);
    anim.start(({ finished }) => finished && setIndex(next));
    return () => anim.stop();
  }, [playing, index, speed, points, pos]);

  if (!stays) {
    return null;
  }
  const cur = points[index]?.stay;
  const restart = () => {
    if (points[0]) {
      pos.setValue({ x: points[0].x, y: points[0].y });
    }
    setIndex(0);
    setPlaying(true);
  };

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">
            {title} 재생
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.link}>닫기</Text>
          </Pressable>
        </View>
        {points.length === 0 ? (
          <Text style={styles.note}>재생할 수 있는 좌표가 없어요.</Text>
        ) : (
          <>
            <View
              style={styles.box}
              accessible
              accessibilityLabel={`${points.length}곳 중 ${index + 1}번째, ${
                cur
                  ? `${cur.tag} ${
                      cur.start != null ? formatClock(cur.start) : ''
                    }`
                  : ''
              }`}
            >
              {points.slice(1).map((p, i) => (
                <Line key={`l${i}`} a={points[i]} b={p} />
              ))}
              {points.map((p, i) => (
                <View
                  key={p.stay.visit.id}
                  style={[
                    styles.stop,
                    {
                      left: p.x - 7,
                      top: p.y - 7,
                      backgroundColor: tagColor(p.stay.tag),
                    },
                    i > index && styles.upcoming,
                  ]}
                />
              ))}
              <Animated.View
                style={[
                  styles.mover,
                  {
                    transform: [
                      { translateX: Animated.subtract(pos.x, 9) },
                      { translateY: Animated.subtract(pos.y, 9) },
                    ],
                  },
                ]}
              />
            </View>
            {cur ? (
              <View style={styles.label}>
                <Text style={styles.labelTitle}>
                  {index + 1}/{points.length} ·{' '}
                  {cur.visit.placeName ? `${cur.visit.placeName} · ` : ''}
                  {cur.tag}
                </Text>
                <Text style={styles.labelBody}>
                  {cur.start != null ? formatClock(cur.start) : '도착 미확인'}
                  {cur.status === 'ongoing'
                    ? ' · 머무는 중'
                    : cur.status === 'complete' &&
                      cur.start != null &&
                      cur.end != null
                    ? ` – ${formatClock(cur.end)} · ${formatHM(
                        cur.end - cur.start,
                      )}`
                    : ' · 출발 미기록'}
                </Text>
              </View>
            ) : null}
            <View style={styles.controls}>
              <Pressable
                onPress={() =>
                  index >= points.length - 1 ? restart() : setPlaying(p => !p)
                }
                accessibilityRole="button"
                style={styles.play}
              >
                <Text style={styles.playText}>
                  {index >= points.length - 1
                    ? '처음부터'
                    : playing
                    ? '일시정지'
                    : '재생'}
                </Text>
              </Pressable>
              {SPEEDS.map(s => (
                <Pressable
                  key={s}
                  onPress={() => setSpeed(s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: speed === s }}
                  style={[styles.speed, speed === s && styles.speedOn]}
                >
                  <Text
                    style={[
                      styles.speedText,
                      speed === s && styles.speedTextOn,
                    ]}
                  >
                    {s}x
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.note}>
              지도 없이 방문 좌표의 상대 위치만 보여 줘요. 방문 사이 선은
              직선이며 실제 이동 경로가 아니에요.
            </Text>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.background, padding: 20 },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  link: { fontSize: 16, color: colors.blue, fontWeight: '600' },
  box: {
    width: BOX,
    height: BOX,
    alignSelf: 'center',
    marginTop: 20,
    borderRadius: 18,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  line: { position: 'absolute', height: 2, backgroundColor: colors.line },
  stop: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  upcoming: { opacity: 0.35 },
  mover: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.orange,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  label: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  labelTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  labelBody: { marginTop: 4, fontSize: 14, color: colors.text },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  play: {
    paddingHorizontal: 16,
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: colors.ink,
    justifyContent: 'center',
  },
  playText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  speed: {
    minWidth: 44,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  speedOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  speedText: { fontSize: 13, color: colors.ink },
  speedTextOn: { color: '#FFFFFF', fontWeight: '700' },
  note: { marginTop: 16, fontSize: 13, lineHeight: 19, color: colors.muted },
});
