import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CHAT_SEND_ENABLED, checkHealth, Health } from './api/chatClient';
import { DEMO_QA, DemoQA, ResolvedCard, resolveCards } from './api/demoAnswer';
import type { DataSource } from './dataSource';
import { formatClock, formatDuration, formatShortDateTime } from './format';
import { ReplayView } from './ReplayView';
import { SAMPLE_VISITS } from './sampleVisits';
import { normalizeVisits, Stay } from './summary';
import { colors } from './theme';

function HealthLine({ health }: { health: Health | null }) {
  const text =
    health == null
      ? '중계 서버 확인 중…'
      : health.state === 'unconfigured'
      ? '중계 서버 주소가 이 빌드에 설정되지 않았어요.'
      : health.state === 'ok'
      ? `중계 서버 연결됨${health.model ? ` · ${health.model}` : ''}`
      : `중계 서버에 연결하지 못했어요 (${health.detail}).`;
  return <Text style={styles.item}>{text}</Text>;
}

function Card({ card, onPress }: { card: ResolvedCard; onPress: () => void }) {
  if (card.kind === 'day') {
    return (
      <Pressable style={styles.ev} onPress={onPress} accessibilityRole="button">
        <View style={styles.flex}>
          <Text style={styles.evTitle}>{card.day}</Text>
          <Text style={styles.evBody}>방문 {card.visits.length}번 · 눌러서 재생</Text>
        </View>
        <Text style={styles.evAction}>▶ 재생</Text>
      </Pressable>
    );
  }
  const v = card.visit;
  const dur = formatDuration(v.arrivalAt, v.departureAt);
  return (
    <Pressable style={styles.ev} onPress={onPress} accessibilityRole="button">
      <View style={styles.flex}>
        <Text style={styles.evTitle}>
          {v.arrivalAt != null ? formatShortDateTime(v.arrivalAt) : '도착 미확인'}
          {v.departureAt != null ? ` – ${formatClock(v.departureAt)}` : ' · 출발 미기록'}
        </Text>
        <Text style={styles.evBody}>
          {dur ? `머문 시간 ${dur} · ` : ''}정확도 ±{v.horizontalAccuracy.toFixed(0)} m
        </Text>
      </View>
      <Text style={styles.evAction}>▶ 재생</Text>
    </Pressable>
  );
}

/**
 * 기억 챗. Live: shows relay health only; sending is disabled (see CHAT_SEND_ENABLED).
 * Demo: fixed AgentAnswer fixtures whose cards resolve to the local sample rows.
 */
export function AskScreen({ source }: { source: DataSource }) {
  const demo = source.kind === 'demo';
  const [health, setHealth] = useState<Health | null>(null);
  const [qa, setQa] = useState<DemoQA | null>(null);
  const [replay, setReplay] = useState<{ title: string; stays: Stay[] } | null>(null);

  useEffect(() => {
    if (demo) {
      return;
    }
    let alive = true;
    checkHealth().then(h => alive && setHealth(h));
    return () => {
      alive = false;
    };
  }, [demo]);

  const cards = qa ? resolveCards(qa.answer.cards, SAMPLE_VISITS) : [];
  const openReplay = (c: ResolvedCard) => {
    const rows = c.kind === 'day' ? c.visits : [c.visit];
    setReplay({
      title: c.kind === 'day' ? c.day : '방문',
      stays: normalizeVisits(rows, source.now()),
    });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>ASK HARU</Text>
      <Text style={styles.title} accessibilityRole="header">
        물어보기
      </Text>

      {demo ? (
        <>
          <Text style={styles.note}>
            샘플 답변이에요. 모델을 호출하지 않고, 근거 카드는 샘플 기록에서 다시 읽어요.
          </Text>
          <View style={styles.suggest}>
            {DEMO_QA.map(q => (
              <Pressable
                key={q.question}
                testID={`demo-q-${DEMO_QA.indexOf(q)}`}
                onPress={() => setQa(q)}
                accessibilityRole="button"
                style={[styles.chip, qa === q && styles.chipOn]}
              >
                <Text style={[styles.chipText, qa === q && styles.chipTextOn]}>{q.question}</Text>
              </Pressable>
            ))}
          </View>
          {qa ? (
            <View style={styles.chat}>
              <Text style={styles.me}>{qa.question}</Text>
              <View style={styles.ai}>
                <Text style={styles.aiText}>{qa.answer.text}</Text>
                <Text style={styles.aiMeta}>샘플 답변 · 모델 호출 없음</Text>
              </View>
              {cards.map(c => (
                <Card key={`${c.ref.type}-${c.ref.id}`} card={c} onPress={() => openReplay(c)} />
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>아직 질문을 보낼 수 없어요</Text>
          <HealthLine health={health} />
          <Text style={styles.cardText}>
            {CHAT_SEND_ENABLED
              ? ''
              : '답을 만드는 모델 호출이 아직 승인되지 않았고, 이 기기의 기록을 읽기 전용으로 조회하는 도구도 준비 중이에요. 그전에는 기록 없는 답을 보여 주지 않으려고 전송을 막아 두었어요.'}
          </Text>
        </View>
      )}

      <View style={[styles.askbox, styles.off]}>
        <TextInput
          editable={false}
          placeholder={demo ? '샘플에서는 위 질문만 고를 수 있어요' : '예: 지난달 카페 몇 번 갔지?'}
          placeholderTextColor={colors.muted}
          style={styles.input}
          accessibilityLabel="질문 입력, 아직 사용할 수 없음"
        />
      </View>
      <ReplayView
        title={replay?.title ?? ''}
        stays={replay?.stays ?? null}
        onClose={() => setReplay(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 8 },
  flex: { flex: 1 },
  eyebrow: { fontSize: 11, letterSpacing: 1, color: colors.muted },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 2 },
  note: { marginTop: 10, fontSize: 13, lineHeight: 19, color: colors.muted },
  card: { marginTop: 16, padding: 16, borderRadius: 18, backgroundColor: colors.card },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  cardText: { marginTop: 8, fontSize: 14, lineHeight: 21, color: colors.text },
  item: { marginTop: 8, fontSize: 14, color: colors.text },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D5D9D3',
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, color: '#3D444B' },
  chipTextOn: { color: '#FFFFFF', fontWeight: '600' },
  chat: { marginTop: 16, gap: 10 },
  me: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
    backgroundColor: colors.ink,
    color: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    overflow: 'hidden',
    fontSize: 15,
  },
  ai: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 18,
  },
  aiText: { fontSize: 15, lineHeight: 22, color: colors.ink },
  aiMeta: { marginTop: 6, fontSize: 11, color: colors.muted },
  ev: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D5D9D3',
  },
  evTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  evBody: { marginTop: 2, fontSize: 12, color: colors.muted },
  evAction: { marginLeft: 8, fontSize: 12, fontWeight: '600', color: colors.blue },
  askbox: {
    marginTop: 16,
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D5D9D3',
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  off: { opacity: 0.6 },
  input: { fontSize: 15, color: colors.ink, paddingVertical: 12 },
});
