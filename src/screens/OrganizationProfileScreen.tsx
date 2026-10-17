import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  ImpactItem,
  OrganizationDetail,
  OrganizationStats,
  api,
  getPhotoUrl,
} from '../api';
import { ThemeColors } from '../theme';
import { ImpactDetailsModal } from '../components/ImpactDetailsModal';

interface Props {
  organizationId: number;
  colors: ThemeColors;
  onBack: () => void;
}

export const OrganizationProfileScreen: React.FC<Props> = ({
  organizationId,
  colors,
  onBack,
}) => {
  const [organization, setOrganization] = useState<OrganizationDetail | null>(null);
  const [stats, setStats] = useState<OrganizationStats | null>(null);
  const [history, setHistory] = useState<ImpactItem[]>([]);
  const [openedItem, setOpenedItem] = useState<ImpactItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [details, organizationStats, completedWork] = await Promise.all([
        api.getOrganization(organizationId),
        api.getOrganizationStats(organizationId),
        api.getOrganizationImpact(organizationId),
      ]);
      setOrganization(details);
      setStats(organizationStats);
      setHistory(completedWork);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Не вдалося завантажити профіль організації.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Назад">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Організація</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.primaryDark} />
          </View>
        ) : null}

        {error ? (
          <View style={[styles.errorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            <TouchableOpacity onPress={() => void load()} accessibilityRole="button" accessibilityLabel="Спробувати ще раз">
              <Ionicons name="refresh" size={20} color={colors.primaryDark} />
            </TouchableOpacity>
          </View>
        ) : null}

        {!loading && organization && stats ? (
          <>
            <View style={styles.identity}>
              {organization.logo_url && getPhotoUrl(organization.logo_url) ? (
                <Image
                  source={{ uri: getPhotoUrl(organization.logo_url) }}
                  style={[styles.logo, { backgroundColor: colors.primaryLight }]}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.logo, styles.logoFallback, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="leaf" size={34} color={colors.primaryDark} />
                </View>
              )}
              <View style={styles.identityCopy}>
                <Text style={[styles.name, { color: colors.textPrimary }]}>{organization.name}</Text>
                {organization.description ? (
                  <Text style={[styles.description, { color: colors.textSecondary }]}>
                    {organization.description}
                  </Text>
                ) : null}
                <View style={[styles.verifiedBadge, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.primaryDark} />
                  <Text style={[styles.verifiedText, { color: colors.primaryDark }]}>Перевірена організація</Text>
                </View>
              </View>
            </View>

            <View style={styles.metrics}>
              <Metric
                value={organization.completed_quests ?? stats.quests_completed_owned + stats.quests_completed_as_executor}
                label="Виконано"
                icon="checkmark-circle"
                colors={colors}
              />
              <Metric value={stats.points} label="Орг. бали" icon="ribbon" colors={colors} />
              <Metric value={stats.members} label="Учасники" icon="people" colors={colors} />
            </View>

            {organization.head ? (
              <View style={[styles.adminCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.adminHeading, { color: colors.textPrimary }]}>Адміністратор</Text>
                <View style={styles.adminRow}>
                  <View style={[styles.adminAvatar, { backgroundColor: colors.purpleLight }]}>
                    <Text style={[styles.adminInitial, { color: colors.secondaryPurple }]}>
                      {organization.head.name.slice(0, 1).toLocaleUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.adminCopy}>
                    <Text style={[styles.adminName, { color: colors.textPrimary }]}>{organization.head.name}</Text>
                    <Text style={[styles.adminDate, { color: colors.textSecondary }]}>
                      {organization.created_at
                        ? `Організацію створено ${new Date(organization.created_at).toLocaleDateString('uk-UA')}`
                        : 'Головний акаунт організації'}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            <View style={styles.historyHeading}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Історія добрих справ</Text>
              <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
                Підтверджені квести з фото до та після
              </Text>
            </View>

            {history.map((item) => (
              <HistoryCard key={item.quest_id} item={item} colors={colors} onPress={() => setOpenedItem(item)} />
            ))}
            {!history.length ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="leaf-outline" size={22} color={colors.primaryDark} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Підтверджені справи з’являться тут після виконання квестів.
                </Text>
              </View>
            ) : null}

            {organization.members?.length ? (
              <>
                <Text style={[styles.sectionTitle, styles.membersHeading, { color: colors.textPrimary }]}>
                  Команда
                </Text>
                <View style={[styles.membersCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {organization.members.map((member) => (
                    <View key={member.id} style={styles.memberRow}>
                      <View style={[styles.memberAvatar, { backgroundColor: colors.primaryLight }]}>
                        <Text style={[styles.memberInitial, { color: colors.primaryDark }]}>
                          {member.name.slice(0, 1).toLocaleUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.memberName, { color: colors.textPrimary }]}>{member.name}</Text>
                      {member.role === 'moderator' ? (
                        <Text style={[styles.memberRole, { color: colors.textSecondary }]}>Модератор</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      {openedItem ? <ImpactDetailsModal item={openedItem} colors={colors} onClose={() => setOpenedItem(null)} /> : null}
    </SafeAreaView>
  );
};

const Metric: React.FC<{
  value: number;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  colors: ThemeColors;
}> = ({ value, label, icon, colors }) => (
  <View style={[styles.metric, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Ionicons name={icon} size={16} color={colors.primaryDark} />
    <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{value.toLocaleString('uk-UA')}</Text>
    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
  </View>
);

const HistoryCard: React.FC<{ item: ImpactItem; colors: ThemeColors; onPress: () => void }> = ({ item, colors, onPress }) => {
  const before = getPhotoUrl(item.photo_before_url);
  const after = getPhotoUrl(item.photo_after_url);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Деталі: ${item.title || 'виконаний квест'}`}
      style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.historyPhotos}>
        {before ? <Image source={{ uri: before }} style={styles.historyPhoto} resizeMode="cover" /> : null}
        {after ? <Image source={{ uri: after }} style={styles.historyPhoto} resizeMode="cover" /> : null}
        <View style={[styles.beforeLabel, { backgroundColor: colors.card }]}>
          <Text style={[styles.photoLabelText, { color: colors.textSecondary }]}>ДО</Text>
        </View>
        <View style={[styles.afterLabel, { backgroundColor: colors.card }]}>
          <Text style={[styles.photoLabelText, { color: colors.primaryDark }]}>ПІСЛЯ</Text>
        </View>
      </View>
      <View style={styles.historyInfo}>
        <View style={[styles.doneIcon, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="checkmark" size={17} color={colors.primaryDark} />
        </View>
        <View style={styles.historyCopy}>
          <Text style={[styles.historyTitle, { color: colors.textPrimary }]}>
            {item.title || 'Виконаний квест'}
          </Text>
          <Text style={[styles.historyMeta, { color: colors.textSecondary }]}>
            {item.completed_at ? new Date(item.completed_at).toLocaleDateString('uk-UA') : 'Дата не вказана'}
            {item.team.length ? ` · команда з ${item.team.length}` : ''}
          </Text>
        </View>
        <View style={[styles.pointsBadge, { backgroundColor: colors.goldLight }]}>
          <Ionicons name="flash" size={12} color={colors.gold} />
          <Text style={[styles.pointsText, { color: colors.gold }]}>{item.final_percent}%</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  topTitle: { fontSize: 18, fontWeight: '900' },
  topSpacer: { width: 24 },
  scroll: { padding: 16, paddingBottom: 48 },
  loader: { padding: 28, alignItems: 'center' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14 },
  errorText: { flex: 1, fontSize: 13 },
  identity: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 16 },
  logo: { width: 70, height: 70, borderRadius: 18 },
  logoFallback: { justifyContent: 'center', alignItems: 'center' },
  identityCopy: { flex: 1 },
  name: { fontSize: 21, fontWeight: '900' },
  description: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  verifiedBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, marginTop: 6 },
  verifiedText: { fontSize: 10, fontWeight: '800' },
  metrics: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  metric: { flex: 1, alignItems: 'flex-start', padding: 11, borderRadius: 15, borderWidth: 1 },
  metricValue: { fontSize: 19, fontWeight: '900', marginTop: 3 },
  metricLabel: { fontSize: 10, marginTop: 1 },
  adminCard: { padding: 13, borderWidth: 1, borderRadius: 16, marginBottom: 18 },
  adminHeading: { fontSize: 13, fontWeight: '900', marginBottom: 10 },
  adminRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  adminAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  adminInitial: { fontSize: 13, fontWeight: '900' },
  adminCopy: { flex: 1 },
  adminName: { fontSize: 13, fontWeight: '800' },
  adminDate: { fontSize: 10, marginTop: 2 },
  historyHeading: { marginBottom: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '900' },
  sectionSub: { fontSize: 11, marginTop: 2 },
  historyCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 9 },
  historyPhotos: { flexDirection: 'row', height: 118, backgroundColor: '#E2E8F0' },
  historyPhoto: { width: '50%', height: '100%' },
  beforeLabel: { position: 'absolute', left: 8, top: 8, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  afterLabel: { position: 'absolute', right: 8, top: 8, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  photoLabelText: { fontSize: 9, fontWeight: '900' },
  historyInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
  doneIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  historyCopy: { flex: 1 },
  historyTitle: { fontSize: 12, fontWeight: '800' },
  historyMeta: { fontSize: 10, marginTop: 3 },
  pointsBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 5 },
  pointsText: { fontSize: 10, fontWeight: '900' },
  emptyCard: { borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 9 },
  emptyText: { flex: 1, fontSize: 12, lineHeight: 17 },
  membersHeading: { marginTop: 16, marginBottom: 8 },
  membersCard: { borderWidth: 1, borderRadius: 15, padding: 11 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  memberAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  memberInitial: { fontSize: 11, fontWeight: '900' },
  memberName: { flex: 1, fontSize: 12, fontWeight: '700' },
  memberRole: { fontSize: 10 },
});
