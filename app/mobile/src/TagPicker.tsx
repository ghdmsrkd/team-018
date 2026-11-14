import { useEffect, useState } from 'react';
import {
  Button,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NearbyPlaceSearch } from './NearbyPlaceSearch';
import { RegionCheck } from './RegionCheck';
import { PlaceTag, Visit, visitMonitor } from './visitMonitor';

/** The tag operations the sheet needs; the sample mode passes an in-memory version. */
export type TagApi = Pick<
  typeof visitMonitor,
  'getTags' | 'createTag' | 'renameTag' | 'setVisitTag' | 'clearVisitTag'
>;

type Props = {
  /** A stored visit (positive id). Never a JS-only sample row. */
  visit: Visit | null;
  onClose: () => void;
  /** Defaults to the native store. */
  api?: TagApi;
  /** Sample mode: nearby search uses fixed local candidates. */
  sample?: boolean;
};

export function describeTag(visit: Visit): string {
  const tag = visit.tag;
  if (!tag) {
    return '장소 태그 없음';
  }
  if (tag.source === 'auto') {
    const meters =
      tag.matchDistance == null ? '' : ` · ${tag.matchDistance.toFixed(0)} m`;
    return `장소: ${tag.name} (자동${meters})`;
  }
  return `장소: ${tag.name}`;
}

/** Select, create or rename place tags for one stored visit, or clear its tag. */
export function TagPicker({
  visit,
  onClose,
  api = visitMonitor,
  sample = false,
}: Props) {
  const [tags, setTags] = useState<PlaceTag[]>([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = visit != null;

  useEffect(() => {
    if (!visible) {
      return;
    }
    setNewName('');
    setEditingId(null);
    setError(null);
    api
      .getTags()
      .then(setTags)
      .catch(e => setError(String(e?.message ?? e)));
  }, [visible, api]);

  const run = async (work: () => Promise<unknown>, close: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      if (close) {
        onClose();
      } else {
        setTags(await api.getTags());
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  if (!visit) {
    return null;
  }

  const select = (tag: PlaceTag) =>
    run(() => api.setVisitTag(visit.id, tag.id), true);

  const create = () =>
    run(async () => {
      const tag = await api.createTag(newName);
      await api.setVisitTag(visit.id, tag.id);
    }, true);

  const saveRename = (tag: PlaceTag) =>
    run(async () => {
      await api.renameTag(tag.id, editName);
      setEditingId(null);
    }, false);

  const renderTag = ({ item }: { item: PlaceTag }) => {
    const selected = visit.tag?.id === item.id;
    if (editingId === item.id) {
      return (
        <View style={styles.tagRow}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={editName}
            onChangeText={setEditName}
            autoFocus
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={() => saveRename(item)}
          />
          <Button
            title="저장"
            disabled={busy}
            onPress={() => saveRename(item)}
          />
          <Button title="취소" onPress={() => setEditingId(null)} />
        </View>
      );
    }
    return (
      <View style={styles.tagRow}>
        <Pressable
          style={styles.flex}
          disabled={busy}
          onPress={() => select(item)}
          accessibilityRole="button"
          accessibilityState={{ selected }}
        >
          <Text style={[styles.tagName, selected && styles.selected]}>
            {selected ? '✓ ' : ''}
            {item.name}
            {selected && visit.tag?.source === 'auto' ? ' (자동)' : ''}
          </Text>
        </Pressable>
        {item.isPreset ? null : (
          <Button
            title="이름 변경"
            onPress={() => {
              setEditingId(item.id);
              setEditName(item.name);
            }}
          />
        )}
      </View>
    );
  };

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        <View style={styles.top}>
          <Text style={styles.title}>장소 태그</Text>
          <Button title="닫기" onPress={onClose} />
        </View>
        <Text style={styles.current}>{describeTag(visit)}</Text>
        {visit.tag?.source === 'auto' ? (
          <Text style={styles.hint}>
            자동 지정된 태그입니다. 같은 태그를 다시 선택하면 직접 지정으로
            바뀝니다.
          </Text>
        ) : null}
        {visit.tag ? (
          <View style={styles.clear}>
            <Button
              title="태그 해제"
              color="#c62828"
              disabled={busy}
              onPress={() =>
                run(
                  () =>
                    Promise.all(
                      [visit.id, ...(visit.mergedVisitIds ?? [])].map(id =>
                        api.clearVisitTag(id),
                      ),
                    ),
                  true,
                )
              }
            />
          </View>
        ) : null}
        <View style={styles.tagRow}>
          <TextInput
            style={[styles.input, styles.flex]}
            placeholder="새 장소 태그"
            value={newName}
            onChangeText={setNewName}
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={() => newName.trim() && create()}
          />
          <Button
            title="추가"
            disabled={busy || newName.trim().length === 0}
            onPress={create}
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <FlatList
          data={tags}
          keyExtractor={t => String(t.id)}
          renderItem={renderTag}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <NearbyPlaceSearch
                key={visit.id}
                visit={visit}
                reason={visit.tag ? 'manual' : 'untagged'}
                sample={sample}
              />
              {/* Live only: the sample mode never sends coordinates anywhere. */}
              {sample ? null : (
                <RegionCheck key={`r${visit.id}`} visit={visit} />
              )}
            </View>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#ffffff', paddingTop: 12 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  title: { fontSize: 20, fontWeight: '600', color: '#000000' },
  current: {
    paddingHorizontal: 16,
    marginTop: 8,
    fontSize: 15,
    color: '#222222',
  },
  hint: { paddingHorizontal: 16, marginTop: 4, fontSize: 13, color: '#666666' },
  clear: { paddingHorizontal: 8, marginTop: 4, alignItems: 'flex-start' },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dddddd',
  },
  flex: { flex: 1 },
  tagName: { fontSize: 16, color: '#000000' },
  selected: { fontWeight: '700' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999999',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    marginRight: 8,
  },
  error: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    fontSize: 14,
    color: '#c62828',
  },
});
