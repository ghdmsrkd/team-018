import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { API_URL, askAvailable } from './api/chatClient';
import { colors } from './theme';

/**
 * Entry for 기억 챗. Disabled until the /chat relay URL and the local query tool exist, so
 * no answer is ever shown without the user's own records behind it.
 */
export function AskScreen() {
  const ready = askAvailable();
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
      <View style={styles.card}>
        <Text style={styles.cardTitle}>아직 연결 전이에요</Text>
        <Text style={styles.cardText}>
          기록에 대해 묻고 근거 카드로 답을 받는 기능은 다음 두 가지가 준비되면
          열려요.
        </Text>
        <Text style={styles.item}>
          {API_URL ? '✓' : '·'} 질문을 전달할 중계 주소 (/chat)
        </Text>
        <Text style={styles.item}>
          · 이 기기의 기록을 읽기 전용으로 조회하는 도구
        </Text>
        <Text style={styles.cardText}>
          그전에는 답을 만들지 않아요. 기록이 없는 답을 보여 주지 않기
          위해서예요.
        </Text>
      </View>
      <View style={[styles.askbox, !ready && styles.off]}>
        <TextInput
          editable={ready}
          placeholder="예: 지난달 카페 몇 번 갔지?"
          placeholderTextColor={colors.muted}
          style={styles.input}
          accessibilityLabel="질문 입력, 아직 사용할 수 없음"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 8 },
  eyebrow: { fontSize: 11, letterSpacing: 1, color: colors.muted },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 2 },
  card: {
    marginTop: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.card,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  cardText: { marginTop: 8, fontSize: 14, lineHeight: 21, color: colors.text },
  item: { marginTop: 6, fontSize: 14, color: colors.text },
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
