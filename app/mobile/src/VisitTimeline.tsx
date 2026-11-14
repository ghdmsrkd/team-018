import type { ReactElement } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import {
  formatClock,
  formatDuration,
  formatShortDateTime,
  groupByDay,
} from './format';
import { describeTag } from './TagPicker';
import { colors } from './theme';
import type { Visit } from './visitMonitor';

type RowProps = {
  visit: Visit;
  last: boolean;
  /** Passed only for stored visits; sample rows never get a tag control. */
  onTag?: () => void;
};

function stayText(v: Visit): string {
  const duration = formatDuration(v.arrivalAt, v.departureAt);
  if (duration) {
    return `머문 시간 ${duration}`;
  }
  if (v.departureAt == null) {
    return '출발 시각 미기록 (아직 머무는 중일 수 있어요)';
  }
  return '머문 시간 계산 불가 (도착 시각 미확인)';
}

function VisitRow({ visit, last, onTag }: RowProps) {
  const arrival =
    visit.arrivalAt == null ? '도착 시각 미확인' : formatClock(visit.arrivalAt);
  const departure =
    visit.departureAt == null ? '출발 미기록' : formatClock(visit.departureAt);
  return (
    <View style={styles.row}>
      <View
        style={styles.rail}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={[styles.dot, last ? styles.dotLast : styles.dotDefault]} />
        {last ? null : <View style={styles.railLine} />}
      </View>
      <View style={styles.card}>
        <Text style={styles.range}>
          {arrival} – {departure}
        </Text>
        <Text style={styles.stay}>{stayText(visit)}</Text>
        <Text style={styles.meta}>
          {`좌표 ${visit.latitude.toFixed(5)}, ${visit.longitude.toFixed(
            5,
          )} · 정확도 ±${visit.horizontalAccuracy.toFixed(0)} m`}
        </Text>
        <Text style={styles.meta}>
          수신 {formatShortDateTime(visit.receivedAt)}
        </Text>
        {onTag ? (
          <Pressable
            onPress={onTag}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.tagButton}
          >
            <Text style={styles.tagText}>{describeTag(visit)} · 변경</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

type Props = {
  visits: Visit[];
  /** Omit for sample rows. */
  onTag?: (visit: Visit) => void;
  header?: ReactElement;
};

/**
 * Date-grouped vertical timeline. Times and durations come only from each visit's own
 * arrival/departure. The list's automatic content inset applies the real iOS safe area.
 */
export function VisitTimeline({ visits, onTag, header }: Props) {
  return (
    <SectionList
      style={styles.list}
      contentInsetAdjustmentBehavior="automatic"
      stickySectionHeadersEnabled={false}
      sections={groupByDay(visits)}
      keyExtractor={v => String(v.id)}
      ListHeaderComponent={header}
      renderSectionHeader={({ section }) => (
        <Text style={styles.dateHeader} accessibilityRole="header">
          {section.title}
        </Text>
      )}
      renderItem={({ item, index, section }) => (
        <VisitRow
          visit={item}
          last={index === section.data.length - 1}
          onTag={onTag ? () => onTag(item) : undefined}
        />
      )}
      contentContainerStyle={styles.content}
    />
  );
}

const DOT = 12;

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 24 },
  dateHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  row: { flexDirection: 'row', paddingHorizontal: 20 },
  rail: { width: 24, alignItems: 'center' },
  dot: {
    marginTop: 18,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
  dotDefault: { backgroundColor: colors.blue },
  dotLast: { backgroundColor: colors.orange },
  railLine: { flex: 1, width: 2, marginTop: 4, backgroundColor: colors.line },
  card: {
    flex: 1,
    marginLeft: 8,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  range: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  stay: { marginTop: 4, fontSize: 15, color: colors.text },
  meta: { marginTop: 4, fontSize: 13, color: colors.muted },
  tagButton: { marginTop: 8, alignSelf: 'flex-start' },
  tagText: { fontSize: 15, color: colors.blue },
});
