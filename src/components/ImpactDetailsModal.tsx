import React from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ImpactItem, getPhotoUrl } from '../api';
import { ThemeColors } from '../theme';

const DIFFICULTY_LABELS = ['', 'Дуже легко', 'Легко', 'Середньо', 'Складно', 'Дуже складно'];

interface Props {
  item: ImpactItem;
  colors: ThemeColors;
  onClose: () => void;
}

/** Подробности подтвержденной доброй справы: фото до/после, что сделано, сложность, участники. */
export const ImpactDetailsModal: React.FC<Props> = ({ item, colors, onClose }) => {
  const insets = useSafeAreaInsets();
  const before = getPhotoUrl(item.photo_before_url);
  const after = getPhotoUrl(item.photo_after_url);
  const date = item.completed_at
    ? new Date(item.completed_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const organization = item.executor_org_name || item.owner_org_name;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.header}>
            <View style={[styles.doneIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="checkmark" size={18} color={colors.primaryDark} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
              {item.title || 'Виконаний квест'}
            </Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрити">
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <PhotoBlock url={before} label="ДО" colors={colors} />
            <PhotoBlock url={after} label="ПІСЛЯ" colors={colors} accent />

            <View style={styles.stats}>
              <Stat icon="flash" value={`${item.final_percent}%`} label="виконано" colors={colors} />
              {item.difficulty ? (
                <Stat icon="barbell-outline" value={`${item.difficulty}/5`} label={DIFFICULTY_LABELS[item.difficulty] ?? 'складність'} colors={colors} />
              ) : null}
              {item.xp_per_participant != null ? (
                <Stat icon="star" value={`+${item.xp_per_participant}`} label="XP кожному" colors={colors} />
              ) : null}
            </View>

            {item.description ? (
              <Section title="Що було зроблено" colors={colors}>
                <Text style={[styles.text, { color: colors.textPrimary }]}>{item.description}</Text>
              </Section>
            ) : null}

            <Section title="Деталі" colors={colors}>
              {organization ? <Row icon="business-outline" text={organization} colors={colors} /> : null}
              {date ? <Row icon="calendar-outline" text={`Підтверджено ${date}`} colors={colors} /> : null}
              {item.reward_xp != null ? <Row icon="trophy-outline" text={`Нагорода за квест: ${item.reward_xp} XP`} colors={colors} /> : null}
              <Row icon="location-outline" text={`${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`} colors={colors} />
            </Section>

            <Section title={`Учасники (${item.team.length})`} colors={colors}>
              {item.team.length ? (
                <View style={styles.team}>
                  {item.team.map((member) => (
                    <View key={member.id} style={[styles.member, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
                        <Text style={[styles.initial, { color: colors.primaryDark }]}>{member.name.slice(0, 1).toLocaleUpperCase()}</Text>
                      </View>
                      <Text style={[styles.memberName, { color: colors.textPrimary }]}>{member.name}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.text, { color: colors.textSecondary }]}>Волонтери EcoQuest</Text>
              )}
            </Section>

            {item.note && item.note !== 'mock' ? (
              <Section title="Коментар перевірки" colors={colors}>
                <Text style={[styles.text, { color: colors.textSecondary }]}>{item.note}</Text>
              </Section>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const PhotoBlock: React.FC<{ url?: string; label: string; colors: ThemeColors; accent?: boolean }> = ({ url, label, colors, accent }) => (
  <View style={[styles.photoWrap, { backgroundColor: colors.surfaceSubtle }]}>
    {url ? (
      <Image source={{ uri: url }} style={styles.photo} resizeMode="cover" />
    ) : (
      <Ionicons name="image-outline" size={30} color={colors.textMuted} />
    )}
    <View style={[styles.photoLabel, { backgroundColor: colors.card }]}>
      <Text style={[styles.photoLabelText, { color: accent ? colors.primaryDark : colors.textSecondary }]}>{label}</Text>
    </View>
  </View>
);

const Stat: React.FC<{ icon: React.ComponentProps<typeof Ionicons>['name']; value: string; label: string; colors: ThemeColors }> = ({ icon, value, label, colors }) => (
  <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Ionicons name={icon} size={15} color={colors.gold} />
    <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
  </View>
);

const Section: React.FC<{ title: string; colors: ThemeColors; children: React.ReactNode }> = ({ title, colors, children }) => (
  <View style={styles.section}>
    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
    {children}
  </View>
);

const Row: React.FC<{ icon: React.ComponentProps<typeof Ionicons>['name']; text: string; colors: ThemeColors }> = ({ icon, text, colors }) => (
  <View style={styles.row}>
    <Ionicons name={icon} size={16} color={colors.primaryDark} />
    <Text style={[styles.text, { color: colors.textPrimary, flex: 1 }]}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '94%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, marginBottom: 10 },
  doneIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 17, fontWeight: '900' },
  body: { paddingHorizontal: 18, paddingBottom: 8, gap: 10 },
  photoWrap: { height: 190, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', height: '100%' },
  photoLabel: { position: 'absolute', left: 10, top: 10, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  photoLabelText: { fontSize: 10, fontWeight: '900' },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 13, padding: 10, gap: 2 },
  statValue: { fontSize: 17, fontWeight: '900' },
  statLabel: { fontSize: 10 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '900' },
  text: { fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  team: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingLeft: 4, paddingRight: 10 },
  avatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 11, fontWeight: '900' },
  memberName: { fontSize: 12, fontWeight: '700' },
});
