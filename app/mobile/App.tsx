import { ReactElement, useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { AskScreen } from './src/AskScreen';
import { DataSource, demoSource, liveSource } from './src/dataSource';
import { demoStore, demoTagApi } from './src/demoStore';
import { Onboarding } from './src/Onboarding';
import { useWindowSafeAreaInsets } from './src/safeArea';
import { TagPicker } from './src/TagPicker';
import { colors } from './src/theme';
import { TimelineScreen } from './src/TimelineScreen';
import { TodayScreen } from './src/TodayScreen';
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

type Tab = 'today' | 'timeline' | 'ask';

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: '오늘' },
  { key: 'timeline', label: '타임라인' },
  { key: 'ask', label: '물어보기' },
];

function BottomNav({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
}) {
  const insets = useWindowSafeAreaInsets();
  return (
    <View
      style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 8) }]}
      accessibilityRole="tablist"
    >
      {TABS.map(t => {
        const on = tab === t.key;
        return (
          <Pressable
            key={t.key}
            testID={`tab-${t.key}`}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={styles.navItem}
          >
            <View style={[styles.navMark, on && styles.navMarkOn]} />
            <Text style={[styles.navText, on && styles.navTextOn]}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Tabbed main app over one data source. Live reads SQLite and may edit tags; demo uses the
 * JS-only samples and never calls native code.
 */
function MainShell({
  source,
  startError,
  banner,
}: {
  source: DataSource;
  startError?: string | null;
  banner?: ReactElement;
}) {
  const live = source.kind === 'live';
  const [tab, setTab] = useState<Tab>('today');
  const [state, setState] = useState<MonitorState | null>(null);
  const [error, setError] = useState<string | null>(startError ?? null);
  const [token, setToken] = useState(0);
  const [tagging, setTagging] = useState<Visit | null>(null);

  const refresh = useCallback(async () => {
    if (!live) {
      // Sample mode: re-read the in-memory sample store only.
      setToken(t => t + 1);
      return;
    }
    try {
      setState(await visitMonitor.getState());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
    setToken(t => t + 1);
  }, [live]);

  useEffect(() => setError(startError ?? null), [startError]);

  useEffect(() => {
    if (!live) {
      // Fresh sample state each time the sample mode is entered.
      demoStore.reset();
      return demoStore.subscribe(refresh);
    }
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
  }, [live, refresh]);

  const openSettings = async () => {
    try {
      await visitMonitor.openSettings();
    } catch (e) {
      setError(String(e));
    }
  };

  const message = state ? permissionMessage(state) : null;
  const errorText = error ?? state?.lastError ?? null;
  const notice =
    banner ??
    (message || errorText ? (
      <View>
        {message ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{message}</Text>
            {state?.authorization !== 'restricted' ? (
              <TextButton title="설정 열기" onPress={openSettings} />
            ) : null}
          </View>
        ) : null}
        {errorText ? <Text style={styles.error}>오류: {errorText}</Text> : null}
      </View>
    ) : null);

  const onTagVisit = (v: Visit) => setTagging(v);

  return (
    <View style={styles.container}>
      <View style={styles.flex}>
        {tab === 'today' ? (
          <TodayScreen
            source={source}
            refreshToken={token}
            onTagVisit={onTagVisit}
            recording={state?.monitoring}
            notice={notice}
          />
        ) : tab === 'timeline' ? (
          <TimelineScreen
            source={source}
            refreshToken={token}
            onTagVisit={onTagVisit}
            notice={notice}
          />
        ) : (
          <AskScreen source={source} />
        )}
      </View>
      <BottomNav tab={tab} onChange={setTab} />
      {live ? (
        <TagPicker
          visit={tagging}
          onClose={() => {
            setTagging(null);
            refresh();
          }}
        />
      ) : (
        <TagPicker
          visit={tagging}
          api={demoTagApi}
          sample
          onClose={() => {
            setTagging(null);
            refresh();
          }}
        />
      )}
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
    return <MainShell source={liveSource} startError={startError} />;
  }
  if (stage === 'demo') {
    return (
      <MainShell
        source={demoSource}
        banner={
          <View style={styles.notice}>
            <Text style={styles.noticeTitle} accessibilityRole="header">
              샘플 하루
            </Text>
            <Text style={styles.noticeText}>
              서울의 공개 장소 10곳으로 만든 예시예요. 방문 시각만 가상이에요.
              위치 권한을 요청하지 않고, 태그와 장소 수정은 이 화면 안에서만
              바뀌며 저장되지 않아요.
            </Text>
            <TextButton
              testID="demo-back"
              title="처음 화면으로 돌아가 위치 권한 허용하기"
              onPress={() => setStage('onboarding')}
            />
          </View>
        }
      />
    );
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
  flex: { flex: 1 },
  notice: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
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
  nav: {
    flexDirection: 'row',
    paddingTop: 8,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D5D9D3',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  navMark: {
    width: 20,
    height: 3,
    borderRadius: 2,
    marginBottom: 6,
    backgroundColor: 'transparent',
  },
  navMarkOn: { backgroundColor: colors.blue },
  navText: { fontSize: 12, fontWeight: '500', color: colors.muted },
  navTextOn: { color: colors.blue, fontWeight: '700' },
});

export default App;
