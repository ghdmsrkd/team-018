import { ReactElement, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ALL_TIME_END, DataSource } from './dataSource';
import {
  attachMedia,
  canReadPhotos,
  MediaAsset,
  PhotoAuth,
  photos,
} from './media';
import { MediaViewer } from './MediaViewer';
import { ReplayView } from './ReplayView';
import { SAMPLE_VISITS } from './sampleVisits';
import { normalizeVisits, Stay } from './summary';
import { colors } from './theme';
import { VisitTimeline } from './VisitTimeline';
import { Visit, visitMonitor } from './visitMonitor';

type Filter = 'all' | 'media' | 'trips';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'media', label: '사진 · 영상' },
  { key: 'trips', label: '여행' },
];

type Props = {
  source: DataSource;
  refreshToken: number;
  /** Live only: open the tag sheet. */
  onTagVisit?: (visit: Visit) => void;
  notice?: ReactElement | null;
};

export function TimelineScreen({
  source,
  refreshToken,
  onTagVisit,
  notice,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auth, setAuth] = useState<PhotoAuth | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [viewer, setViewer] = useState<{
    asset: MediaAsset;
    list: MediaAsset[];
  } | null>(null);
  const [replay, setReplay] = useState<{ title: string; stays: Stay[] } | null>(
    null,
  );

  const live = source.kind === 'live';

  useEffect(() => {
    let alive = true;
    source
      .visitsInRange(0, ALL_TIME_END)
      .then(v => {
        if (alive) {
          setVisits(v);
          setLoaded(true);
          setError(null);
        }
      })
      .catch(e => alive && setError(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, [source, refreshToken]);

  // Photo access is only read here; asking happens on an explicit button below.
  useEffect(() => {
    if (!live || !photos.isSupported) {
      return;
    }
    photos
      .getAuthorization()
      .then(setAuth)
      .catch(() => setAuth('unknown'));
  }, [live, refreshToken]);

  const now = source.now();
  const stays = useMemo(() => normalizeVisits(visits, now), [visits, now]);
  const usingSamples = live && loaded && visits.length === 0;
  const shownStays = useMemo(
    () => (usingSamples ? normalizeVisits(SAMPLE_VISITS, now) : stays),
    [usingSamples, stays, now],
  );

  useEffect(() => {
    if (!live || !canReadPhotos(auth) || stays.length === 0) {
      setAssets([]);
      return;
    }
    const from = Math.min(
      ...stays.map(s => s.start ?? s.end ?? s.visit.receivedAt),
    );
    let alive = true;
    photos
      .getAssets(from, now + 60000)
      .then(a => alive && setAssets(a))
      .catch(() => alive && setAssets([]));
    return () => {
      alive = false;
    };
    // `now` moves every render; refetch on data or permission changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, auth, stays]);

  const media = useMemo(() => attachMedia(stays, assets), [stays, assets]);

  const shownVisits =
    filter === 'media'
      ? shownStays.filter(s => media.has(s.visit.id)).map(s => s.visit)
      : filter === 'trips'
      ? []
      : shownStays.map(s => s.visit);

  const askPhotos = async () => {
    if (auth === 'notDetermined') {
      setAuth(await photos.requestAuthorization());
    } else {
      await visitMonitor.openSettings();
    }
  };

  const emptyText =
    filter === 'trips'
      ? '여행 묶음은 아직 계산하지 않아요. 집 생활권을 벗어난 구간을 찾는 여행 감지가 연결되면 여기에 나와요.'
      : filter === 'media'
      ? !live
        ? '샘플 하루에는 사진이나 영상이 없어요.'
        : !canReadPhotos(auth)
        ? '사진 접근을 허용하면 머문 시간에 찍은 사진과 영상이 방문에 붙어요.'
        : '머문 시간에 찍은 사진이나 영상이 아직 없어요.'
      : loaded
      ? '아직 기록된 방문이 없어요.'
      : '불러오는 중…';

  const header = (
    <View>
      {notice}
      <View style={styles.top}>
        <Text style={styles.eyebrow}>TIMELINE</Text>
        <Text style={styles.title} accessibilityRole="header">
          타임라인
        </Text>
        <View style={styles.chips}>
          {FILTERS.map(f => (
            <Pressable
              key={f.key}
              testID={`filter-${f.key}`}
              onPress={() => setFilter(f.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === f.key }}
              style={[styles.chip, filter === f.key && styles.chipOn]}
            >
              <Text
                style={[styles.chipText, filter === f.key && styles.chipTextOn]}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {live &&
      photos.isSupported &&
      auth != null &&
      !canReadPhotos(auth) &&
      filter !== 'trips' ? (
        <View style={styles.card}>
          <Text style={styles.cardText}>
            {auth === 'restricted'
              ? '이 기기에서는 사진 접근이 제한되어 있어요.'
              : '사진 접근을 허용하면 머문 시간에 찍은 사진과 영상이 타임라인에 붙어요. 사진은 이 기기 밖으로 보내지 않아요.'}
          </Text>
          {auth !== 'restricted' ? (
            <Pressable
              onPress={askPhotos}
              accessibilityRole="button"
              style={styles.cta}
            >
              <Text style={styles.ctaText}>
                {auth === 'notDetermined' ? '사진 접근 허용' : '설정 열기'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>오류: {error}</Text> : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <VisitTimeline
        visits={shownVisits}
        onTag={usingSamples || !onTagVisit ? undefined : onTagVisit}
        header={header}
        media={live ? media : undefined}
        onOpenMedia={(asset, list) => setViewer({ asset, list })}
        onReplayDay={(dayVisits, title) => {
          const ids = new Set(dayVisits.map(v => v.id));
          setReplay({
            title,
            stays: shownStays.filter(s => ids.has(s.visit.id)),
          });
        }}
        empty={<Text style={styles.empty}>{emptyText}</Text>}
      />
      <MediaViewer
        asset={viewer?.asset ?? null}
        list={viewer?.list ?? []}
        onClose={() => setViewer(null)}
      />
      <ReplayView
        title={replay?.title ?? ''}
        stays={replay?.stays ?? null}
        onClose={() => setReplay(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  top: { paddingHorizontal: 20, paddingTop: 8 },
  eyebrow: { fontSize: 11, letterSpacing: 1, color: colors.muted },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D5D9D3',
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, color: '#3D444B' },
  chipTextOn: { color: '#FFFFFF', fontWeight: '600' },
  card: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  cardText: { fontSize: 14, lineHeight: 20, color: colors.text },
  cta: { marginTop: 8, alignSelf: 'flex-start', paddingVertical: 4 },
  ctaText: { fontSize: 15, fontWeight: '600', color: colors.blue },
  error: { marginHorizontal: 20, marginTop: 8, color: colors.danger },
  empty: {
    padding: 24,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    textAlign: 'center',
  },
});
