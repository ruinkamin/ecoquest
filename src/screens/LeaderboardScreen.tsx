import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, LeaderboardEntry, OrganizationLeaderboardEntry } from '../api';
import { ThemeColors } from '../theme';
import { OrganizationProfileScreen } from './OrganizationProfileScreen';

interface Props {
  colors: ThemeColors;
  currentUserId?: number;
  onBack: () => void;
}

type RankingTab = 'volunteers' | 'organizations';

export const LeaderboardScreen: React.FC<Props> = ({ colors, currentUserId, onBack }) => {
  const [activeTab, setActiveTab] = useState<RankingTab>('volunteers');
  const [volunteers, setVolunteers] = useState<LeaderboardEntry[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationLeaderboardEntry[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [leaderboard, orgLeaderboard] = await Promise.all([
        api.getLeaderboard(),
        api.getOrganizationLeaderboard(),
      ]);
      setVolunteers(leaderboard);
      setOrganizations(orgLeaderboard);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Не вдалося завантажити рейтинг.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  if (selectedOrganizationId !== null) {
    return (
      <OrganizationProfileScreen
        organizationId={selectedOrganizationId}
        colors={colors}
        onBack={() => setSelectedOrganizationId(null)}
      />
    );
  }

  if (selectedOrganizationId !== null) {
    return (
      <OrganizationProfileScreen
        organizationId={selectedOrganizationId}
        colors={colors}
        onBack={() => setSelectedOrganizationId(null)}
      />
    );
  }

  const rankBadge = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Назад">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Рейтинг</Text>
        <TouchableOpacity onPress={() => void load()} accessibilityRole="button" accessibilityLabel="Оновити рейтинг">
          <Ionicons name="refresh" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {([
          ['volunteers', 'Волонтери'],
          ['organizations', 'Організації'],
        ] as [RankingTab, string][]).map(([tab, label]) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[
              styles.tabButton,
              { borderBottomColor: activeTab === tab ? colors.primary : 'transparent' },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: activeTab === tab }}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primaryDark : colors.textSecondary }]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={colors.primaryDark} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Завантажуємо рейтинг…</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={[styles.messageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.messageText, { color: colors.danger }]}>{error}</Text>
            <TouchableOpacity onPress={() => void load()} accessibilityRole="button">
              <Text style={[styles.retry, { color: colors.primaryDark }]}>Спробувати ще раз</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!loading && !error && activeTab === 'volunteers' ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Топ волонтерів</Text>
            <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>За кількістю зароблених XP</Text>
            {volunteers.map((entry, index) => {
              const isCurrentUser = currentUserId !== undefined && currentUserId === entry.user.id;
              return (
                <View
                  key={entry.user.id}
                  style={[
                    styles.row,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    isCurrentUser && { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                  ]}
                >
                  <View style={styles.rankBox}>
                    <Text style={[styles.rankText, { color: isCurrentUser ? colors.primaryDark : colors.textSecondary }]}>
                      {rankBadge(index)}
                    </Text>
                  </View>
                  <View style={styles.entryCopy}>
                    <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                      {entry.user.name}{isCurrentUser ? ' · Ви' : ''}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>Рівень {entry.level}</Text>
                  </View>
                  <View style={[styles.scoreBox, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.score, { color: colors.primaryDark }]}>{entry.lifetime_xp} XP</Text>
                  </View>
                </View>
              );
            })}
            {!volunteers.length ? <EmptyState colors={colors} text="Рейтинг з’явиться після перших підтверджених квестів." /> : null}
          </>
        ) : null}

        {!loading && !error && activeTab === 'organizations' ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Топ організацій</Text>
            <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>За накопиченими організаційними балами · торкніться, щоб відкрити профіль</Text>
            {organizations.map((entry, index) => (
              <TouchableOpacity
                key={entry.organization.id}
                onPress={() => setSelectedOrganizationId(entry.organization.id)}
                style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={`Відкрити профіль організації ${entry.organization.name}`}
              >
                <View style={styles.rankBox}>
                  <Text style={[styles.rankText, { color: colors.textSecondary }]}>{rankBadge(index)}</Text>
                </View>
                <View style={styles.orgIcon}>
                  <Ionicons name="leaf" size={18} color={colors.primaryDark} />
                </View>
                <View style={styles.entryCopy}>
                  <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                    {entry.organization.name}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>Публічний профіль організації</Text>
                </View>
                <View style={[styles.scoreBox, { backgroundColor: colors.goldLight }]}>
                  <Text style={[styles.score, { color: colors.gold }]}>{entry.points.toLocaleString('uk-UA')} балів</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
            {!organizations.length ? <EmptyState colors={colors} text="Поки немає організацій у рейтингу." /> : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const EmptyState: React.FC<{ colors: ThemeColors; text: string }> = ({ colors, text }) => (
  <View style={[styles.messageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.messageText, { color: colors.textSecondary }]}>{text}</Text>
  </View>
);

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
  title: { fontSize: 22, fontWeight: '900' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 12 },
  tabButton: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2 },
  tabText: { fontSize: 13, fontWeight: '800' },
  scroll: { padding: 16, paddingBottom: 48 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  sectionSub: { fontSize: 12, lineHeight: 17, marginTop: 2, marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 62,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  rankBox: { width: 38, justifyContent: 'center', alignItems: 'center' },
  rankText: { fontSize: 13, fontWeight: '900' },
  orgIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#E8FDF3', alignItems: 'center', justifyContent: 'center' },
  entryCopy: { flex: 1, paddingHorizontal: 8 },
  name: { fontSize: 13, fontWeight: '800' },
  meta: { fontSize: 10, marginTop: 3 },
  scoreBox: { paddingHorizontal: 8, paddingVertical: 7, borderRadius: 10, marginRight: 5 },
  score: { fontSize: 10, fontWeight: '900' },
  messageCard: { borderWidth: 1, borderRadius: 15, padding: 14, marginTop: 8 },
  messageText: { fontSize: 13, lineHeight: 18 },
  retry: { fontSize: 12, fontWeight: '900', marginTop: 9 },
  loaderWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  loadingText: { marginTop: 10, fontSize: 13 },
});
