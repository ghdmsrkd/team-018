import { memo, ReactNode } from 'react';
import { GestureResponderEvent, StyleSheet, View } from 'react-native';
import { colors } from './theme';

export type Tick = { color: string; dim?: boolean };

type Props = {
  size: number;
  thickness: number;
  /** Equal-angle ticks clockwise from 12 o'clock. */
  ticks: Tick[];
  /** Fraction 0..1 clockwise from the top for the orange "now" dot. */
  dot?: number | null;
  /** Called with the tick index under a tap on the ring band. */
  onPressTick?: (index: number) => void;
  labels?: { text: ReactNode; fraction: number }[];
  children?: ReactNode;
  accessibilityLabel?: string;
};

/**
 * A ring drawn with React Native views only (no SVG dependency): each tick is a short bar
 * rotated around the center. Arcs are therefore quantized to 360 / ticks.length degrees,
 * e.g. 5 minutes per tick on the 24-hour ring.
 */
export const Ring = memo(function RingView({
  size,
  thickness,
  ticks,
  dot,
  onPressTick,
  labels,
  children,
  accessibilityLabel,
}: Props) {
  const c = size / 2;
  const r = c - thickness / 2;
  const n = Math.max(1, ticks.length);
  const barWidth = (2 * Math.PI * r) / n + 0.8;

  const onRelease = (e: GestureResponderEvent) => {
    if (!onPressTick) {
      return;
    }
    const x = e.nativeEvent.locationX - c;
    const y = e.nativeEvent.locationY - c;
    const dist = Math.sqrt(x * x + y * y);
    if (dist < r - thickness / 2 - 8 || dist > r + thickness / 2 + 8) {
      return;
    }
    let a = Math.atan2(x, -y);
    if (a < 0) {
      a += 2 * Math.PI;
    }
    onPressTick(Math.min(n - 1, Math.floor((a / (2 * Math.PI)) * n)));
  };

  return (
    <View
      style={{ width: size, height: size }}
      accessible={accessibilityLabel != null}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {ticks.map((t, i) => (
          <View
            key={i}
            style={[
              StyleSheet.absoluteFill,
              { transform: [{ rotate: `${((i + 0.5) / n) * 360}deg` }] },
            ]}
          >
            <View
              style={[
                styles.bar,
                {
                  left: c - barWidth / 2,
                  width: barWidth,
                  height: thickness,
                  backgroundColor: t.color,
                },
                t.dim && styles.dim,
              ]}
            />
          </View>
        ))}
        {labels?.map((l, i) => {
          const a = l.fraction * 2 * Math.PI;
          const lr = r - thickness / 2 - 12;
          return (
            <View
              key={`l${i}`}
              style={[
                styles.label,
                {
                  left: c + lr * Math.sin(a) - 14,
                  top: c - lr * Math.cos(a) - 8,
                },
              ]}
            >
              {l.text}
            </View>
          );
        })}
        {dot != null ? (
          <View
            style={[
              styles.dot,
              {
                left: c + r * Math.sin(dot * 2 * Math.PI) - 8,
                top: c - r * Math.cos(dot * 2 * Math.PI) - 8,
              },
            ]}
          />
        ) : null}
      </View>
      <View
        style={[
          styles.center,
          {
            top: thickness + 4,
            left: thickness + 4,
            right: thickness + 4,
            bottom: thickness + 4,
          },
        ]}
        pointerEvents="box-none"
      >
        {children}
      </View>
      {onPressTick ? (
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onResponderRelease={onRelease}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0 },
  dim: { opacity: 0.28 },
  label: { position: 'absolute', width: 28, height: 16, alignItems: 'center' },
  dot: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.orange,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
