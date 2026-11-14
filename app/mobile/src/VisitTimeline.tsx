import type { ReactElement } from 'react';
import {
  Image,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEffect, useState } from 'react';
import { formatVideoDuration, MediaAsset, photos } from './media';
import {
  formatClock,
  formatDuration,
  formatShortDateTime,
  groupByDay,
} from './format';
import { describeTag } from './TagPicker';
import { colors } from './theme';
import type { Visit } from './visitMonitor';

/** Loads a cached thumbnail file for a library asset. */
export function MediaThumb({
  asset,
  size,
  style,
}: {
  asset: MediaAsset;
  size: number;
  style?: object;
}) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (asset.source != null) {
      return;
    }
    let alive = true;
    photos
      .getThumbnail(asset.id, size)
      .then(u => alive && setUri(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [asset.id, asset.source, size]);
  return (
    <View style={[styles.thumb, style]}>
      {asset.source != null ? (
        <Image source={asset.source} style={StyleSheet.absoluteFill} />
      ) : uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} />
      ) : null}
      {asset.sample ? <Text style={styles.sampleBadge}>샘플</Text> : null}
      {asset.mediaType === 'video' ? (
        <Text style={styles.videoBadge}>
          ▶ {formatVideoDuration(asset.duration)}
        </Text>
      ) : null}
    </View>
  );
}

function MediaRow({
  media,
  onOpen,
}: {
  media: MediaAsset[];
  onOpen: (asset: MediaAsset, list: MediaAsset[]) => void;
}) {
  const shown = media.slice(0, 3);
  const extra = media.length - shown.length;
  return (
    <View style={styles.media}>
      {shown.map((a, i) => (
        <Pressable
          key={a.id}
          style={styles.mediaCell}
          onPress={() => onOpen(a, media)}
          accessibilityRole="imagebutton"
          accessibilityLabel={`${
            a.mediaType === 'video'
              ? `영상 ${formatVideoDuration(a.duration)}`
              : '사진'
          }, ${formatClock(a.createdAt)} 촬영, 크게 보기`}
        >
          <MediaThumb asset={a} size={300} style={styles.mediaFill} />
          {i === shown.length - 1 && extra > 0 ? (
            <View style={styles.more}>
              <Text style={styles.moreText}>+{extra}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

type RowProps = {
  visit: Visit;
  last: boolean;
  media?: MediaAsset[];
  onOpenMedia?: (asset: MediaAsset, list: MediaAsset[]) => void;
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

function VisitRow({ visit, last, onTag, media, onOpenMedia }: RowProps) {
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
        {visit.placeName ? (
          <Text style={styles.placeName}>
            {visit.placeName}
            {visit.placeCategory ? (
              <Text style={styles.placeCategory}> · {visit.placeCategory}</Text>
            ) : null}
          </Text>
        ) : null}
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
        {media && media.length > 0 && onOpenMedia ? (
          <MediaRow media={media} onOpen={onOpenMedia} />
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
  /** Photos and videos attached to each stored visit id. */
  media?: Map<number, MediaAsset[]>;
  onOpenMedia?: (asset: MediaAsset, list: MediaAsset[]) => void;
  /** Shows a replay button on days with at least one visit. */
  onReplayDay?: (visits: Visit[], title: string) => void;
  empty?: ReactElement;
};

/**
 * Date-grouped vertical timeline. Times and durations come only from each visit's own
 * arrival/departure. The list's automatic content inset applies the real iOS safe area.
 */
export function VisitTimeline({
  visits,
  onTag,
  header,
  media,
  onOpenMedia,
  onReplayDay,
  empty,
}: Props) {
  return (
    <SectionList
      style={styles.list}
      contentInsetAdjustmentBehavior="automatic"
      stickySectionHeadersEnabled={false}
      sections={groupByDay(visits)}
      keyExtractor={v => String(v.id)}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      renderSectionHeader={({ section }) => (
        <View style={styles.dateHeaderRow}>
          <Text style={styles.dateHeader} accessibilityRole="header">
            {section.title}
          </Text>
          {onReplayDay ? (
            <Pressable
              onPress={() => onReplayDay(section.data, section.title)}
              accessibilityRole="button"
              accessibilityLabel={`${section.title} 재생`}
              hitSlop={8}
              style={styles.replay}
            >
              <Text style={styles.replayText}>▶ 재생</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      renderItem={({ item, index, section }) => (
        <VisitRow
          visit={item}
          last={index === section.data.length - 1}
          onTag={onTag ? () => onTag(item) : undefined}
          media={media?.get(item.id)}
          onOpenMedia={onOpenMedia}
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
  dateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  replay: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.blue,
  },
  replayText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },
  media: { flexDirection: 'row', marginTop: 10, gap: 4 },
  mediaCell: { flex: 1, aspectRatio: 1, borderRadius: 10, overflow: 'hidden' },
  mediaFill: { flex: 1 },
  thumb: { backgroundColor: '#E2E6DF', overflow: 'hidden' },
  videoBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    paddingHorizontal: 4,
    borderRadius: 4,
    overflow: 'hidden',
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    backgroundColor: 'rgba(22,25,29,0.7)',
  },
  sampleBadge: {
    position: 'absolute',
    left: 4,
    top: 4,
    paddingHorizontal: 4,
    borderRadius: 4,
    overflow: 'hidden',
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    backgroundColor: 'rgba(232,106,16,0.9)',
  },
  more: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(22,25,29,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  dateHeader: {
    flexShrink: 1,
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
  placeName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 2,
  },
  placeCategory: { fontSize: 13, fontWeight: '500', color: colors.muted },
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
