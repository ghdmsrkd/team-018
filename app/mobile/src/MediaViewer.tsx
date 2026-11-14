import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatShortDateTime } from './format';
import { formatVideoDuration, MediaAsset, photos } from './media';

type Props = {
  asset: MediaAsset | null;
  list: MediaAsset[];
  onClose: () => void;
};

/** Full-screen view of one asset. Videos show their poster frame and length only. */
export function MediaViewer({ asset, list, onClose }: Props) {
  const [current, setCurrent] = useState<MediaAsset | null>(asset);
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => setCurrent(asset), [asset]);

  useEffect(() => {
    if (!current || current.source != null) {
      return;
    }
    let alive = true;
    setUri(null);
    photos
      .getThumbnail(current.id, 1600)
      .then(u => alive && setUri(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [current]);

  if (!current) {
    return null;
  }
  const i = list.findIndex(a => a.id === current.id);
  const go = (d: number) => {
    const next = list[i + d];
    if (next) {
      setCurrent(next);
    }
  };

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.screen}>
        {current.source != null ? (
          <Image
            source={current.source}
            style={styles.image}
            resizeMode="contain"
          />
        ) : uri ? (
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        ) : null}
        <View style={styles.bar}>
          <Text style={styles.meta}>
            {formatShortDateTime(current.createdAt)}
            {current.mediaType === 'video'
              ? ` · 영상 ${formatVideoDuration(current.duration)}`
              : ''}
            {list.length > 1 ? ` · ${i + 1}/${list.length}` : ''}
          </Text>
          {current.sample ? (
            <Text style={styles.note}>
              샘플 {current.mediaType === 'video' ? '영상' : '사진'}이에요. 앱에
              들어 있는 확인용 이미지로, 실제 사진이 아니에요.
            </Text>
          ) : null}
          {current.mediaType === 'video' ? (
            <Text style={styles.note}>
              {current.sample
                ? '영상은 첫 장면과 길이만 보여 줘요.'
                : '이 버전은 영상의 첫 장면만 보여 줘요. 재생은 사진 앱에서 할 수 있어요.'}
            </Text>
          ) : null}
          <View style={styles.buttons}>
            <Pressable
              onPress={() => go(-1)}
              disabled={i <= 0}
              accessibilityRole="button"
              style={styles.btn}
            >
              <Text style={[styles.btnText, i <= 0 && styles.off]}>이전</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={styles.btn}
            >
              <Text style={styles.btnText}>닫기</Text>
            </Pressable>
            <Pressable
              onPress={() => go(1)}
              disabled={i >= list.length - 1}
              accessibilityRole="button"
              style={styles.btn}
            >
              <Text
                style={[styles.btnText, i >= list.length - 1 && styles.off]}
              >
                다음
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000', justifyContent: 'center' },
  image: { flex: 1 },
  bar: { padding: 20, paddingBottom: 40, backgroundColor: 'rgba(0,0,0,0.8)' },
  meta: { color: '#FFFFFF', fontSize: 15 },
  note: { color: '#C9CEC6', fontSize: 13, marginTop: 6 },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  btn: {
    minHeight: 44,
    minWidth: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  off: { opacity: 0.3 },
});
