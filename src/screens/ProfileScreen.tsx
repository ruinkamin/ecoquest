import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemeColors } from '../theme';
import { Badge, Button } from '../components/Common';
import { Ionicons } from '@expo/vector-icons';
import {
  ApiError,
  ApiUser,
  MapReport,
  Redemption,
  Quest,
  Reward,
  UserStats,
  VolunteerTeam,
  api,
  getPhotoUrl,
} from '../api';

type ProfileTab = 'profile' | 'activity' | 'teams' | 'rewards' | 'codes';
type QuestKind = 'taken' | 'created' | 'completed';
type ReviewerFilter = 'all' | 'self' | 'ai';
type ReviewStatusFilter = 'all' | 'evaluated' | 'pending';

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
  const [myReports, setMyReports] = useState<MapReport[]>([]);
  const [myTeams, setMyTeams] = useState<VolunteerTeam[]>([]);
  const [invitations, setInvitations] = useState<{ quest: Quest; status: string }[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [questKind, setQuestKind] = useState<QuestKind>('taken');
  const [confirmingAbandonId, setConfirmingAbandonId] = useState<number | null>(null);
  const [abandoningQuestId, setAbandoningQuestId] = useState<number | null>(null);
  const [reviewerFilter, setReviewerFilter] = useState<ReviewerFilter>('all');
  const [reviewStatusFilter, setReviewStatusFilter] = useState<ReviewStatusFilter>('all');
  const [reportSearch, setReportSearch] = useState('');
  const [reviewScores, setReviewScores] = useState<Record<number, number>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [savingReviewId, setSavingReviewId] = useState<number | null>(null);
  const [teamName, setTeamName] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const [teamBusy, setTeamBusy] = useState(false);
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
        const [quests, myInvitations, reports] = await Promise.all([
          api.getMyQuests(questKind),
          api.getMyInvitations(),
          api.getMyReports(),
        ]);
        setMyQuests(quests);
        setInvitations(myInvitations);
        setMyReports(reports);
      } else if (activeTab === 'teams') {
        setMyTeams(await api.getMyTeams());
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

  const abandonQuest = async (questId: number) => {
    setAbandoningQuestId(questId);
    setError('');
    try {
      await api.abandonQuest(questId);
      setMyQuests((quests) => quests.filter((quest) => quest.id !== questId));
      setConfirmingAbandonId(null);
      setInvitations(await api.getMyInvitations());
    } catch (abandonError: unknown) {
      setError(abandonError instanceof Error ? abandonError.message : 'Не вдалося відмовитися від квесту.');
    } finally {
      setAbandoningQuestId(null);
    }
  };

  const saveReportReview = async (report: MapReport) => {
    const score = reviewScores[report.id];
    if (!score) {
      setError('Оберіть оцінку від 1 до 5.');
      return;
    }
    setSavingReviewId(report.id);
    setError('');
    try {
      const updated = await api.evaluateReport(report.id, score, reviewNotes[report.id]);
      setMyReports((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (reviewError: unknown) {
      setError(reviewError instanceof Error ? reviewError.message : 'Не вдалося зберегти оцінку активності.');
    } finally {
      setSavingReviewId(null);
    }
  };

  const retryAiReview = async (report: MapReport) => {
    setSavingReviewId(report.id);
    setError('');
    try {
      const updated = await api.retryReportReview(report.id);
      setMyReports((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (reviewError: unknown) {
      setError(reviewError instanceof Error ? reviewError.message : 'Не вдалося повторити оцінювання.');
    } finally {
      setSavingReviewId(null);
    }
  };

  const createTeam = async () => {
    if (teamName.trim().length < 2 || teamBusy) {
      if (teamName.trim().length < 2) setError('Назва команди має містити щонайменше два символи.');
      return;
    }
    setTeamBusy(true);
    setError('');
    try {
      const team = await api.createTeam(teamName.trim());
      setMyTeams((items) => [team, ...items]);
      setTeamName('');
    } catch (teamError: unknown) {
      setError(teamError instanceof Error ? teamError.message : 'Не вдалося створити команду.');
    } finally {
      setTeamBusy(false);
    }
  };

  const joinTeam = async () => {
    if (!teamCode.trim() || teamBusy) {
      if (!teamCode.trim()) setError('Введіть код запрошення до команди.');
      return;
    }
    setTeamBusy(true);
    setError('');
    try {
      const team = await api.joinTeam(teamCode.trim());
      setMyTeams((items) => items.some((item) => item.id === team.id) ? items : [team, ...items]);
      setTeamCode('');
    } catch (teamError: unknown) {
      setError(teamError instanceof Error ? teamError.message : 'Не вдалося долучитися до команди.');
    } finally {
      setTeamBusy(false);
    }
  };

  const shareTeamCode = async (team: VolunteerTeam) => {
    try {
      await Share.share({
        title: `Запрошення до команди ${team.name}`,
        message: `Долучайся до команди «${team.name}» в EcoQuest. Код запрошення: ${team.invite_code}`,
      });
    } catch (shareError: unknown) {
      setError(shareError instanceof Error ? shareError.message : 'Не вдалося поділитися кодом команди.');
    }
  };

  const displayName = userName.trim() || 'Волонтер EcoQuest';
  const initialLetters = displayName.slice(0, 2).toUpperCase();
  const progress = stats
    ? Math.min(100, Math.round((stats.level_progress_xp / Math.max(1, stats.xp_per_level)) * 100))
    : 0;
  const visibleReports = myReports.filter((report) => {
    if (reviewerFilter !== 'all' && report.reviewer_type !== reviewerFilter) return false;
    if (reviewerFilter === 'self' && reviewStatusFilter !== 'all') {
      const isEvaluated = report.review_status === 'evaluated';
      if (reviewStatusFilter === 'evaluated' && !isEvaluated) return false;
      if (reviewStatusFilter === 'pending' && isEvaluated) return false;
    }
    return !reportSearch.trim()
      || (report.description || '').toLocaleLowerCase().includes(reportSearch.trim().toLocaleLowerCase());
  });

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
          ['teams', 'Мої команди'],
          ['rewards', 'Нагороди'],
          ['codes', 'Мої коди'],
        ] as [ProfileTab, string][]).map(([tab, label]) => (
          <TouchableOpacity
            key={tab}
            style={styles.tabBtn}
            onPress={() => {
              setActiveTab(tab);
              setRedeemedCode('');
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: activeTab === tab }}
          >
            <Text
              style={[
                styles.tabLabel,
                {
                  color: activeTab === tab ? colors.primaryDark : colors.textSecondary,
                  borderBottomColor: activeTab === tab ? colors.primary : 'transparent',
                  borderBottomWidth: activeTab === tab ? 2 : 0,
                },
              ]}
            >
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

        {activeTab === 'teams' && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Мої команди</Text>
            <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
              Створіть команду та поділіться кодом або введіть код запрошення, щоб долучитися.
            </Text>
            <View style={[styles.teamForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.teamFormTitle, { color: colors.textPrimary }]}>Створити команду</Text>
              <TextInput
                value={teamName}
                onChangeText={setTeamName}
                placeholder="Назва команди"
                placeholderTextColor={colors.textMuted}
                style={[styles.teamInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                maxLength={80}
                returnKeyType="done"
                accessibilityLabel="Назва нової команди"
              />
              <Button title="Створити команду" colors={colors} loading={teamBusy} disabled={teamBusy} onPress={() => void createTeam()} />
            </View>
            <View style={[styles.teamForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.teamFormTitle, { color: colors.textPrimary }]}>Долучитися до команди</Text>
              <TextInput
                value={teamCode}
                onChangeText={setTeamCode}
                placeholder="Код запрошення"
                placeholderTextColor={colors.textMuted}
                style={[styles.teamInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                autoCapitalize="characters"
                maxLength={12}
                returnKeyType="done"
                accessibilityLabel="Код запрошення до команди"
              />
              <Button title="Долучитися" colors={colors} variant="purple" loading={teamBusy} disabled={teamBusy} onPress={() => void joinTeam()} />
            </View>
            {loading && !myTeams.length ? <ActivityIndicator color={colors.primaryDark} /> : null}
            {myTeams.map((team) => (
              <View key={team.id} style={[styles.teamCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.teamCardHeading}>
                  <View style={[styles.teamIcon, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="people" size={19} color={colors.primaryDark} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.teamFormTitle, { color: colors.textPrimary }]}>{team.name}</Text>
                    <Text style={[styles.rewardTerms, { color: colors.textSecondary }]}>
                      {team.members.length} {team.members.length === 1 ? 'учасник' : 'учасників'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => void shareTeamCode(team)}
                    accessibilityRole="button"
                    accessibilityLabel={`Надіслати код команди ${team.name}`}
                  >
                    <Ionicons name="share-social-outline" size={21} color={colors.primaryDark} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.teamCodeLabel, { color: colors.textSecondary }]}>Код запрошення</Text>
                <Text selectable style={[styles.teamInviteCode, { color: colors.primaryDark, backgroundColor: colors.primaryLight }]}>
                  {team.invite_code}
                </Text>
                <Text style={[styles.teamMemberNames, { color: colors.textSecondary }]}>
                  {team.members.map((member) => member.name).join(' · ')}
                </Text>
              </View>
            ))}
            {!myTeams.length && !loading ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Ви ще не створили та не приєдналися до команди.</Text>
            ) : null}
          </>
        )}

        {activeTab === 'activity' && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Мої активності</Text>
            <View style={styles.activityFilters}>
              {([
                ['all', 'Усі'],
                ['self', 'Оцінені мною'],
                ['ai', 'Оцінені не мною'],
              ] as [ReviewerFilter, string][]).map(([filter, label]) => (
                <TouchableOpacity
                  key={filter}
                  onPress={() => setReviewerFilter(filter)}
                  style={[
                    styles.activityFilter,
                    { backgroundColor: reviewerFilter === filter ? colors.primaryLight : colors.surface },
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: reviewerFilter === filter }}
                >
                  <Text style={{ color: reviewerFilter === filter ? colors.primaryDark : colors.textSecondary, fontSize: 11, fontWeight: '800' }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {reviewerFilter === 'self' ? (
              <>
                <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="search" size={18} color={colors.textMuted} />
                  <TextInput
                    value={reportSearch}
                    onChangeText={setReportSearch}
                    placeholder="Пошук активностей"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.reportSearch, { color: colors.textPrimary }]}
                    returnKeyType="search"
                    accessibilityLabel="Пошук активностей, призначених для вашого оцінювання"
                  />
                </View>
                <View style={styles.reviewStatusFilters}>
                  {([
                    ['all', 'Усі'],
                    ['evaluated', 'Оцінені'],
                    ['pending', 'Не оцінені'],
                  ] as [ReviewStatusFilter, string][]).map(([filter, label]) => (
                    <TouchableOpacity
                      key={filter}
                      onPress={() => setReviewStatusFilter(filter)}
                      style={[
                        styles.reviewStatusFilter,
                        { borderColor: reviewStatusFilter === filter ? colors.primary : colors.border },
                        reviewStatusFilter === filter && { backgroundColor: colors.primaryLight },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: reviewStatusFilter === filter }}
                    >
                      <Text style={{ color: reviewStatusFilter === filter ? colors.primaryDark : colors.textSecondary, fontSize: 11, fontWeight: '800' }}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}
            {loading && !myReports.length ? <ActivityIndicator color={colors.primaryDark} /> : null}
            {visibleReports.map((report) => {
              const imageUrl = getPhotoUrl(report.photo_url);
              const statusLabel = report.review_status === 'evaluated'
                ? report.reviewer_type === 'self' ? 'Оцінено вами' : 'Оцінено ШІ'
                : report.review_status === 'failed' ? 'Помилка оцінювання' : 'Очікує оцінювання';
              return (
                <View key={report.id} style={[styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.activityPhoto} resizeMode="cover" /> : null}
                  <Text style={[styles.rewardTitle, { color: colors.textPrimary }]}>
                    {report.description?.trim() || `Активність #${report.id}`}
                  </Text>
                  <Text style={[styles.rewardTerms, { color: colors.textSecondary }]}>
                    {statusLabel} · {report.created_at ? new Date(report.created_at).toLocaleDateString() : 'Нещодавно'}
                  </Text>
                  {report.review_status === 'evaluated' && report.review_score != null ? (
                    <Text style={[styles.rewardTerms, { color: colors.gold }]}>Ваша оцінка: {report.review_score}/5</Text>
                  ) : null}
                  {report.review_approved != null ? (
                    <Text style={[styles.rewardTerms, { color: report.review_approved ? colors.primaryDark : colors.danger }]}>
                      {report.review_approved ? 'AI підтвердив активність' : 'AI рекомендує додаткову перевірку'}
                    </Text>
                  ) : null}
                  {report.review_note ? <Text style={[styles.rewardTerms, { color: colors.textSecondary }]}>{report.review_note}</Text> : null}
                  {report.reviewer_type === 'self' && report.review_status === 'pending' ? (
                    <View style={styles.reviewEditor}>
                      <Text style={[styles.reviewPrompt, { color: colors.textPrimary }]}>Ваша оцінка</Text>
                      <View style={styles.ratingStars}>
                        {[1, 2, 3, 4, 5].map((score) => (
                          <TouchableOpacity
                            key={score}
                            onPress={() => setReviewScores((items) => ({ ...items, [report.id]: score }))}
                            accessibilityRole="button"
                            accessibilityLabel={`Оцінити активність на ${score} з 5`}
                            accessibilityState={{ selected: reviewScores[report.id] === score }}
                          >
                            <Ionicons
                              name={(reviewScores[report.id] || 0) >= score ? 'star' : 'star-outline'}
                              size={24}
                              color={colors.gold}
                            />
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TextInput
                        value={reviewNotes[report.id] || ''}
                        onChangeText={(value) => setReviewNotes((items) => ({ ...items, [report.id]: value }))}
                        placeholder="Коментар до оцінки (необов’язково)"
                        placeholderTextColor={colors.textMuted}
                        style={[styles.reviewNoteInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                        maxLength={500}
                      />
                      <Button
                        title="Зберегти оцінку"
                        colors={colors}
                        loading={savingReviewId === report.id}
                        disabled={savingReviewId !== null}
                        onPress={() => void saveReportReview(report)}
                      />
                    </View>
                  ) : null}
                  {report.reviewer_type === 'ai' && report.review_status === 'failed' ? (
                    <Button
                      title="Спробувати оцінити знову"
                      colors={colors}
                      variant="outline"
                      loading={savingReviewId === report.id}
                      disabled={savingReviewId !== null}
                      onPress={() => void retryAiReview(report)}
                    />
                  ) : null}
                </View>
              );
            })}
            {!visibleReports.length && !loading ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Активностей за цими фільтрами поки немає.</Text>
            ) : null}

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
                {questKind === 'taken' && quest.status === 'in_progress' && quest.executor_id === userId ? (
                  <View style={styles.abandonActions}>
                    {confirmingAbandonId === quest.id ? (
                      <>
                        <Text style={[styles.rewardTerms, { color: colors.textSecondary }]}>
                          Квест знову стане доступним, а запрошення команди буде скасовано.
                        </Text>
                        <View style={styles.invitationActions}>
                          <View style={styles.invitationButton}>
                            <Button
                              title="Залишити"
                              colors={colors}
                              variant="outline"
                              disabled={abandoningQuestId !== null}
                              onPress={() => setConfirmingAbandonId(null)}
                            />
                          </View>
                          <View style={styles.invitationButton}>
                            <Button
                              title="Відмовитися"
                              colors={colors}
                              variant="danger"
                              loading={abandoningQuestId === quest.id}
                              disabled={abandoningQuestId !== null}
                              onPress={() => void abandonQuest(quest.id)}
                            />
                          </View>
                        </View>
                      </>
                    ) : (
                      <Button
                        title="Відмовитися від квесту"
                        colors={colors}
                        variant="outline"
                        onPress={() => setConfirmingAbandonId(quest.id)}
                      />
                    )}
                  </View>
                ) : null}
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
  tabBar: { flexDirection: 'row', gap: 3, paddingHorizontal: 8, paddingVertical: 2 },
  tabBtn: { paddingHorizontal: 9, paddingVertical: 9, alignItems: 'center' },
  tabLabel: { fontSize: 11, fontWeight: '800', paddingBottom: 1 },
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
  abandonActions: { marginTop: 10, gap: 7 },
  activityPhoto: { width: '100%', height: 150, borderRadius: 10, marginBottom: 8 },
  searchRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, marginTop: 3 },
  reportSearch: { flex: 1, height: 40, fontSize: 13 },
  reviewStatusFilters: { flexDirection: 'row', gap: 7, marginTop: 8, marginBottom: 4 },
  reviewStatusFilter: { minHeight: 32, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 5 },
  reviewEditor: { marginTop: 10, gap: 8 },
  reviewPrompt: { fontSize: 12, fontWeight: '800' },
  ratingStars: { flexDirection: 'row', gap: 10 },
  reviewNoteInput: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12 },
  teamForm: { padding: 13, borderRadius: 14, borderWidth: 1, marginTop: 9, gap: 9 },
  teamFormTitle: { fontSize: 14, fontWeight: '900' },
  teamInput: { minHeight: 43, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, fontSize: 13 },
  teamCard: { padding: 14, borderRadius: 15, borderWidth: 1, marginTop: 9 },
  teamCardHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  teamCodeLabel: { fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 5 },
  teamInviteCode: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, fontSize: 19, fontWeight: '900', letterSpacing: 2 },
  teamMemberNames: { fontSize: 11, lineHeight: 16, marginTop: 8 },
  invitationActions: { flexDirection: 'row', gap: 7, marginTop: 9 },
  invitationButton: { flex: 1 },
  emptyText: { fontSize: 13, marginTop: 10 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderRadius: 12, marginBottom: 12 },
  errorText: { fontSize: 12, flex: 1, fontWeight: '700' },
});
