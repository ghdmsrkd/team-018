import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GeocodeResult, geocodeVisit } from './api/geocodeClient';
import { colors } from './theme';
import type { Visit } from './visitMonitor';

const TYPE_LABEL: Record<string, string> = { B: '법정동', H: '행정동' };

/**
 * "행정구역 확인" for one stored visit via POST /geocode. Sends the coordinates only when the
 * button is tapped; the result is kept in this component's state and never stored.
 * Not offered in the sample mode.
 */
export function RegionCheck({ visit }: { visit: Visit }) {
  const [result, setResult] = useState<GeocodeResult | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    try {
      setResult(await geocodeVisit(visit));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>행정구역</Text>
      <Text style={styles.notice}>
        확인하면 이 방문의 좌표(위도·경도)가 하루 중계 서버(AWS Lambda)를 거쳐
        카카오 행정구역 조회로 전달돼요. 버튼을 누를 때만 보내고, 결과는
        저장하지 않아요.
      </Text>
      <Pressable
        testID="region-check"
        onPress={check}
        disabled={busy}
        accessibilityRole="button"
        style={[styles.button, busy && styles.dim]}
      >
        <Text style={styles.buttonText}>
          {busy ? '확인 중…' : '행정구역 확인'}
        </Text>
      </Pressable>
      {result?.state === 'ok' ? (
        result.regions.length === 0 ? (
          <Text style={styles.text}>이 좌표의 행정구역 정보가 없어요.</Text>
        ) : (
          result.regions.map(r => (
            <Text key={`${r.type}-${r.name}`} style={styles.text}>
              {TYPE_LABEL[r.type] ?? '지역'} · {r.name}
            </Text>
          ))
        )
      ) : result?.state === 'unconfigured' ? (
        <Text style={styles.text}>
          이 빌드에는 중계 서버 주소가 설정되지 않았어요.
        </Text>
      ) : result?.state === 'notConfigured' ? (
        <Text style={styles.text}>
          중계 서버에 행정구역 조회가 설정되지 않았어요.
        </Text>
      ) : result?.state === 'invalid' ? (
        <Text style={styles.text}>이 방문의 좌표로는 확인할 수 없어요.</Text>
      ) : result?.state === 'error' ? (
        <Text style={styles.error}>확인하지 못했어요 ({result.detail}).</Text>
      ) : null}
      {result?.state === 'ok' ? (
        <Text style={styles.credit}>© Kakao</Text>
      ) : null}
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
  notice: { marginTop: 6, fontSize: 12, lineHeight: 18, color: colors.muted },
  text: { marginTop: 6, fontSize: 14, lineHeight: 20, color: colors.text },
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
  error: { marginTop: 6, fontSize: 13, color: colors.danger },
  credit: { marginTop: 8, fontSize: 12, color: '#5F6368', textAlign: 'right' },
});
