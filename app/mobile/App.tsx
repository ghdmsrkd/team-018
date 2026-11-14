import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Onboarding } from './src/Onboarding';
import { SAMPLE_VISITS } from './src/sampleVisits';
import { TagPicker } from './src/TagPicker';
import { colors } from './src/theme';
import { VisitTimeline } from './src/VisitTimeline';
import {
  isSupported,
  MonitorState,
  Visit,
  visitMonitor,
} from './src/visitMonitor';

/**
 * Message for states where visits cannot be recorded because iOS does not report Always.
 * Returns null when healthy (Always reported, possibly provisional), before the user has
 * asked, or while the first iOS prompt is still open.
 */
function permissionMessage(s: MonitorState): string | null {
  switch (s.authorization) {
    case 'whenInUse':
      return '위치 권한이 "앱을 사용하는 동안"으로 되어 있어 방문이 기록되지 않아요. 설정에서 위치를 "항상"으로 바꿔 주세요.';
    case 'denied':
      return '위치 권한이 꺼져 있어 방문이 기록되지 않아요. 설정에서 위치를 "항상"으로 바꿔 주세요.';
    case 'restricted':
      return '이 기기에서는 위치 사용이 제한되어 있어 방문을 기록할 수 없어요. 스크린 타임이나 기기 관리 프로필 때문일 수 있어요.';
    case 'notDetermined':
      return s.alwaysRequested && !s.requestPending
        ? '위치 권한을 받지 못해 방문이 기록되지 않아요. 설정에서 위치를 "항상"으로 바꿔 주세요.'
        : null;
    default:
      return null;
  }
}

function TextButton({
  title,
  onPress,
  testID,
}: {
  title: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={8}
      style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
    >
      <Text style={styles.textButtonText}>{title}</Text>
    </Pressable>
  );
}

/** Real visits from SQLite. Reads only; tag edits go through the native store. */
function VisitsScreen({ startError }: { startError: string | null }) {
  const [state, setState] = useState<MonitorState | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [error, setError] = useState<string | null>(startError);
  const [taggingId, setTaggingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, v] = await Promise.all([
        visitMonitor.getState(),
        visitMonitor.getVisits(),
      ]);
      setState(s);
      setVisits(v);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => setError(startError), [startError]);

  useEffect(() => {
    refresh();
    const unsubscribe = visitMonitor.subscribe(refresh);
    const appState = AppState.addEventListener('change', next => {
      if (next === 'active') {
        refresh();
      }
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [refresh]);

  const openSettings = async () => {
    try {
      await visitMonitor.openSettings();
    } catch (e) {
      setError(String(e));
    }
  };

  const showSamples = visits.length === 0;
  const message = state ? permissionMessage(state) : null;
  const errorText = error ?? state?.lastError ?? null;

  return (
    <View style={styles.container}>
      <VisitTimeline
        visits={showSamples ? SAMPLE_VISITS : visits}
        onTag={showSamples ? undefined : v => setTaggingId(v.id)}
        header={
          message || errorText ? (
            <View>
              {message ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeText}>{message}</Text>
                  {state?.authorization !== 'restricted' ? (
                    <TextButton title="설정 열기" onPress={openSettings} />
                  ) : null}
                </View>
              ) : null}
              {errorText ? (
                <Text style={styles.error}>오류: {errorText}</Text>
              ) : null}
            </View>
          ) : undefined
        }
      />
      <TagPicker
        visit={visits.find(v => v.id === taggingId) ?? null}
        onClose={() => {
          setTaggingId(null);
          refresh();
        }}
      />
    </View>
  );
}

/** Sample day only: no native calls, no permission request, no database access. */
function DemoScreen({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.container}>
      <VisitTimeline
        visits={SAMPLE_VISITS}
        header={
          <View style={styles.notice}>
            <Text style={styles.noticeTitle} accessibilityRole="header">
              샘플 하루
            </Text>
            <Text style={styles.noticeText}>
              실제 기록이 아닌 예시예요. 이 화면은 위치 권한을 요청하지 않고
              아무것도 저장하지 않아요.
            </Text>
            <TextButton
              testID="demo-back"
              title="처음 화면으로 돌아가 위치 권한 허용하기"
              onPress={onBack}
            />
          </View>
        }
      />
    </View>
  );
}

type Stage = 'onboarding' | 'visits' | 'demo';

/**
 * Onboarding is shown first on every cold start of the JS app, because `stage` lives only
 * in memory. Returning from the background keeps the current stage. Native visit monitoring
 * is independent of this UI and resumes at every launch when iOS reports Always.
 */
function App() {
  const [stage, setStage] = useState<Stage>('onboarding');
  const [startError, setStartError] = useState<string | null>(null);

  if (!isSupported) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>
          Visit monitoring is only available on iOS.
        </Text>
      </View>
    );
  }

  if (stage === 'visits') {
    return <VisitsScreen startError={startError} />;
  }
  if (stage === 'demo') {
    return <DemoScreen onBack={() => setStage('onboarding')} />;
  }
  return (
    <Onboarding
      onStart={() => {
        // The only place the app asks iOS for Always, and only on this explicit tap.
        setStartError(null);
        setStage('visits');
        visitMonitor
          .requestAlways()
          .catch((e: unknown) => setStartError(String(e)));
      }}
      onDemo={() => setStage('demo')}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  notice: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.card,
    alignItems: 'flex-start',
  },
  noticeTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 4,
  },
  noticeText: { fontSize: 15, lineHeight: 22, color: colors.text },
  textButton: { marginTop: 10, paddingVertical: 4 },
  textButtonText: { fontSize: 15, fontWeight: '600', color: colors.blue },
  pressed: { opacity: 0.6 },
  error: {
    marginHorizontal: 20,
    marginTop: 8,
    fontSize: 14,
    color: colors.danger,
  },
  empty: {
    padding: 24,
    fontSize: 15,
    textAlign: 'center',
    color: colors.muted,
  },
});

export default App;
