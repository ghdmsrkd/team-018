import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Health } from './api/chatClient';
import {
  askDemo,
  DEMO_TEST_QUESTIONS,
  DemoCard,
  DemoInfo,
  demoMemory,
  DemoRun,
} from './api/demoAgent';
import { colors } from './theme';

const MAX_QUESTION = 300;

type Turn = { q: string; r?: DemoRun; error?: string };

function cardText(c: DemoCard): { title: string; body: string } {
  const d = c.data as Record<string, any>;
  if (c.ref.type === 'trip') {
    return {
      title: String(d.name ?? '여행'),
      body: `${d.start_date} – ${d.end_date} · ${d.nights}박 · ${d.regions}`,
    };
  }
  if (c.ref.type === 'day') {
    return {
      title: String(d.day),
      body: String(d.summary ?? `머문 곳 ${d.stay_count}곳`),
    };
  }
  return {
    title: String(d.place_name ?? '방문'),
    body: `${d.start_at} · ${d.minutes}분${d.tag ? ` · ${d.tag}` : ''}${
      d.sigungu ? ` · ${d.sigungu}` : ''
    }`,
  };
}

/**
 * Live Ask tab chat over the bundled fixed demo persona data. Free-text questions and the
 * example chips go to /chat; the model can only call the fixed local tools in demoAgent.ts,
 * and evidence cards are re-read from the demo DB. Never uses the user's own records.
 */
export function ServerChatTest({ health }: { health: Health | null }) {
  const [info, setInfo] = useState<DemoInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);

  useEffect(() => {
    demoMemory
      .getInfo()
      .then(setInfo)
      .catch(() => setInfo({ available: false }));
  }, []);

  const ready = health?.state === 'ok' && info?.available === true;

  const ask = async (raw: string) => {
    const q = raw.trim().slice(0, MAX_QUESTION);
    if (!q || busy || !ready) {
      return;
    }
    setBusy(true);
    setDraft('');
    setTurns(t => [...t, { q }]);
    const finish = (turn: Turn) => setTurns(t => [...t.slice(0, -1), turn]);
    try {
      finish({ q, r: await askDemo(q) });
    } catch (e: any) {
      finish({ q, error: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  };

  const disabledReason =
    info == null
      ? '데모 데이터를 확인하는 중…'
      : !info.available
      ? '이 빌드에는 데모 데이터가 없어 질문할 수 없어요.'
      : health == null
      ? '중계 서버를 확인하는 중…'
      : health.state !== 'ok'
      ? '중계 서버에 연결되면 질문할 수 있어요.'
      : null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>데모 기록에 물어보기</Text>
      <Text style={styles.text}>
        {info?.available
          ? `고정 데모 데이터(가상 인물 1년 기록: ${info.first_day} – ${info.last_day}, 방문 ${info.stay_count}건, 여행 ${info.trip_count}건)로만 답해요. 내 실제 기록은 쓰지 않아요.`
          : '고정 데모 데이터로만 답하는 테스트예요.'}
      </Text>
      <Text style={styles.note}>
        보내면 질문과 데모 데이터 조회 결과(장소 이름·시각, 좌표 없음)가 하루
        중계 서버(AWS Lambda)를 거쳐 AI 모델로 전달돼요. 모델은 정해진 조회만
        요청할 수 있고, 근거 카드는 앱이 데모 데이터에서 다시 읽어요.
      </Text>
      <View style={styles.chips}>
        {DEMO_TEST_QUESTIONS.map((q, i) => (
          <Pressable
            key={q}
            testID={`server-q-${i}`}
            disabled={!ready || busy}
            onPress={() => ask(q)}
            accessibilityRole="button"
            style={[styles.chip, (!ready || busy) && styles.off]}
          >
            <Text style={styles.chipText}>{q}</Text>
          </Pressable>
        ))}
      </View>

      {turns.map((turn, i) => (
        <View key={i} style={styles.chat}>
          <Text style={styles.me}>{turn.q}</Text>
          {turn.error ? (
            <Text style={styles.error}>답을 받지 못했어요 ({turn.error}).</Text>
          ) : turn.r ? (
            <>
              <View style={styles.ai}>
                <Text style={styles.aiText}>{turn.r.answer.text}</Text>
                <Text style={styles.aiMeta}>
                  데모 데이터 기준 · 조회 {turn.r.toolCalls.length}회
                  {turn.r.toolCalls.length
                    ? ` (${[...new Set(turn.r.toolCalls)].join(', ')})`
                    : ''}
                </Text>
              </View>
              {turn.r.cards.map(c => {
                const t = cardText(c);
                return (
                  <View key={`${c.ref.type}-${c.ref.id}`} style={styles.ev}>
                    <Text style={styles.evTitle}>{t.title}</Text>
                    <Text style={styles.evBody}>{t.body}</Text>
                  </View>
                );
              })}
            </>
          ) : (
            <Text style={styles.note}>답을 기다리는 중…</Text>
          )}
        </View>
      ))}

      {disabledReason ? (
        <Text style={styles.note}>{disabledReason}</Text>
      ) : null}
      <View style={[styles.askbox, !ready && styles.off]}>
        <TextInput
          testID="server-ask-input"
          value={draft}
          onChangeText={setDraft}
          editable={ready && !busy}
          placeholder={
            ready ? '예: 지난달 커피 몇 번 마셨어?' : '아직 질문할 수 없어요'
          }
          placeholderTextColor={colors.muted}
          maxLength={MAX_QUESTION}
          returnKeyType="send"
          onSubmitEditing={() => ask(draft)}
          style={styles.input}
          accessibilityLabel="데모 기록 질문 입력"
        />
        <Pressable
          testID="server-ask-send"
          onPress={() => ask(draft)}
          disabled={!ready || busy || draft.trim().length === 0}
          accessibilityRole="button"
          accessibilityLabel="보내기"
          style={[styles.send, (!ready || busy || !draft.trim()) && styles.off]}
        >
          <Text style={styles.sendText}>{busy ? '…' : '↑'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.card,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  text: { marginTop: 8, fontSize: 14, lineHeight: 21, color: colors.text },
  note: { marginTop: 8, fontSize: 12, lineHeight: 18, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D5D9D3',
    backgroundColor: colors.background,
  },
  chipText: { fontSize: 13, color: '#3D444B' },
  off: { opacity: 0.5 },
  chat: { marginTop: 14, gap: 8 },
  me: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    backgroundColor: colors.ink,
    color: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    overflow: 'hidden',
    fontSize: 15,
  },
  ai: { padding: 14, borderRadius: 16, backgroundColor: colors.background },
  aiText: { fontSize: 15, lineHeight: 22, color: colors.ink },
  aiMeta: { marginTop: 6, fontSize: 11, color: colors.muted },
  ev: {
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D5D9D3',
  },
  evTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  evBody: { marginTop: 2, fontSize: 12, color: colors.muted },
  error: { fontSize: 13, color: colors.danger },
  askbox: {
    marginTop: 14,
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D5D9D3',
    paddingLeft: 18,
    paddingRight: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: { flex: 1, fontSize: 15, color: colors.ink, paddingVertical: 12 },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
});
