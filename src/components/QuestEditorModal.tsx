import React, { useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Quest, QuestChanges, getPhotoUrl } from '../api';
import { ThemeColors } from '../theme';
import { Button } from './Common';

interface Props {
  quest: Quest;
  colors: ThemeColors;
  onClose: () => void;
  onSave: (changes: QuestChanges) => Promise<void>;
  // Публикация и блокировка доступны, пока квест ждет решения.
  onPublish?: (changes: QuestChanges, note: string) => Promise<void>;
  onBlock?: (reason: string) => Promise<void>;
  // Квест с hazard публикует только модератор платформы.
  canPublishHazard?: boolean;
}

/** Модератор правит то, что предложил AI (назва, опис, складність, XP), и публикует или блокирует квест. */
export const QuestEditorModal: React.FC<Props> = ({ quest, colors, onClose, onSave, onPublish, onBlock, canPublishHazard = false }) => {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(quest.title ?? '');
  const [description, setDescription] = useState(quest.description ?? '');
  const [difficulty, setDifficulty] = useState(quest.difficulty ?? 1);
  const [xp, setXp] = useState(quest.reward_xp != null ? String(quest.reward_xp) : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'save' | 'publish' | 'block' | null>(null);
  const [error, setError] = useState('');

  const ai = quest.ai_result;
  const photo = getPhotoUrl(quest.photo_url);

  // Отправляем только измененные поля. Сложность без XP — сервер пересчитает XP по таблице.
  const changes = (): QuestChanges => {
    const result: QuestChanges = {};
    if (title.trim() && title.trim() !== (quest.title ?? '')) result.title = title.trim();
    if (description.trim() !== (quest.description ?? '')) result.description = description.trim();
    if (difficulty !== quest.difficulty) result.difficulty = difficulty;
    const xpValue = Number(xp);
    if (xp.trim() && Number.isFinite(xpValue) && xpValue !== quest.reward_xp) {
      if (xpValue < 0 || xpValue > 5000) throw new Error('XP має бути від 0 до 5000.');
      result.reward_xp = Math.round(xpValue);
    }
    return result;
  };

  const act = async (kind: 'save' | 'publish' | 'block') => {
    setBusy(kind);
    setError('');
    try {
      if (kind === 'block') {
        if (!note.trim()) throw new Error('Вкажіть причину блокування — її побачить автор.');
        await onBlock?.(note.trim());
      } else if (kind === 'publish') {
        await onPublish?.(changes(), note.trim());
      } else {
        const edit = changes();
        if (!Object.keys(edit).length) throw new Error('Нічого не змінено.');
        await onSave(edit);
      }
      onClose();
    } catch (actionError: unknown) {
      setError(actionError instanceof Error ? actionError.message : 'Не вдалося зберегти.');
    } finally {
      setBusy(null);
    }
  };

  const inputStyle = [styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: 16 + insets.bottom, maxHeight: '92%' }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Редагування квесту</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрити">
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {photo ? <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" /> : null}

            {ai ? (
              <View style={[styles.aiBox, { backgroundColor: ai.hazard ? colors.dangerLight : colors.primaryLight }]}>
                <View style={styles.aiHeader}>
                  <Ionicons name="sparkles" size={16} color={ai.hazard ? colors.danger : colors.primaryDark} />
                  <Text style={[styles.aiTitle, { color: ai.hazard ? colors.danger : colors.primaryDark }]}>
                    {ai.hazard ? 'AI бачить небезпеку — опублікує лише модератор платформи' : 'AI пропонує'}
                  </Text>
                </View>
                <Text style={[styles.aiText, { color: colors.textPrimary }]}>
                  {[ai.title ? `«${ai.title}»` : null, ai.difficulty ? `складність ${ai.difficulty}` : null]
                    .filter(Boolean).join(' · ') || 'Без пропозиції назви'}
                </Text>
                {ai.reason && ai.reason !== 'mock' ? (
                  <Text style={[styles.aiText, { color: colors.textSecondary }]}>{ai.reason}</Text>
                ) : null}
                {ai.approved === false && !ai.hazard ? (
                  <Text style={[styles.aiText, { color: colors.danger }]}>AI не рекомендує публікувати, але рішення за вами.</Text>
                ) : null}
              </View>
            ) : null}

            <Text style={[styles.label, { color: colors.textSecondary }]}>Назва</Text>
            <TextInput style={inputStyle} value={title} onChangeText={setTitle} maxLength={120} placeholder="Що потрібно зробити" placeholderTextColor={colors.textMuted} />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Опис</Text>
            <TextInput
              style={[inputStyle, styles.multiline]}
              value={description}
              onChangeText={setDescription}
              maxLength={1000}
              multiline
              placeholder="Інструкції для волонтерів"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Складність</Text>
            <View style={styles.difficultyRow}>
              {[1, 2, 3, 4, 5].map((level) => {
                const selected = difficulty === level;
                return (
                  <TouchableOpacity
                    key={level}
                    onPress={() => setDifficulty(level)}
                    style={[
                      styles.difficulty,
                      { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primaryLight : colors.surface },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text style={{ color: selected ? colors.primaryDark : colors.textSecondary, fontWeight: '900' }}>{level}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Нагорода, XP</Text>
            <TextInput
              style={inputStyle}
              value={xp}
              onChangeText={(value) => setXp(value.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="Порожньо — за таблицею складності"
              placeholderTextColor={colors.textMuted}
            />

            {onPublish || onBlock ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Коментар (для блокування — обовʼязково)</Text>
                <TextInput style={inputStyle} value={note} onChangeText={setNote} maxLength={500} placeholder="Причина рішення" placeholderTextColor={colors.textMuted} />
              </>
            ) : null}

            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

            <View style={styles.buttons}>
              {onPublish ? (
                <Button title="Зберегти й опублікувати" colors={colors} loading={busy === 'publish'} disabled={!!busy || (!!ai?.hazard && !canPublishHazard)} onPress={() => void act('publish')} />
              ) : null}
              <Button title="Зберегти зміни" colors={colors} variant="secondary" loading={busy === 'save'} disabled={!!busy} onPress={() => void act('save')} />
              {onBlock ? (
                <Button title="Заблокувати" colors={colors} variant="danger" loading={busy === 'block'} disabled={!!busy} onPress={() => void act('block')} />
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '900' },
  body: { paddingHorizontal: 18, paddingBottom: 8, gap: 6 },
  photo: { width: '100%', height: 170, borderRadius: 14, backgroundColor: '#E2E8F0', marginBottom: 4 },
  aiBox: { borderRadius: 12, padding: 11, gap: 4, marginBottom: 4 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiTitle: { fontSize: 12, fontWeight: '900', flex: 1 },
  aiText: { fontSize: 12, lineHeight: 17 },
  label: { fontSize: 11, fontWeight: '800', marginTop: 4 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9, fontSize: 14 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  difficultyRow: { flexDirection: 'row', gap: 7 },
  difficulty: { flex: 1, height: 42, borderWidth: 1.5, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  buttons: { gap: 8, marginTop: 10 },
});
