import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { ApiUser, MapReport, ModerationSubmission, OrganizationStats, OrganizationSummary, PartnerSummary, Quest, QuestChanges, Reward, UploadPhoto, api, getPhotoUrl } from '../api';
import { Button } from '../components/Common';
import { QuestEditorModal } from '../components/QuestEditorModal';
import { ThemeColors } from '../theme';
import { preparePhotoForUpload } from '../utils/photo';

type MainTab = 'organizations' | 'partners' | 'moderation';
type OrganizationPanel = 'quests' | 'submissions' | 'reports' | 'members';
type ModerationPanel = 'quests' | 'submissions' | 'organizations' | 'partners' | 'trust' | 'actions';

interface Props {
  user: ApiUser;
  colors: ThemeColors;
  onClose: () => void;
}

const isPlatformModerator = (user: ApiUser) => {
  const role = user.role?.toLowerCase() || '';
  return role.includes('admin') || role.includes('moderator');
};

export const CommunityScreen: React.FC<Props> = ({ user, colors, onClose }) => {
  const [tab, setTab] = useState<MainTab>('organizations');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [partners, setPartners] = useState<PartnerSummary[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<number | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [organizationPanel, setOrganizationPanel] = useState<OrganizationPanel>('quests');
  const [moderationPanel, setModerationPanel] = useState<ModerationPanel>('quests');
  const [organizationQuestStatus, setOrganizationQuestStatus] = useState<'pending' | 'available' | 'blocked' | 'all'>('pending');
  const [organizationSubmissionStatus, setOrganizationSubmissionStatus] = useState<'review' | 'platform' | 'decided' | 'all'>('review');
  const [platformQuestStatus, setPlatformQuestStatus] = useState<'hazard' | 'pending' | 'available' | 'blocked' | 'all'>('hazard');
  const [organizationDetail, setOrganizationDetail] = useState<Awaited<ReturnType<typeof api.getOrganization>> | null>(null);
  const [organizationStats, setOrganizationStats] = useState<OrganizationStats | null>(null);
  const [organizationQuests, setOrganizationQuests] = useState<Quest[]>([]);
  const [organizationSubmissions, setOrganizationSubmissions] = useState<ModerationSubmission[]>([]);
  const [openReports, setOpenReports] = useState<MapReport[]>([]);
  const [partnerRewards, setPartnerRewards] = useState<Reward[]>([]);
  const [moderationQuests, setModerationQuests] = useState<Quest[]>([]);
  const [moderationSubmissions, setModerationSubmissions] = useState<ModerationSubmission[]>([]);
  const [pendingOrganizations, setPendingOrganizations] = useState<OrganizationSummary[]>([]);
  const [pendingPartners, setPendingPartners] = useState<PartnerSummary[]>([]);
  const [trustOrganizations, setTrustOrganizations] = useState<Awaited<ReturnType<typeof api.getModerationOrganizationTrust>>>([]);
  const [actions, setActions] = useState<Awaited<ReturnType<typeof api.getModerationActions>>>([]);
  const [orgName, setOrgName] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [partnerDescription, setPartnerDescription] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberResults, setMemberResults] = useState<ApiUser[]>([]);
  const [reportTitle, setReportTitle] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [directQuestTitle, setDirectQuestTitle] = useState('');
  const [directQuestDescription, setDirectQuestDescription] = useState('');
  const [directQuestPhoto, setDirectQuestPhoto] = useState<UploadPhoto | null>(null);
  const [rewardTitle, setRewardTitle] = useState('');
  const [rewardTerms, setRewardTerms] = useState('');
  const [rewardCost, setRewardCost] = useState('');
  const [rewardExpiry, setRewardExpiry] = useState('');
  const [rewardCodes, setRewardCodes] = useState('');
  const [existingRewardCodes, setExistingRewardCodes] = useState('');
  const [reviewPercent, setReviewPercent] = useState('100');
  const [reviewNote, setReviewNote] = useState('');
  // Квест, открытый в редакторе: очередь организации или модератора платформы.
  const [editing, setEditing] = useState<{ quest: Quest; scope: 'org' | 'platform' } | null>(null);
  const canModeratePlatform = isPlatformModerator(user);

  const run = useCallback(async (action: () => Promise<void>) => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (actionError: unknown) {
      setError(actionError instanceof Error ? actionError.message : 'Не вдалося виконати дію.');
    } finally {
      setLoading(false);
      setBusyId(null);
    }
  }, []);

  const reloadOrganizations = useCallback(async () => {
    const mine = await api.getMyOrganizations();
    setOrganizations(mine);
    if (selectedOrganizationId !== null && !mine.some((item) => item.id === selectedOrganizationId)) {
      setSelectedOrganizationId(null);
    }
  }, [selectedOrganizationId]);

  const reloadPartners = useCallback(async () => {
    const mine = await api.getMyPartners();
    setPartners(mine);
    if (selectedPartnerId !== null && !mine.some((item) => item.id === selectedPartnerId)) {
      setSelectedPartnerId(null);
    }
  }, [selectedPartnerId]);

  useEffect(() => {
    void Promise.resolve().then(() => run(async () => {
      if (tab === 'organizations') await reloadOrganizations();
      if (tab === 'partners') await reloadPartners();
      if (tab === 'moderation' && canModeratePlatform) {
        const [quests, submissions, orgs, partnerList, trustList, actionList] = await Promise.all([
          api.getModerationQuests(platformQuestStatus),
          api.getModerationSubmissions(),
          api.getModerationOrganizations(),
          api.getModerationPartners(),
          api.getModerationOrganizationTrust(),
          api.getModerationActions(undefined, undefined, 50),
        ]);
        setModerationQuests(quests);
        setModerationSubmissions(submissions);
        setPendingOrganizations(orgs);
        setPendingPartners(partnerList);
        setTrustOrganizations(trustList);
        setActions(actionList);
      }
    }));
  }, [tab, canModeratePlatform, platformQuestStatus, reloadOrganizations, reloadPartners, run]);

  useEffect(() => {
    if (selectedOrganizationId === null) return;
    void Promise.resolve().then(() => run(async () => {
      const [detail, stats] = await Promise.all([
        api.getOrganization(selectedOrganizationId),
        api.getOrganizationStats(selectedOrganizationId),
      ]);
      setOrganizationDetail(detail);
      setOrganizationStats(stats);
      if (detail.status === 'approved' && (detail.is_head || detail.is_moderator)) {
        const [quests, submissions, reports] = await Promise.all([
          api.getOrganizationQuestQueue(selectedOrganizationId, organizationQuestStatus),
          api.getOrganizationSubmissions(selectedOrganizationId, organizationSubmissionStatus),
          api.getReports(undefined, 'open'),
        ]);
        setOrganizationQuests(quests);
        setOrganizationSubmissions(submissions);
        setOpenReports(reports);
      } else {
        setOrganizationQuests([]);
        setOrganizationSubmissions([]);
        setOpenReports([]);
      }
    }));
  }, [selectedOrganizationId, organizationQuestStatus, organizationSubmissionStatus, run]);

  useEffect(() => {
    if (selectedPartnerId === null) return;
    void Promise.resolve().then(() => run(async () => {
      await api.getPartner(selectedPartnerId);
      setPartnerRewards(await api.getPartnerRewards(selectedPartnerId));
    }));
  }, [selectedPartnerId, run]);

  const organizationCanManage = Boolean(
    organizationDetail?.status === 'approved' &&
    (organizationDetail.is_head || organizationDetail.is_moderator),
  );
  const selectedOrganization = organizations.find((item) => item.id === selectedOrganizationId);
  const selectedPartner = partners.find((item) => item.id === selectedPartnerId);
  const tabs = useMemo(() => {
    const items: { id: MainTab; label: string }[] = [
      { id: 'organizations', label: 'Організації' },
      { id: 'partners', label: 'Партнери' },
    ];
    if (canModeratePlatform) items.push({ id: 'moderation', label: 'Модерація' });
    return items;
  }, [canModeratePlatform]);

  const applyOrganization = () => run(async () => {
    if (!orgName.trim() || !orgDescription.trim()) throw new Error('Вкажіть назву й опис організації.');
    await api.applyForOrganization(orgName.trim(), orgDescription.trim());
    setOrgName('');
    setOrgDescription('');
    await reloadOrganizations();
    setNotice('Заявку організації надіслано на перевірку.');
  });

  const applyPartner = () => run(async () => {
    if (!partnerName.trim() || !partnerDescription.trim()) throw new Error('Вкажіть назву й опис партнера.');
    await api.applyForPartner(partnerName.trim(), partnerDescription.trim());
    setPartnerName('');
    setPartnerDescription('');
    await reloadPartners();
    setNotice('Заявку партнера надіслано на перевірку.');
  });

  const convertReport = (report: MapReport) => run(async () => {
    if (selectedOrganizationId === null) return;
    await api.convertReportToQuest(
      report.id,
      selectedOrganizationId,
      reportTitle.trim() || undefined,
      reportDescription.trim() || report.description || undefined,
    );
    setReportTitle('');
    setReportDescription('');
    setOpenReports((items) => items.filter((item) => item.id !== report.id));
    setOrganizationQuests(await api.getOrganizationQuestQueue(selectedOrganizationId));
    setNotice('Квест створено; він з’явиться після перевірки.');
  });

  const chooseQuestPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Дозвольте доступ до фото, щоб додати знімок для квесту.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.75,
      });
      if (!result.canceled) setDirectQuestPhoto(await preparePhotoForUpload(result.assets[0], 'report'));
    } catch (pickerError: unknown) {
      setError(pickerError instanceof Error ? pickerError.message : 'Не вдалося вибрати фото квесту.');
    }
  };

  const createDirectQuest = () => run(async () => {
    if (!selectedOrganizationId || !directQuestPhoto) throw new Error('Оберіть організацію та додайте фото.');
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new Error('Дозвольте геолокацію, щоб прив’язати квест до місця.');
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await api.createQuest(
      directQuestPhoto,
      location.coords.latitude,
      location.coords.longitude,
      selectedOrganizationId,
      directQuestDescription,
      directQuestTitle,
    );
    setDirectQuestPhoto(null);
    setDirectQuestTitle('');
    setDirectQuestDescription('');
    setOrganizationQuests(await api.getOrganizationQuestQueue(selectedOrganizationId));
    setNotice('Квест створено; він з’явиться після модерації.');
  });

  const addMember = (member?: ApiUser) => run(async () => {
    if (selectedOrganizationId === null) return;
    const email = member ? undefined : memberEmail.trim();
    if (!member && !email) throw new Error('Введіть email учасника або знайдіть його за ім’ям.');
    await api.addOrganizationMember(selectedOrganizationId, member?.id, email);
    setMemberEmail('');
    setMemberQuery('');
    setMemberResults([]);
    setOrganizationDetail(await api.getOrganization(selectedOrganizationId));
    setNotice('Учасника додано до організації.');
  });

  const searchMembers = () => run(async () => {
    if (memberQuery.trim().length < 2) throw new Error('Введіть щонайменше два символи для пошуку.');
    setMemberResults(await api.searchUsers(memberQuery.trim()));
  });

  const submitOrganizationReview = (submission: ModerationSubmission, approve: boolean) => run(async () => {
    if (selectedOrganizationId === null) return;
    const percent = approve ? Number(reviewPercent) : 0;
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('Оцінка має бути від 0 до 100.');
    await api.decideOrganizationSubmission(
      selectedOrganizationId,
      submission.id,
      percent,
      reviewNote.trim() || undefined,
    );
    setOrganizationSubmissions(await api.getOrganizationSubmissions(selectedOrganizationId, organizationSubmissionStatus));
    setNotice(approve ? 'Рішення щодо звіту збережено.' : 'Звіт відхилено; квест повернеться у виконання.');
  });

  const createReward = () => run(async () => {
    if (selectedPartnerId === null) return;
    const cost = Number(rewardCost);
    if (!rewardTitle.trim() || !Number.isInteger(cost) || cost < 1 || !rewardExpiry.trim()) {
      throw new Error('Вкажіть назву, ціну цілим числом XP та дату завершення у форматі ISO.');
    }
    const reward = await api.createPartnerReward(selectedPartnerId, {
      title: rewardTitle.trim(),
      terms: rewardTerms.trim(),
      cost_xp: cost,
      valid_until: rewardExpiry.trim(),
    });
    setRewardTitle('');
    setRewardTerms('');
    setRewardCost('');
    setRewardExpiry('');
    const codes = rewardCodes.split(/\r?\n/).map((code) => code.trim()).filter(Boolean);
    if (codes.length) {
      try {
        await api.addPartnerRewardCodes(selectedPartnerId, reward.id, codes);
        setRewardCodes('');
        setNotice('Нагороду та промокоди створено.');
      } catch (codesError: unknown) {
        setNotice(`Нагороду створено, але промокоди не завантажено: ${codesError instanceof Error ? codesError.message : 'помилка сервера'}`);
      }
    } else {
      setNotice('Нагороду створено. Додайте коди, щоб вона з’явилася у вітрині.');
    }
    setPartnerRewards(await api.getPartnerRewards(selectedPartnerId));
  });

  const reviewModerationSubmission = (submission: ModerationSubmission, approve: boolean) => run(async () => {
    const percent = approve ? Number(reviewPercent) : 0;
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('Оцінка має бути від 0 до 100.');
    await api.decideModerationSubmission(submission.id, percent, reviewNote.trim() || undefined);
    setModerationSubmissions(await api.getModerationSubmissions());
    setNotice('Рішення щодо фотозвіту збережено.');
  });

  const actOnModerationQuest = (quest: Quest, publish: boolean) => run(async () => {
    const reason = reviewNote.trim();
    if (!reason) throw new Error('Вкажіть причину рішення модератора.');
    if (publish) await api.publishModerationQuest(quest.id, reason);
    else await api.blockModerationQuest(quest.id, reason);
    setModerationQuests(await api.getModerationQuests(platformQuestStatus));
    setNotice(publish ? 'Квест опубліковано.' : 'Квест заблоковано.');
  });

  const reloadQuestQueue = async (scope: 'org' | 'platform') => {
    if (scope === 'org' && selectedOrganizationId !== null) {
      setOrganizationQuests(await api.getOrganizationQuestQueue(selectedOrganizationId, organizationQuestStatus));
    } else if (scope === 'platform') {
      setModerationQuests(await api.getModerationQuests(platformQuestStatus));
    }
  };

  const editQuest = async (scope: 'org' | 'platform', questId: number, changes: QuestChanges) => {
    if (!Object.keys(changes).length) return;
    if (scope === 'org') {
      if (selectedOrganizationId === null) throw new Error('Оберіть організацію.');
      await api.editOrganizationQuest(selectedOrganizationId, questId, changes);
    } else {
      await api.editModerationQuest(questId, changes);
    }
  };

  const saveEditedQuest = async (scope: 'org' | 'platform', questId: number, changes: QuestChanges) => {
    await editQuest(scope, questId, changes);
    await reloadQuestQueue(scope);
    setNotice('Квест оновлено.');
  };

  const publishEditedQuest = async (scope: 'org' | 'platform', questId: number, changes: QuestChanges, note: string) => {
    await editQuest(scope, questId, changes);
    if (scope === 'org' && selectedOrganizationId !== null) {
      await api.publishOrganizationQuest(selectedOrganizationId, questId, note || 'Перевірено організацією');
    } else {
      await api.publishModerationQuest(questId, note || 'Перевірено модератором');
    }
    await reloadQuestQueue(scope);
    setNotice('Квест опубліковано.');
  };

  const blockEditedQuest = async (scope: 'org' | 'platform', questId: number, reason: string) => {
    if (scope === 'org' && selectedOrganizationId !== null) {
      await api.blockOrganizationQuest(selectedOrganizationId, questId, reason);
    } else {
      await api.blockModerationQuest(questId, reason);
    }
    await reloadQuestQueue(scope);
    setNotice('Квест заблоковано.');
  };

  const decideOrganization = (item: OrganizationSummary, approved: boolean) => run(async () => {
    await api.decideModerationOrganization(item.id, approved, reviewNote.trim() || undefined);
    setPendingOrganizations(await api.getModerationOrganizations());
  });

  const decidePartner = (item: PartnerSummary, approved: boolean) => run(async () => {
    await api.decideModerationPartner(item.id, approved, reviewNote.trim() || undefined);
    setPendingPartners(await api.getModerationPartners());
  });

  const renderTabs = <T extends string>(
    items: { id: T; label: string }[],
    selected: T,
    onSelect: (value: T) => void,
  ) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.id}
          onPress={() => onSelect(item.id)}
          style={[
            styles.chip,
            { borderColor: selected === item.id ? colors.primary : colors.border },
            selected === item.id && { backgroundColor: colors.primaryLight },
          ]}
        >
          <Text style={{ color: selected === item.id ? colors.primaryDark : colors.textSecondary, fontWeight: '700', fontSize: 12 }}>
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const field = (label: string, value: string, change: (value: string) => void, placeholder: string, multiline = false) => (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={change}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        autoCapitalize="sentences"
        style={[
          styles.input,
          multiline && styles.multiline,
          { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      />
    </View>
  );

  const renderOrganizationCard = (organization: OrganizationSummary) => (
    <TouchableOpacity
      key={organization.id}
      onPress={() => setSelectedOrganizationId(organization.id)}
      style={[
        styles.entityCard,
        { backgroundColor: colors.surface, borderColor: selectedOrganizationId === organization.id ? colors.primary : colors.border },
      ]}
    >
      <View style={styles.entityCopy}>
        <Text style={[styles.entityTitle, { color: colors.textPrimary }]}>{organization.name}</Text>
        <Text style={[styles.entityDescription, { color: colors.textSecondary }]}>{organization.description || 'Без опису'}</Text>
        <Text style={[styles.statusText, { color: organization.status === 'approved' ? colors.primaryDark : colors.gold }]}>
          {organization.status || 'Статус не вказано'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
    </TouchableOpacity>
  );

  const renderPartnerCard = (partner: PartnerSummary) => (
    <TouchableOpacity
      key={partner.id}
      onPress={() => setSelectedPartnerId(partner.id)}
      style={[
        styles.entityCard,
        { backgroundColor: colors.surface, borderColor: selectedPartnerId === partner.id ? colors.secondaryPurple : colors.border },
      ]}
    >
      <View style={styles.entityCopy}>
        <Text style={[styles.entityTitle, { color: colors.textPrimary }]}>{partner.name}</Text>
        <Text style={[styles.entityDescription, { color: colors.textSecondary }]}>{partner.description || 'Без опису'}</Text>
        <Text style={[styles.statusText, { color: partner.status === 'approved' ? colors.primaryDark : colors.gold }]}>
          {partner.status || 'Статус не вказано'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
    </TouchableOpacity>
  );

  const renderQuestCard = (
    quest: Quest,
    onPublish?: () => void,
    onBlock?: () => void,
    onEdit?: () => void,
  ) => (
    <View key={quest.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {getPhotoUrl(quest.photo_url) ? (
        <Image source={{ uri: getPhotoUrl(quest.photo_url) }} style={styles.questPhoto} resizeMode="cover" />
      ) : null}
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{quest.title || `Квест #${quest.id}`}</Text>
      {quest.description ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{quest.description}</Text> : null}
      <Text style={[styles.metaText, { color: colors.textMuted }]}>
        {quest.status} · складність {quest.difficulty ?? '—'} · {quest.reward_xp ?? 0} XP
      </Text>
      {onPublish && onBlock ? (
        <View style={styles.actions}>
          <Button title="Опублікувати" colors={colors} onPress={onPublish} loading={busyId === quest.id} />
          <Button title="Заблокувати" colors={colors} variant="danger" onPress={onBlock} />
        </View>
      ) : null}
      {onEdit ? <Button title="Відкрити й редагувати" colors={colors} variant="secondary" onPress={onEdit} /> : null}
    </View>
  );

  const renderSubmissionCard = (
    submission: ModerationSubmission,
    onApprove?: () => void,
    onReject?: () => void,
    onRetry?: () => void,
    onArgue?: () => void,
  ) => (
    <View key={submission.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {getPhotoUrl(submission.photo_url) ? (
        <Image source={{ uri: getPhotoUrl(submission.photo_url) }} style={styles.questPhoto} resizeMode="cover" />
      ) : null}
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
        {submission.quest?.title || `Звіт #${submission.id}`}
      </Text>
      <Text style={[styles.metaText, { color: colors.textMuted }]}>
        {submission.status} · AI {submission.ai_percent ?? '—'}% · організація {submission.org_percent ?? '—'}%
      </Text>
      {submission.moderator_note ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{submission.moderator_note}</Text> : null}
      {onApprove && onReject ? (
        <View style={styles.actions}>
          <Button title="Підтвердити" colors={colors} onPress={onApprove} />
          <Button title="Відхилити" colors={colors} variant="danger" onPress={onReject} />
        </View>
      ) : null}
      {onArgue ? <Button title="Оскаржити оцінку AI" colors={colors} variant="outline" onPress={onArgue} /> : null}
      {submission.ai_failed && onRetry ? (
        <Button title="Повторити перевірку AI" colors={colors} variant="outline" onPress={onRetry} />
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрити розділ">
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Спільнота та управління</Text>
        <TouchableOpacity
          onPress={() => {
            if (tab === 'organizations') void reloadOrganizations();
            else if (tab === 'partners') void reloadPartners();
            else void run(async () => {
              const [quests, submissions, orgs, partnerList, trustList, actionList] = await Promise.all([
                api.getModerationQuests(platformQuestStatus),
                api.getModerationSubmissions(),
                api.getModerationOrganizations(),
                api.getModerationPartners(),
                api.getModerationOrganizationTrust(),
                api.getModerationActions(undefined, undefined, 50),
              ]);
              setModerationQuests(quests);
              setModerationSubmissions(submissions);
              setPendingOrganizations(orgs);
              setPendingPartners(partnerList);
              setTrustOrganizations(trustList);
              setActions(actionList);
            });
          }}
          accessibilityRole="button"
          accessibilityLabel="Оновити"
        >
          <Ionicons name="refresh" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {renderTabs(tabs, tab, setTab)}

      {loading ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : null}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Text style={[styles.feedback, { color: colors.danger }]}>{error}</Text> : null}
        {notice ? <Text style={[styles.feedback, { color: colors.primaryDark }]}>{notice}</Text> : null}

        {tab === 'organizations' && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Мої організації</Text>
            {organizations.map(renderOrganizationCard)}
            {!organizations.length ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Поки немає організацій або заявок.</Text> : null}
            <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Подати заявку організації</Text>
              {field('Назва', orgName, setOrgName, 'Назва організації')}
              {field('Опис', orgDescription, setOrgDescription, 'Чим займається організація', true)}
              <Button title="Надіслати заявку" colors={colors} onPress={() => void applyOrganization()} loading={loading} />
            </View>

            {selectedOrganization && (
              <View style={styles.detailSection}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{selectedOrganization.name}</Text>
                {organizationDetail?.trust ? (
                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                    Довіра: {organizationDetail.trust.decisions} рішень · спори {Math.round(organizationDetail.trust.disputed_ratio * 100)}%
                  </Text>
                ) : null}
                {organizationStats ? (
                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                    {organizationStats.points} балів · {organizationStats.members} учасн. · {organizationStats.quests_completed_owned} виконаних квестів
                  </Text>
                ) : null}
                {organizationCanManage && renderTabs([
                  { id: 'quests', label: 'Квести' },
                  { id: 'submissions', label: 'Звіти' },
                  { id: 'reports', label: 'Мітки' },
                  { id: 'members', label: 'Учасники' },
                ], organizationPanel, setOrganizationPanel)}

                {organizationCanManage && organizationPanel === 'quests' && (
                  <>
                    <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>Черга квестів на модерацію організації</Text>
                    {renderTabs([
                      { id: 'pending', label: 'Очікують' },
                      { id: 'available', label: 'Опубліковані' },
                      { id: 'blocked', label: 'Заблоковані' },
                      { id: 'all', label: 'Усі' },
                    ], organizationQuestStatus, setOrganizationQuestStatus)}
                    <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Створити новий квест</Text>
                      {field('Назва', directQuestTitle, setDirectQuestTitle, 'Що потрібно зробити')}
                      {field('Опис', directQuestDescription, setDirectQuestDescription, 'Короткі інструкції волонтеру', true)}
                      <TouchableOpacity
                        onPress={() => void chooseQuestPhoto()}
                        style={[styles.photoSelect, { borderColor: colors.border, backgroundColor: colors.background }]}
                        accessibilityRole="button"
                      >
                        {directQuestPhoto ? (
                          <Image source={{ uri: directQuestPhoto.uri }} style={styles.questPhoto} resizeMode="cover" />
                        ) : (
                          <Text style={[styles.bodyText, { color: colors.primaryDark }]}>Додати фото «до»</Text>
                        )}
                      </TouchableOpacity>
                      <Button
                        title="Створити квест біля мене"
                        colors={colors}
                        onPress={() => void createDirectQuest()}
                        disabled={!directQuestPhoto || loading}
                      />
                    </View>
                    {organizationQuests.map((quest) => renderQuestCard(
                      quest,
                      organizationQuestStatus === 'pending' ? () => void run(async () => {
                        await api.publishOrganizationQuest(selectedOrganization.id, quest.id, reviewNote.trim() || 'Перевірено організацією');
                        setOrganizationQuests(await api.getOrganizationQuestQueue(selectedOrganization.id, organizationQuestStatus));
                      }) : undefined,
                      organizationQuestStatus === 'pending' ? () => void run(async () => {
                        await api.blockOrganizationQuest(selectedOrganization.id, quest.id, reviewNote.trim() || 'Відхилено організацією');
                        setOrganizationQuests(await api.getOrganizationQuestQueue(selectedOrganization.id, organizationQuestStatus));
                      }) : undefined,
                      organizationQuestStatus === 'pending' ? () => setEditing({ quest, scope: 'org' }) : undefined,
                    ))}
                    {!organizationQuests.length ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Черга квестів порожня.</Text> : null}
                    {field('Коментар модерації', reviewNote, setReviewNote, 'Причина публікації або блокування')}
                  </>
                )}

                {organizationCanManage && organizationPanel === 'submissions' && (
                  <>
                    {renderTabs([
                      { id: 'review', label: 'На перевірці' },
                      { id: 'platform', label: 'Спірні' },
                      { id: 'decided', label: 'Розглянуті' },
                      { id: 'all', label: 'Усі' },
                    ], organizationSubmissionStatus, setOrganizationSubmissionStatus)}
                    {field('Фінальна оцінка, %', reviewPercent, setReviewPercent, '0–100')}
                    {field('Коментар до рішення', reviewNote, setReviewNote, 'Пояснення волонтеру')}
                    {organizationSubmissions.map((submission) => renderSubmissionCard(
                      submission,
                      organizationSubmissionStatus === 'review' ? () => void submitOrganizationReview(submission, true) : undefined,
                      organizationSubmissionStatus === 'review' ? () => void submitOrganizationReview(submission, false) : undefined,
                      submission.ai_failed ? () => void run(async () => {
                        await api.retryOrganizationSubmissionAI(selectedOrganization.id, submission.id);
                        setOrganizationSubmissions(await api.getOrganizationSubmissions(selectedOrganization.id, organizationSubmissionStatus));
                      }) : undefined,
                      submission.can_review ? () => void run(async () => {
                        if (!reviewNote.trim()) throw new Error('Вкажіть аргумент для перегляду оцінки.');
                        await api.argueOrganizationSubmission(
                          selectedOrganization.id,
                          submission.id,
                          Number(reviewPercent),
                          reviewNote.trim(),
                        );
                        setOrganizationSubmissions(await api.getOrganizationSubmissions(selectedOrganization.id, organizationSubmissionStatus));
                      }) : undefined,
                    ))}
                    {!organizationSubmissions.length ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Нових звітів немає.</Text> : null}
                  </>
                )}

                {organizationCanManage && organizationPanel === 'reports' && (
                  <>
                    {field('Назва квесту', reportTitle, setReportTitle, 'Наприклад, прибрати парк')}
                    {field('Опис', reportDescription, setReportDescription, 'Що треба зробити', true)}
                    {openReports.map((report) => (
                      <View key={report.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Image source={{ uri: getPhotoUrl(report.photo_url) }} style={styles.questPhoto} resizeMode="cover" />
                        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Мітка #{report.id}</Text>
                        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{report.description || 'Без опису'}</Text>
                        <Button title="Створити квест з мітки" colors={colors} onPress={() => void convertReport(report)} loading={busyId === report.id} />
                      </View>
                    ))}
                    {!openReports.length ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Немає відкритих міток.</Text> : null}
                  </>
                )}

                {organizationCanManage && organizationPanel === 'members' && (
                  <>
                    {field('Пошук за ім’ям або email', memberQuery, setMemberQuery, 'Мінімум два символи')}
                    <Button title="Знайти користувача" colors={colors} variant="outline" onPress={() => void searchMembers()} loading={loading} />
                    {field('Email для додавання', memberEmail, setMemberEmail, 'volunteer@example.com')}
                    <Button title="Додати за email" colors={colors} onPress={() => void addMember()} loading={loading} />
                    {memberResults.map((member) => (
                      <View key={member.id} style={[styles.memberRow, { borderColor: colors.border }]}>
                        <Text style={[styles.bodyText, { color: colors.textPrimary, flex: 1 }]}>{member.name}</Text>
                        <Button title="Додати" colors={colors} onPress={() => void addMember(member)} />
                      </View>
                    ))}
                    {organizationDetail?.members?.map((member) => (
                      <View key={member.id} style={[styles.memberRow, { borderColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.bodyText, { color: colors.textPrimary }]}>{member.name}</Text>
                          <Text style={[styles.metaText, { color: colors.textMuted }]}>{member.role || 'member'}</Text>
                        </View>
                        {organizationDetail.is_head && member.id !== user.id ? (
                          <>
                            <TouchableOpacity
                              onPress={() => void run(async () => {
                                const role = member.role === 'moderator' ? 'member' : 'moderator';
                                await api.setOrganizationMemberRole(selectedOrganization.id, member.id, role);
                                setOrganizationDetail(await api.getOrganization(selectedOrganization.id));
                              })}
                            >
                              <Text style={{ color: colors.primaryDark, fontWeight: '700' }}>
                                {member.role === 'moderator' ? 'Зняти модератора' : 'Модератор'}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => void run(async () => {
                                await api.removeOrganizationMember(selectedOrganization.id, member.id);
                                setOrganizationDetail(await api.getOrganization(selectedOrganization.id));
                              })}
                            >
                              <Ionicons name="person-remove-outline" size={19} color={colors.danger} />
                            </TouchableOpacity>
                          </>
                        ) : null}
                      </View>
                    ))}
                  </>
                )}
              </View>
            )}
          </>
        )}

        {tab === 'partners' && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Мої партнерства</Text>
            {partners.map(renderPartnerCard)}
            {!partners.length ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Поки немає партнерств або заявок.</Text> : null}
            <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Подати заявку партнера</Text>
              {field('Назва', partnerName, setPartnerName, 'Назва компанії або партнера')}
              {field('Опис', partnerDescription, setPartnerDescription, 'Короткий опис', true)}
              <Button title="Надіслати заявку" colors={colors} onPress={() => void applyPartner()} loading={loading} />
            </View>
            {selectedPartner && (
              <View style={styles.detailSection}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{selectedPartner.name}: нагороди</Text>
                {field('Коди для додавання до наявної нагороди, по одному в рядку', existingRewardCodes, setExistingRewardCodes, 'CODE-001\\nCODE-002', true)}
                {partnerRewards.map((reward) => (
                  <View key={reward.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{reward.title}</Text>
                    <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{reward.cost_xp} XP · кодів: {reward.available} · {reward.is_active === false ? 'прихована' : 'активна'}</Text>
                    <View style={styles.actions}>
                      <Button
                        title={reward.is_active === false ? 'Увімкнути' : 'Зняти з вітрини'}
                        colors={colors}
                        variant="outline"
                        onPress={() => void run(async () => {
                          await api.editPartnerReward(selectedPartner.id, reward.id, { is_active: reward.is_active === false });
                          setPartnerRewards(await api.getPartnerRewards(selectedPartner.id));
                        })}
                      />
                      <Button
                        title="Додати коди"
                        colors={colors}
                        onPress={() => void run(async () => {
                          const codes = existingRewardCodes.split(/\r?\n/).map((code) => code.trim()).filter(Boolean);
                          if (!codes.length) throw new Error('Введіть щонайменше один код нижче.');
                          await api.addPartnerRewardCodes(selectedPartner.id, reward.id, codes);
                          setExistingRewardCodes('');
                          setPartnerRewards(await api.getPartnerRewards(selectedPartner.id));
                        })}
                      />
                    </View>
                  </View>
                ))}
                <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Створити нагороду</Text>
                  {field('Назва', rewardTitle, setRewardTitle, 'Наприклад, кава')}
                  {field('Умови', rewardTerms, setRewardTerms, 'Умови використання', true)}
                  {field('Ціна, XP', rewardCost, setRewardCost, '100')}
                  {field('Дійсна до (ISO 8601)', rewardExpiry, setRewardExpiry, '2027-12-31T23:59:59Z')}
                  {field('Коди, по одному в рядку', rewardCodes, setRewardCodes, 'CODE-001\\nCODE-002', true)}
                  <Button title="Створити нагороду" colors={colors} onPress={() => void createReward()} loading={loading} />
                </View>
              </View>
            )}
          </>
        )}

        {tab === 'moderation' && canModeratePlatform && (
          <>
            {renderTabs([
              { id: 'quests', label: `Квести (${moderationQuests.length})` },
              { id: 'submissions', label: `Звіти (${moderationSubmissions.length})` },
              { id: 'organizations', label: `Організації (${pendingOrganizations.length})` },
              { id: 'partners', label: `Партнери (${pendingPartners.length})` },
              { id: 'trust', label: 'Довіра' },
              { id: 'actions', label: 'Журнал' },
            ], moderationPanel, setModerationPanel)}
            {field('Причина / коментар', reviewNote, setReviewNote, 'Пояснення рішення модератора', true)}
            {moderationPanel === 'quests' ? (
              <>
                {renderTabs([
                  { id: 'hazard', label: 'Небезпечні' },
                  { id: 'pending', label: 'Очікують' },
                  { id: 'available', label: 'Опубліковані' },
                  { id: 'blocked', label: 'Заблоковані' },
                  { id: 'all', label: 'Усі' },
                ], platformQuestStatus, setPlatformQuestStatus)}
              </>
            ) : null}
            {(moderationPanel === 'quests') && (
              <>
                {moderationQuests.map((quest) => renderQuestCard(
                  quest,
                  platformQuestStatus === 'hazard' || platformQuestStatus === 'pending' ? () => {
                    setBusyId(quest.id);
                    void actOnModerationQuest(quest, true);
                  } : undefined,
                  platformQuestStatus === 'hazard' || platformQuestStatus === 'pending' ? () => {
                    setBusyId(quest.id);
                    void actOnModerationQuest(quest, false);
                  } : undefined,
                  platformQuestStatus === 'hazard' || platformQuestStatus === 'pending'
                    ? () => setEditing({ quest, scope: 'platform' })
                    : undefined,
                ))}
                {!moderationQuests.length ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Немає небезпечних квестів на перевірці.</Text> : null}
              </>
            )}
            {moderationPanel === 'submissions' && (
              <>
                {field('Фінальна оцінка, %', reviewPercent, setReviewPercent, '0–100')}
                {moderationSubmissions.map((submission) => renderSubmissionCard(
                  submission,
                  () => void reviewModerationSubmission(submission, true),
                  () => void reviewModerationSubmission(submission, false),
                  () => void run(async () => {
                    await api.retryModerationSubmissionAI(submission.id);
                    setModerationSubmissions(await api.getModerationSubmissions());
                  }),
                ))}
                {!moderationSubmissions.length ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Немає фотозвітів на перевірці.</Text> : null}
              </>
            )}
            {moderationPanel === 'organizations' && pendingOrganizations.map((organization) => (
              <View key={organization.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{organization.name}</Text>
                <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{organization.description}</Text>
                <View style={styles.actions}>
                  <Button title="Схвалити" colors={colors} onPress={() => void decideOrganization(organization, true)} />
                  <Button title="Відхилити" colors={colors} variant="danger" onPress={() => void decideOrganization(organization, false)} />
                </View>
              </View>
            ))}
            {moderationPanel === 'partners' && pendingPartners.map((partner) => (
              <View key={partner.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{partner.name}</Text>
                <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{partner.description}</Text>
                <View style={styles.actions}>
                  <Button title="Схвалити" colors={colors} onPress={() => void decidePartner(partner, true)} />
                  <Button title="Відхилити" colors={colors} variant="danger" onPress={() => void decidePartner(partner, false)} />
                </View>
              </View>
            ))}
            {moderationPanel === 'trust' && trustOrganizations.map(({ organization, trust }) => (
              <View key={organization.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{organization.name}</Text>
                <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
                  {trust.decisions} рішень · {trust.disputed} оскаржень · {Math.round(trust.disputed_ratio * 100)}% спірних
                </Text>
                {trust.under_review ? <Text style={[styles.statusText, { color: colors.danger }]}>Потрібна перевірка модератора</Text> : null}
              </View>
            ))}
            {moderationPanel === 'actions' && actions.map((item) => (
              <View key={item.id} style={[styles.actionLog, { borderColor: colors.border }]}>
                <Text style={[styles.bodyText, { color: colors.textPrimary }]}>{item.action} · {item.target_type} #{item.target_id}</Text>
                <Text style={[styles.metaText, { color: colors.textMuted }]}>{item.reason || item.created_at || ''}</Text>
              </View>
            ))}
            {moderationPanel === 'organizations' && !pendingOrganizations.length ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Заявок організацій немає.</Text> : null}
            {moderationPanel === 'partners' && !pendingPartners.length ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Заявок партнерів немає.</Text> : null}
            {moderationPanel === 'trust' && !trustOrganizations.length ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Немає організацій з історією перевірок.</Text> : null}
            {moderationPanel === 'actions' && !actions.length ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Журнал порожній.</Text> : null}
          </>
        )}
      </ScrollView>

      {editing ? (
        <QuestEditorModal
          quest={editing.quest}
          colors={colors}
          canPublishHazard={editing.scope === 'platform'}
          onClose={() => setEditing(null)}
          onSave={(changes) => saveEditedQuest(editing.scope, editing.quest.id, changes)}
          onPublish={(changes, note) => publishEditedQuest(editing.scope, editing.quest.id, changes, note)}
          onBlock={(reason) => blockEditedQuest(editing.scope, editing.quest.id, reason)}
        />
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 16, fontWeight: '900' },
  chipRow: { paddingHorizontal: 12, paddingVertical: 9, gap: 7 },
  chip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 17, borderWidth: 1 },
  loader: { marginTop: 8 },
  content: { padding: 14, paddingBottom: 42, gap: 9 },
  feedback: { padding: 10, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  sectionTitle: { fontSize: 18, fontWeight: '900', marginTop: 5 },
  sectionHint: { fontSize: 12, marginBottom: 5 },
  entityCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 12 },
  entityCopy: { flex: 1, paddingRight: 8 },
  entityTitle: { fontSize: 14, fontWeight: '800' },
  entityDescription: { fontSize: 11, lineHeight: 15, marginTop: 3 },
  statusText: { fontSize: 10, fontWeight: '800', marginTop: 5 },
  formCard: { padding: 13, borderRadius: 15, borderWidth: 1, marginTop: 5, gap: 5 },
  detailSection: { marginTop: 9, gap: 8 },
  fieldGroup: { gap: 5, marginBottom: 5 },
  fieldLabel: { fontSize: 11, fontWeight: '700' },
  input: { minHeight: 43, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13 },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  card: { padding: 12, borderRadius: 14, borderWidth: 1, gap: 7, marginBottom: 3 },
  cardTitle: { fontSize: 14, fontWeight: '800' },
  bodyText: { fontSize: 12, lineHeight: 17 },
  metaText: { fontSize: 10, lineHeight: 15 },
  questPhoto: { height: 130, width: '100%', borderRadius: 10, backgroundColor: '#E2E8F0' },
  photoSelect: { minHeight: 74, borderWidth: 1, borderStyle: 'dashed', borderRadius: 11, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 4 },
  actions: { flexDirection: 'row', gap: 7 },
  memberRow: { minHeight: 47, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, paddingVertical: 7 },
  actionLog: { paddingVertical: 9, borderBottomWidth: 1 },
});
