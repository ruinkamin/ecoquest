import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button } from '../components/Common';
import { ApiError, ApiUser, OrganizationSummary, Quest, api, getPhotoUrl } from '../api';
import { ThemeColors } from '../theme';

interface Props {
  task: Quest;
  currentUserName: string;
  colors: ThemeColors;
  isAuthed: boolean;
  onRequireAuth: () => void;
  onBack: () => void;
  onSubmitReport: () => void;
  onChanged: () => void;
}

export const TaskDetailsScreen: React.FC<Props> = ({
  task,
  currentUserName,
  colors,
  isAuthed,
  onRequireAuth,
  onBack,
  onSubmitReport,
  onChanged,
}) => {
  const [details, setDetails] = useState(task);
  const [mode, setMode] = useState<'solo' | 'team' | 'organization'>('solo');
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<ApiUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const loadDetails = useCallback(async () => {
    try {
      setDetails(await api.getQuest(task.id));
      setError('');
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Не вдалося завантажити квест.');
    } finally {
      setLoadingDetails(false);
    }
  }, [task.id]);

  useEffect(() => {
    void Promise.resolve().then(loadDetails);
  }, [loadDetails]);

  useEffect(() => {
    if (!isAuthed || mode !== 'organization') return;
    void api.getMyOrganizations()
      .then((items) => setOrganizations(items.filter((item) => item.status === 'approved')))
      .catch((organizationError: unknown) => {
        setError(organizationError instanceof Error ? organizationError.message : 'Не вдалося завантажити ваші організації.');
      });
  }, [isAuthed, mode]);

  const claimQuest = async () => {
    if (!isAuthed) {
      onRequireAuth();
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (mode === 'organization' && selectedOrganizationId === null) {
        throw new Error('Оберіть схвалену організацію, від якої братимете квест.');
      }
      await api.claimQuest(task.id, mode, mode === 'organization' ? selectedOrganizationId ?? undefined : undefined);
      await loadDetails();
      onChanged();
    } catch (claimError: unknown) {
      const message = claimError instanceof Error ? claimError.message : 'Не вдалося взяти квест.';
      setError(message);
      if (claimError instanceof ApiError && claimError.status === 409) await loadDetails();
    } finally {
      setLoading(false);
    }
  };

  const answerInvitation = async (accept: boolean) => {
    setLoading(true);
    setError('');
    try {
      await api.respondParticipation(task.id, accept);
      await loadDetails();
      onChanged();
    } catch (actionError: unknown) {
      setError(actionError instanceof Error ? actionError.message : 'Не вдалося відповісти на запрошення.');
    } finally {
      setLoading(false);
    }
  };

  const searchMembers = async () => {
    if (searchText.trim().length < 2) {
      setError('Введіть щонайменше два символи для пошуку.');
      return;
    }
    setSearching(true);
    setHasSearched(true);
    setError('');
    try {
      setSearchResults(await api.searchUsers(searchText.trim()));
    } catch (searchError: unknown) {
      setError(searchError instanceof Error ? searchError.message : 'Не вдалося знайти волонтера.');
    } finally {
      setSearching(false);
    }
  };

  const inviteMember = async (member: ApiUser) => {
    setLoading(true);
    setError('');
    try {
      await api.inviteParticipant(task.id, member.id);
      setSearchResults((items) => items.filter((item) => item.id !== member.id));
      await loadDetails();
      onChanged();
    } catch (inviteError: unknown) {
      setError(inviteError instanceof Error ? inviteError.message : 'Не вдалося запросити волонтера.');
    } finally {
      setLoading(false);
    }
  };

  const removeParticipant = async (member: ApiUser) => {
    setLoading(true);
    setError('');
    try {
      await api.removeQuestParticipant(task.id, member.id);
      await loadDetails();
      onChanged();
    } catch (removeError: unknown) {
      setError(removeError instanceof Error ? removeError.message : 'Не вдалося прибрати учасника.');
    } finally {
      setLoading(false);
    }
  };

  const statusLabel: Record<string, string> = {
    available: 'Доступний',
    in_progress: 'Виконується',
    pending_verification: 'На перевірці',
    completed: 'Виконаний',
    pending_moderation: 'Очікує публікації',
    blocked: 'Заблокований',
  };
  const imageUrl = getPhotoUrl(details.photo_url);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.navBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Назад">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.textPrimary }]}>Квест</Text>
        <TouchableOpacity
          onPress={() => {
            setLoadingDetails(true);
            void loadDetails();
          }}
          accessibilityRole="button"
          accessibilityLabel="Оновити квест"
        >
          <Ionicons name="refresh" size={21} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.photoHeader, { backgroundColor: colors.surfaceSubtle }]}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <Ionicons name="image-outline" size={54} color={colors.textMuted} />
          )}
          <View style={styles.photoTag}><Text style={styles.photoTagText}>Фото «до»</Text></View>
        </View>

        <View style={styles.content}>
          <View style={styles.tagRow}>
            <Badge
              label={statusLabel[details.status] || details.status}
              color={colors.primaryDark}
              bg={colors.primaryLight}
            />
            <Badge label={`Складність ${details.difficulty || 1}`} color={colors.gold} bg={colors.goldLight} />
            <Badge label={`+${details.reward_xp || 0} XP`} color={colors.gold} bg={colors.goldLight} />
          </View>

          <Text style={[styles.questTitle, { color: colors.textPrimary }]}>{details.title || 'Екоквест'}</Text>
          <Text style={[styles.orgNote, { color: colors.textSecondary }]}>
            Організатор: <Text style={{ fontWeight: '800', color: colors.textPrimary }}>{details.owner_org_name || 'EcoQuest'}</Text>
          </Text>
          {details.description ? (
            <Text style={[styles.description, { color: colors.textSecondary }]}>{details.description}</Text>
          ) : null}

          <View style={[styles.locationCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="location-outline" size={20} color={colors.primaryDark} />
            <Text style={[styles.locationText, { color: colors.textPrimary }]}>
              {details.lat.toFixed(5)}, {details.lng.toFixed(5)}
            </Text>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Команда</Text>
          {details.participants?.length ? details.participants.map(({ user, status }) => (
            <View key={user.id} style={[styles.memberItem, { backgroundColor: colors.surface }]}>
              <Ionicons name="person-circle-outline" size={23} color={colors.primaryDark} />
              <Text style={[styles.memberName, { color: colors.textPrimary }]}>
                {user.name}{user.name === currentUserName ? ' · ви' : ''}
              </Text>
              <Text style={[styles.memberStatus, { color: colors.textSecondary }]}>{status}</Text>
              {details.actions?.can_invite && user.id !== details.executor_id ? (
                <TouchableOpacity
                  onPress={() => void removeParticipant(user)}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={`Прибрати ${user.name} з команди`}
                >
                  <Ionicons name="person-remove-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              ) : null}
            </View>
          )) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Поки ніхто не долучився. Ви можете стати першим.</Text>
          )}

          {details.actions?.can_invite && (
            <View style={styles.inviteSection}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Запросити до команди</Text>
              <View style={styles.searchRow}>
                <TextInput
                  value={searchText}
                  onChangeText={(value) => {
                    setSearchText(value);
                    setHasSearched(false);
                    setSearchResults([]);
                  }}
                  onSubmitEditing={() => void searchMembers()}
                  placeholder="Ім’я або email"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  returnKeyType="search"
                  style={[
                    styles.searchInput,
                    { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  accessibilityLabel="Пошук волонтера для команди"
                />
                <TouchableOpacity
                  style={[styles.searchButton, { backgroundColor: colors.primary }]}
                  onPress={() => void searchMembers()}
                  disabled={searching}
                  accessibilityRole="button"
                  accessibilityLabel="Знайти волонтерів"
                >
                  {searching ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={18} color="#fff" />}
                </TouchableOpacity>
              </View>
              {searchResults.map((member) => (
                <TouchableOpacity
                  key={member.id}
                  style={[styles.searchResult, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => void inviteMember(member)}
                  disabled={loading}
                  accessibilityRole="button"
                >
                  <Text style={[styles.memberName, { color: colors.textPrimary }]}>{member.name}</Text>
                  <Ionicons name="person-add-outline" size={18} color={colors.primaryDark} />
                </TouchableOpacity>
              ))}
              {hasSearched && searchResults.length === 0 && !searching ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Нікого не знайдено.</Text>
              ) : null}
            </View>
          )}

          {details.last_submission && (
            <View style={[styles.submissionCard, { backgroundColor: colors.purpleLight }]}>
              <Ionicons name="hourglass-outline" size={20} color={colors.secondaryPurple} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 2 }]}>Останній фотозвіт</Text>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {details.last_submission.status}
                  {details.last_submission.final_percent != null ? ` · ${details.last_submission.final_percent}%` : ''}
                  {details.last_submission.awarded_xp != null ? ` · +${details.last_submission.awarded_xp} XP` : ''}
                </Text>
                {details.last_submission.moderator_note ? (
                  <Text style={[styles.emptyText, { color: colors.textSecondary, marginTop: 3 }]}>
                    {details.last_submission.moderator_note}
                  </Text>
                ) : null}
              </View>
            </View>
          )}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </ScrollView>

      <View style={[styles.footerBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {loadingDetails ? (
          <ActivityIndicator color={colors.primaryDark} />
        ) : details.actions?.can_claim ? (
          <>
            <View style={styles.modeRow}>
              {([
                ['solo', 'Самостійно'],
                ['team', 'Командою'],
                ['organization', 'Від організації'],
              ] as const).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => setMode(value)}
                  style={[
                    styles.modeChip,
                    { borderColor: colors.border },
                    mode === value && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mode === value }}
                >
                  <Text style={[styles.modeText, { color: mode === value ? colors.primaryDark : colors.textSecondary }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {mode === 'organization' ? (
              <View style={styles.organizationChoices}>
                {organizations.map((organization) => (
                  <TouchableOpacity
                    key={organization.id}
                    onPress={() => setSelectedOrganizationId(organization.id)}
                    style={[
                      styles.modeChip,
                      { borderColor: selectedOrganizationId === organization.id ? colors.primary : colors.border },
                      selectedOrganizationId === organization.id && { backgroundColor: colors.primaryLight },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedOrganizationId === organization.id }}
                  >
                    <Text style={[styles.modeText, { color: selectedOrganizationId === organization.id ? colors.primaryDark : colors.textSecondary }]}>
                      {organization.name}
                    </Text>
                  </TouchableOpacity>
                ))}
                {!organizations.length ? (
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Немає схвалених організацій, у яких ви учасник.</Text>
                ) : null}
              </View>
            ) : null}
            <Button
              title={isAuthed ? (mode === 'solo' ? 'Взяти квест' : mode === 'team' ? 'Почати командою' : 'Взяти від організації') : 'Увійти, щоб взяти квест'}
              colors={colors}
              loading={loading}
              onPress={() => {
                if (!isAuthed) onRequireAuth();
                else void claimQuest();
              }}
            />
          </>
        ) : details.actions?.can_respond ? (
          <View style={styles.actionRow}>
            <View style={styles.actionButton}>
              <Button title="Відхилити" colors={colors} variant="outline" loading={loading} onPress={() => void answerInvitation(false)} />
            </View>
            <View style={styles.actionButton}>
              <Button title="Прийняти" colors={colors} loading={loading} onPress={() => void answerInvitation(true)} />
            </View>
          </View>
        ) : details.actions?.can_submit ? (
          <Button title="Надіслати фотозвіт" colors={colors} onPress={onSubmitReport} />
        ) : (
          <Button title="Закрити" colors={colors} variant="outline" onPress={onBack} />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  navBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1 },
  navTitle: { fontSize: 17, fontWeight: '800' },
  scroll: { paddingBottom: 108 },
  photoHeader: { height: 220, justifyContent: 'center', alignItems: 'center', position: 'relative', overflow: 'hidden' },
  photoTag: { position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(0,0,0,0.58)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  photoTagText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  content: { padding: 16 },
  tagRow: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  questTitle: { fontSize: 22, lineHeight: 28, fontWeight: '900', marginBottom: 6 },
  orgNote: { fontSize: 14, marginBottom: 12 },
  description: { fontSize: 14, lineHeight: 21, marginBottom: 14 },
  locationCard: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 13, borderWidth: 1, marginBottom: 18 },
  locationText: { fontSize: 13, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '900', marginBottom: 8 },
  memberItem: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 11, marginBottom: 6, gap: 7 },
  memberName: { flex: 1, fontSize: 13, fontWeight: '700' },
  memberStatus: { fontSize: 10 },
  inviteSection: { marginTop: 15 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 7 },
  searchInput: { flex: 1, height: 42, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, fontSize: 13 },
  searchButton: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  searchResult: { minHeight: 42, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  emptyText: { fontSize: 12, lineHeight: 18 },
  submissionCard: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 13, borderRadius: 14, marginTop: 16 },
  errorText: { color: '#DC2626', fontSize: 12, fontWeight: '700', marginTop: 12 },
  footerBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 14, borderTopWidth: 1, gap: 8 },
  modeRow: { flexDirection: 'row', gap: 8 },
  organizationChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  modeChip: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: 1 },
  modeText: { fontSize: 12, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionButton: { flex: 1 },
});
