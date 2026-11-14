import type { PlaceCandidate, PlacesProvider } from '@haru/schema';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { checkHealth } from './api/chatClient';
import {
  NearbyResult,
  parseStoredPlaceId,
  PROVIDER_ATTRIBUTION,
  PROVIDER_LABEL,
  searchNearby,
  storedPlaceId,
} from './api/placesClient';
import { demoPlacesApi, samplePlaceName } from './demoStore';
import { colors } from './theme';
import { Visit, visitMonitor } from './visitMonitor';

type Props = {
  visit: Visit;
  /**
   * Why the search is offered. 'unknown' / 'failed' are for a future place-suggestion
   * result (no such endpoint exists yet); today the app uses 'untagged' and 'manual'.
   */
  reason: 'untagged' | 'manual' | 'unknown' | 'failed';
  onSaved?: () => void;
  /** Sample mode: fixed local candidates, in-memory save, no network. */
  sample?: boolean;
};

const INTRO: Record<Props['reason'], string> = {
  untagged: '이 방문이 어디였는지 아직 정해지지 않았어요.',
  manual: '이 방문의 장소를 직접 고칠 수 있어요.',
  unknown: '장소를 알아내지 못했어요.',
  failed: '장소 정보를 가져오지 못했어요.',
};

/**
 * Nearby place candidates for one stored visit, from whichever single provider the relay
 * has configured (Google, else Kakao). Nothing with a location is sent until the user taps
 * the search button; opening this view only asks /health which provider is configured.
 * Picking a candidate stores only its provider place ID on the visit (Google as-is, Kakao
 * as "kakao:<id>"); name, address and coordinates stay in this component's state and are
 * gone after it closes. Showing the name again later needs a lookup by the stored ID.
 */
export function NearbyPlaceSearch({
  visit,
  reason,
  onSaved,
  sample = false,
}: Props) {
  const [provider, setProvider] = useState<PlacesProvider | null | undefined>(
    undefined,
  );
  const [result, setResult] = useState<NearbyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<PlaceCandidate | null>(null);
  const [savedId, setSavedId] = useState<string | null>(
    visit.googlePlaceId ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sample) {
      return;
    }
    let alive = true;
    checkHealth().then(h => {
      if (alive) {
        setProvider(h.state === 'ok' ? h.placesProvider : null);
      }
    });
    return () => {
      alive = false;
    };
  }, [sample]);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = sample
        ? await demoPlacesApi.search(visit)
        : await searchNearby(visit);
      setResult(r);
      if (r.state === 'ok') {
        setProvider(r.response.provider);
      }
    } finally {
      setBusy(false);
    }
  };

  const pick = async (p: PlaceCandidate) => {
    setError(null);
    try {
      const id = sample ? demoPlacesApi.storedId(p) : storedPlaceId(p);
      await (sample
        ? demoPlacesApi.setVisitPlace(visit.id, id)
        : visitMonitor.setVisitPlace(visit.id, id));
      setPicked(p);
      setSavedId(id);
      onSaved?.();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const unlink = async () => {
    setError(null);
    try {
      // Also clear merged duplicate rows, or their stored ID would reappear on this stay.
      await Promise.all(
        [visit.id, ...(visit.mergedVisitIds ?? [])].map(id =>
          sample
            ? demoPlacesApi.clearVisitPlace(id)
            : visitMonitor.clearVisitPlace(id),
        ),
      );
      setPicked(null);
      setSavedId(null);
      onSaved?.();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const places = result?.state === 'ok' ? result.response.places : [];
  const savedProvider = savedId ? parseStoredPlaceId(savedId).provider : null;
  const savedSampleName = sample && savedId ? samplePlaceName(savedId) : null;
  const destination =
    provider === 'google' || provider === 'kakao'
      ? `${PROVIDER_LABEL[provider]} 한 곳으로`
      : 'Google 또는 카카오 중 서버에 설정된 한 곳으로';
  const keyOf = (p: PlaceCandidate) =>
    sample ? demoPlacesApi.storedId(p) : storedPlaceId(p);

  return (
    <View style={styles.box}>
      <Text style={styles.title}>주변 장소</Text>
      <Text style={styles.text}>{INTRO[reason]}</Text>
      {savedId && savedProvider ? (
        <View style={styles.saved}>
          <Text style={styles.text}>
            {sample
              ? `연결한 장소: ${savedSampleName ?? '샘플 장소'} (샘플)`
              : picked && storedPlaceId(picked) === savedId
              ? `연결한 장소: ${picked.name || '이름 없음'} (${
                  PROVIDER_LABEL[savedProvider]
                })`
              : `${PROVIDER_LABEL[savedProvider]} 장소가 연결되어 있어요. 이름은 저장하지 않아 다시 검색하면 볼 수 있어요.`}
          </Text>
          <Pressable onPress={unlink} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.link}>연결 해제</Text>
          </Pressable>
        </View>
      ) : null}
      <Text style={styles.notice}>
        {sample
          ? '샘플 모드예요. 위치를 어디에도 보내지 않고, 앱 안의 고정된 샘플 장소 목록에서 가까운 순으로 보여 줘요. 고른 결과는 저장되지 않아요.'
          : `검색하면 이 방문의 위치(좌표와 정확도)가 하루 중계 서버(AWS Lambda)를 거쳐 ${destination} 전달돼요. 버튼을 누를 때만 보내요.`}
      </Text>
      <Pressable
        testID="nearby-search"
        onPress={search}
        disabled={busy}
        accessibilityRole="button"
        style={[styles.button, busy && styles.dim]}
      >
        <Text style={styles.buttonText}>
          {busy ? '찾는 중…' : '주변 장소 찾기'}
        </Text>
      </Pressable>

      {result?.state === 'unconfigured' ? (
        <Text style={styles.text}>
          이 빌드에는 중계 서버 주소가 설정되지 않아 검색할 수 없어요.
        </Text>
      ) : result?.state === 'notConfigured' ? (
        <Text style={styles.text}>
          중계 서버에 장소 검색(Google 또는 카카오)이 아직 설정되지 않았어요.
        </Text>
      ) : result?.state === 'invalid' ? (
        <Text style={styles.text}>
          이 방문의 위치 정보로는 검색할 수 없어요.
        </Text>
      ) : result?.state === 'error' ? (
        <Text style={styles.error}>검색하지 못했어요 ({result.detail}).</Text>
      ) : result?.state === 'ok' && places.length === 0 ? (
        <Text style={styles.text}>
          반경 {Math.round(result.response.radiusMeters)}m 안에서 찾은 장소가
          없어요.
        </Text>
      ) : null}
      {result?.state === 'ok' && result.response.incomplete ? (
        <Text style={styles.attr}>
          일부 분류는 불러오지 못해 결과가 빠졌을 수 있어요.
        </Text>
      ) : null}

      {places.map(p => {
        const id = keyOf(p);
        return (
          <Pressable
            key={id}
            onPress={() => pick(p)}
            accessibilityRole="button"
            accessibilityState={{ selected: savedId === id }}
            style={styles.row}
          >
            <View style={styles.flex}>
              <Text style={styles.name}>
                {savedId === id ? '✓ ' : ''}
                {p.name || '이름 없음'}
              </Text>
              {p.address ? <Text style={styles.addr}>{p.address}</Text> : null}
              {p.attributions?.length ? (
                <Text style={styles.attr}>
                  출처: {p.attributions.map(a => a.provider).join(', ')}
                </Text>
              ) : null}
            </View>
            <Text style={styles.dist}>{p.distanceMeters}m</Text>
          </Pressable>
        );
      })}
      {result?.state === 'ok' ? (
        <Text style={styles.credit}>
          {sample
            ? '샘플 목록 · 외부 제공자 아님'
            : PROVIDER_ATTRIBUTION[result.response.provider]}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F4F6F2',
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink },
  text: { marginTop: 6, fontSize: 14, lineHeight: 20, color: colors.text },
  notice: { marginTop: 8, fontSize: 12, lineHeight: 18, color: colors.muted },
  saved: { marginTop: 4 },
  link: { marginTop: 4, fontSize: 14, fontWeight: '600', color: colors.blue },
  button: {
    marginTop: 10,
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.ink,
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  dim: { opacity: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D5D9D3',
  },
  flex: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  addr: { marginTop: 2, fontSize: 12, color: colors.muted },
  attr: { marginTop: 2, fontSize: 11, color: colors.muted },
  dist: {
    marginLeft: 8,
    fontSize: 13,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  credit: { marginTop: 8, fontSize: 12, color: '#5F6368', textAlign: 'right' },
  error: { marginTop: 6, fontSize: 13, color: colors.danger },
});
