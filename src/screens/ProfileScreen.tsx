import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemeColors } from '../theme';
import { Badge, Button } from '../components/Common';
import { Ionicons } from '@expo/vector-icons';
import {
  ApiError,
  ApiUser,
  Redemption,
  Quest,
  Reward,
  UserStats,
  api,
} from '../api';

type ProfileTab = 'profile' | 'activity' | 'rewards' | 'codes';
type QuestKind = 'taken' | 'created' | 'completed';

interface Props {
  userName: string;
  userId: number;
  lifetimeXp: number;
  spendableXp: number;
  level: number;
  colors: ThemeColors;
  isDark: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
  onProfileUpdated: (user: ApiUser) => void;
  onPortfolio: () => void;
  onOpenCommunity: () => void;
  onOpenMap: () => void;
}

export const ProfileScreen: React.FC<Props> = ({
  userName,
  userId,
  lifetimeXp,
  spendableXp,
  level,
  colors,
  isDark,
  onToggleTheme,
  onLogout,
  onProfileUpdated,
  onPortfolio,
  onOpenCommunity,
  onOpenMap,
}) => {
  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
  const [stats, setStats] = useState<UserStats | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [myQuests, setMyQuests] = useState<Quest[]>([]);
  const [invitations, setInvitations] = useState<{ quest: Quest; status: string }[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [questKind, setQuestKind] = useState<QuestKind>('taken');
  const [redeemedCode, setRedeemedCode] = useState('');
  const [loadedTab, setLoadedTab] = useState<ProfileTab | null>(null);
  const [busyRewardId, setBusyRewardId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const requestNumber = useRef(0);
  const loading = loadedTab !== activeTab;

  const load = useCallback(async () => {
    const currentRequest = requestNumber.current + 1;
    requestNumber.current = currentRequest;
    try {
      if (activeTab === 'profile') {
        const [myStats, currentUser] = await Promise.all([api.getMyStats(), api.getMe()]);
        setStats(myStats);
        onProfileUpdated(currentUser);
      } else if (activeTab === 'rewards') {
        setRewards(await api.getRewards());
      } else if (activeTab === 'activity') {
        const [quests, myInvitations] = await Promise.all([
          api.getMyQuests(questKind),
          api.getMyInvitations(),
        ]);
        setMyQuests(quests);
        setInvitations(myInvitations);
      } else if (activeTab === 'codes') {
        setRedemptions(await api.getMyRedemptions());
      }
      if (requestNumber.current === currentRequest) setError('');
    } catch (loadError: unknown) {
      if (requestNumber.current === currentRequest) {
        setError(loadError instanceof Error ? loadError.message : 'Не вдалося завантажити дані профілю.');
      }
    } finally {
      if (requestNumber.current === currentRequest) setLoadedTab(activeTab);
    }
  }, [activeTab, onProfileUpdated, questKind]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const redeem = async (reward: Reward) => {
    setBusyRewardId(reward.id);
    setError('');
    try {
      const redemption = await api.redeemReward(reward.id);
      setRedeemedCode(redemption.code);
      onProfileUpdated(await api.getMe());
      setRewards(await api.getRewards());
    } catch (redeemError: unknown) {
      if (redeemError instanceof ApiError && redeemError.status === 401) return;
      setError(redeemError instanceof Error ? redeemError.message : 'Не вдалося обміняти XP.');
    } finally {
      setBusyRewardId(null);
    }
  };

  const sharePortfolio = async () => {
    try {
      await Share.share({
        message: `Моє перевірене волонтерське портфоліо EcoQuest: ecoquest://portfolio/${userId}`,
        title: `Портфоліо ${userName}`,
      });
    } catch (shareError: unknown) {
      Alert.alert('Не вдалося поділитися', shareError instanceof Error ? shareError.message : 'Спробуйте ще раз.');
    }
  };

  const answerInvitation = async (questId: number, accept: boolean) => {
    setError('');
    try {
      await api.respondParticipation(questId, accept);
      setInvitations(await api.getMyInvitations());
      if (activeTab === 'activity') setMyQuests(await api.getMyQuests(questKind));
    } catch (answerError: unknown) {
      setError(answerError instanceof Error ? answerError.message : 'Не вдалося відповісти на запрошення.');
    }
  };

  const displayName = userName.trim() || 'Волонтер EcoQuest';
  const initialLetters = displayName.slice(0, 2).toUpperCase();
  const progress = stats
    ? Math.min(100, Math.round((stats.level_progress_xp / Math.max(1, stats.xp_per_level)) * 100))
    : 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.tabBar, { borderBottomColor: colors.border }]}
      >
        {([
          ['profile', 'Профіль'],
          ['activity', 'Активність'],
          ['rewards', 'Нагороди'],
          ['codes', 'Мої коди'],
        ] as [ProfileTab, string][]).map(([tab, label]) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => {
              setActiveTab(tab);
              setRedeemedCode('');
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: activeTab === tab }}
          >
            <Text style={[styles.tabLabel, { color: activeTab === tab ? colors.primaryDark : colors.textSecondary }]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && !stats && activeTab === 'profile' ? (
          <ActivityIndicator color={colors.primaryDark} />
        ) : null}
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerLight }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            <TouchableOpacity onPress={() => void load()} accessibilityRole="button" accessibilityLabel="Спробувати ще раз">
              <Ionicons name="refresh" size={18} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ) : null}

        {activeTab === 'profile' && (
          <>
            <View style={[
              styles.userHeader,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
              <View style={[styles.avatarBox, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.avatarText, { color: colors.primaryDark }]}>{initialLetters}</Text>
              </View>
              <Text style={[styles.nameTitle, { color: colors.textPrimary }]}>{displayName}</Text>
              <Text style={[styles.userHandle, { color: colors.textSecondary }]}>
                {stats?.user.email || 'Перевірений волонтер EcoQuest'}
              </Text>
              {stats?.reliability != null && (
                <View style={{ marginTop: 7 }}>
                  <Badge label={`Надійність ${Math.round(stats.reliability * 100)}%`} />
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.themeRowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={onToggleTheme}
              accessibilityRole="button"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name={isDark ? 'sunny' : 'moon'} size={20} color={colors.primary} />
                <Text style={[styles.themeRowText, { color: colors.textPrimary }]}>
                  {isDark ? 'Увімкнути світлу тему' : 'Увімкнути темну тему'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={[styles.levelCard, { backgroundColor: colors.secondaryPurple }]}>
              <View style={styles.levelCardHeader}>
                <Text style={styles.levelCardTitle}>Рівень {stats?.level ?? level}</Text>
                <Text style={styles.levelCardSub}>{stats?.level_progress_xp ?? 0} / {stats?.xp_per_level ?? 500} XP</Text>
              </View>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <View style={styles.xpRow}>
                <Text style={styles.xpTextBold}>{stats?.lifetime_xp ?? lifetimeXp} XP зароблено</Text>
                <Text style={styles.xpTextMax}>{spendableXp} XP доступно</Text>
              </View>
            </View>

            {stats?.lifetime_xp === 0 && (
              <View style={[styles.firstQuestCard, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}>
                <View style={styles.firstQuestCopy}>
                  <Text style={[styles.firstQuestTitle, { color: colors.primaryDark }]}>Ваш перший внесок починається тут</Text>
                  <Text style={[styles.firstQuestText, { color: colors.textSecondary }]}>
                    Оберіть квест на мапі. XP з&apos;явиться після перевіреного виконання.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onOpenMap}
                  style={[styles.firstQuestButton, { backgroundColor: colors.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel="Знайти перший квест на мапі"
                >
                  <Ionicons name="arrow-forward" size={19} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.statsGrid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Metric value={stats?.quests_completed ?? 0} label="Квестів" colors={colors} />
              <Metric value={`${Math.round((stats?.reliability || 0) * 100)}%`} label="Надійність" colors={colors} />
              <Metric value={`${Math.round(stats?.avg_completion_percent || 0)}%`} label="Середнє виконання" colors={colors} />
              <Metric value={stats?.reports_converted ?? 0} label="Міток стали квестами" colors={colors} />
            </View>

            <View style={styles.actionStack}>
              <Button
                title="Організації, партнери та модерація"
                colors={colors}
                variant="purple"
                icon={<Ionicons name="people-outline" size={18} color="#fff" />}
                onPress={onOpenCommunity}
              />
              <Button
                title="Моє перевірене портфоліо"
                colors={colors}
                variant="primary"
                icon={<Ionicons name="ribbon-outline" size={18} color="#fff" />}
                onPress={onPortfolio}
              />
              <Button
                title="Поділитися портфоліо"
                colors={colors}
                variant="outline"
                icon={<Ionicons name="share-social-outline" size={18} color={colors.textPrimary} />}
                onPress={sharePortfolio}
              />
            </View>

            <TouchableOpacity onPress={onLogout} style={styles.logoutBtn} accessibilityRole="button">
              <Text style={{ color: colors.danger, fontWeight: '800' }}>Вийти з акаунта</Text>
            </TouchableOpacity>
          </>
        )}

        {activeTab === 'rewards' && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Нагороди партнерів</Text>
            <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
              Баланс: <Text style={{ fontWeight: '900', color: colors.gold }}>{spendableXp} XP</Text>
            </Text>
            {loading && rewards.length === 0 ? <ActivityIndicator color={colors.primaryDark} /> : null}
            {rewards.map((reward) => (
              <View key={reward.id} style={[styles.rewardCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.partnerTag, { color: colors.secondaryPurple }]}>{reward.partner_name}</Text>
                  <Text style={[styles.rewardTitle, { color: colors.textPrimary }]}>{reward.title}</Text>
                  {reward.terms ? <Text style={[styles.rewardTerms, { color: colors.textSecondary }]}>{reward.terms}</Text> : null}
                  <Text style={[styles.rewardCost, { color: colors.gold }]}>{reward.cost_xp} XP · доступно {reward.available}</Text>
                </View>
                <View style={styles.redeemButton}>
                  <Button
                    title="Обміняти"
                    colors={colors}
                    loading={busyRewardId === reward.id}
                    disabled={reward.available < 1 || spendableXp < reward.cost_xp || busyRewardId !== null}
                    onPress={() => void redeem(reward)}
                  />
                </View>
              </View>
            ))}
            {rewards.length === 0 && !loading && !error ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Наразі немає доступних нагород.</Text>
            ) : null}
            {redeemedCode ? (
              <View style={[styles.codeBox, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                <Text style={[styles.codeHeader, { color: colors.primaryDark }]}>Промокод отримано</Text>
                <Text style={[styles.codeValue, { color: colors.primaryDark }]}>{redeemedCode}</Text>
                <Text style={[styles.codeNote, { color: colors.textSecondary }]}>Покажіть його партнеру</Text>
              </View>
            ) : null}
          </View>
        )}

        {activeTab === 'activity' && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Мої квести</Text>
            <View style={styles.activityFilters}>
              {([
                ['taken', 'В роботі'],
                ['created', 'Створені'],
                ['completed', 'Завершені'],
              ] as [QuestKind, string][]).map(([kind, label]) => (
                <TouchableOpacity
                  key={kind}
                  onPress={() => setQuestKind(kind)}
                  style={[
                    styles.activityFilter,
                    { backgroundColor: questKind === kind ? colors.primaryLight : colors.surface },
                  ]}
                >
                  <Text style={{ color: questKind === kind ? colors.primaryDark : colors.textSecondary, fontSize: 11, fontWeight: '800' }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {loading ? <ActivityIndicator color={colors.primaryDark} /> : null}
            {myQuests.map((quest) => (
              <View key={quest.id} style={[styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.rewardTitle, { color: colors.textPrimary }]}>{quest.title || `Квест #${quest.id}`}</Text>
                <Text style={[styles.rewardTerms, { color: colors.textSecondary }]}>{quest.status} · {quest.reward_xp || 0} XP</Text>
              </View>
            ))}
            {!myQuests.length && !loading ? <Text style={[styles.emptyText, { color: colors.textSecondary }]}>У цьому списку поки немає квестів.</Text> : null}

            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 18 }]}>Запрошення до команди</Text>
            {invitations.map((invitation) => (
              <View key={invitation.quest.id} style={[styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.rewardTitle, { color: colors.textPrimary }]}>{invitation.quest.title || 'Запрошення до квесту'}</Text>
                <Text style={[styles.rewardTerms, { color: colors.textSecondary }]}>Статус: {invitation.status}</Text>
                <View style={styles.invitationActions}>
                  <View style={styles.invitationButton}>
                    <Button title="Відхилити" colors={colors} variant="outline" onPress={() => void answerInvitation(invitation.quest.id, false)} />
                  </View>
                  <View style={styles.invitationButton}>
                    <Button title="Прийняти" colors={colors} onPress={() => void answerInvitation(invitation.quest.id, true)} />
                  </View>
                </View>
              </View>
            ))}
            {!invitations.length && !loading ? <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Нових запрошень немає.</Text> : null}
          </>
        )}

        {activeTab === 'codes' && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Отримані промокоди</Text>
            {loading ? <ActivityIndicator color={colors.primaryDark} /> : null}
            {redemptions.map((redemption) => (
              <View key={redemption.id} style={[styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.partnerTag, { color: colors.secondaryPurple }]}>{redemption.reward.partner_name}</Text>
                <Text style={[styles.rewardTitle, { color: colors.textPrimary }]}>{redemption.reward.title}</Text>
                <Text selectable style={[styles.codeValue, { color: colors.primaryDark }]}>{redemption.code}</Text>
                <Text style={[styles.rewardTerms, { color: colors.textSecondary }]}>
                  {redemption.spent_xp} XP · {new Date(redemption.created_at).toLocaleDateString()}
                </Text>
              </View>
            ))}
            {!redemptions.length && !loading ? <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Ви ще не обмінювали XP на нагороди.</Text> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const Metric: React.FC<{ value: number | string; label: string; colors: ThemeColors }> = ({ value, label, colors }) => (
  <View style={styles.metric}>
    <Text style={[styles.statVal, { color: colors.textPrimary }]}>{value}</Text>
    <Text style={[styles.statSub, { color: colors.textSecondary }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: { paddingHorizontal: 13, paddingVertical: 12, alignItems: 'center' },
  tabLabel: { fontSize: 11, fontWeight: '800' },
  scroll: { padding: 16, paddingBottom: 60 },
  userHeader: { alignItems: 'center', marginBottom: 14, padding: 18, borderRadius: 20, borderWidth: 1 },
  avatarBox: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  avatarText: { fontSize: 24, fontWeight: '900' },
  nameTitle: { fontSize: 22, fontWeight: '900' },
  userHandle: { fontSize: 12, marginTop: 2 },
  themeRowCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 14 },
  themeRowText: { fontSize: 14, fontWeight: '700' },
  levelCard: { padding: 16, borderRadius: 18, marginBottom: 14 },
  firstQuestCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 17, borderWidth: 1, marginBottom: 14 },
  firstQuestCopy: { flex: 1, gap: 4 },
  firstQuestTitle: { fontSize: 13, fontWeight: '900' },
  firstQuestText: { fontSize: 11, lineHeight: 16 },
  firstQuestButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  levelCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  levelCardTitle: { color: '#fff', fontWeight: '900', fontSize: 14 },
  levelCardSub: { color: 'rgba(255,255,255,0.82)', fontSize: 12 },
  progressBg: { height: 8, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 4 },
  progressFill: { height: 8, backgroundColor: '#fff', borderRadius: 4 },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  xpTextBold: { color: '#fff', fontWeight: '900', fontSize: 12 },
  xpTextMax: { color: 'rgba(255,255,255,0.78)', fontSize: 11 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 16, borderWidth: 1, padding: 11 },
  metric: { width: '50%', paddingVertical: 9, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '900' },
  statSub: { fontSize: 10, marginTop: 3, textAlign: 'center' },
  actionStack: { gap: 9, marginTop: 14 },
  logoutBtn: { alignItems: 'center', padding: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '900', marginBottom: 5 },
  sectionSub: { fontSize: 13, marginBottom: 14 },
  rewardCard: { flexDirection: 'row', alignItems: 'center', padding: 13, borderRadius: 16, borderWidth: 1, marginBottom: 9, gap: 10 },
  partnerTag: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  rewardTitle: { fontSize: 13, fontWeight: '800', marginTop: 3 },
  rewardTerms: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  rewardCost: { fontSize: 11, fontWeight: '900', marginTop: 5 },
  redeemButton: { width: 96 },
  codeBox: { marginTop: 12, padding: 16, borderRadius: 16, borderWidth: 1.5, alignItems: 'center' },
  codeHeader: { fontSize: 13, fontWeight: '800' },
  codeValue: { fontSize: 26, fontWeight: '900', letterSpacing: 2, marginVertical: 6 },
  codeNote: { fontSize: 12 },
  activityFilters: { flexDirection: 'row', gap: 5, marginVertical: 9 },
  activityFilter: { flex: 1, minHeight: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 4 },
  activityCard: { padding: 12, borderRadius: 13, borderWidth: 1, marginTop: 7 },
  invitationActions: { flexDirection: 'row', gap: 7, marginTop: 9 },
  invitationButton: { flex: 1 },
  emptyText: { fontSize: 13, marginTop: 10 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderRadius: 12, marginBottom: 12 },
  errorText: { fontSize: 12, flex: 1, fontWeight: '700' },
});
