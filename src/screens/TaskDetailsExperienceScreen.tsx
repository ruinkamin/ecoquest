import React, { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button } from '../components/Common';
import { Task, TaskStatus, statusLabel } from '../data/tasks';
import { theme } from '../theme';
import { TaskArtwork } from '../components/TaskArtwork';

type AssignmentType = 'solo' | 'team' | 'org';
type MemberStatus = 'confirmed' | 'invited' | 'declined';
interface Member { name: string; status: MemberStatus }

const currentUser = 'Даніїл Ч. (ви)';

export const TaskDetailsExperienceScreen: React.FC<{
  task: Task;
  onBack: () => void;
  onClaim: (updatedTask: Task) => void;
  onSubmitReport: () => void;
}> = ({ task, onBack, onClaim, onSubmitReport }) => {
  const [mode, setMode] = useState<'view' | 'select'>('view');
  const [assignmentType, setAssignmentType] = useState<AssignmentType>(task.assignmentType ?? 'solo');
  const [newMember, setNewMember] = useState('');
  const [members, setMembers] = useState<Member[]>(
    task.members.length > 0
      ? task.members.map((name) => ({ name, status: 'confirmed' }))
      : [{ name: currentUser, status: 'confirmed' }],
  );
  const isHazardous = useMemo(
    () => /голк|хімік|вибух|небезпеч|шприц/i.test(`${task.title} ${task.category}`),
    [task.category, task.title],
  );

  const addMember = () => {
    const name = newMember.trim().replace(/^@/, '');
    if (!name) {
      Alert.alert('Додайте учасника', 'Введіть ім’я або Telegram-нікнейм.');
      return;
    }
    const key = name.toLocaleLowerCase();
    if (members.some((member) => member.name.replace(/^@/, '').toLocaleLowerCase() === key)) {
      Alert.alert('Учасник уже є', 'Ця людина вже додана до команди.');
      return;
    }
    setMembers((current) => [...current, { name: name.startsWith('@') ? name : `@${name}`, status: 'invited' }]);
    setNewMember('');
  };

  const toggleMember = (index: number) => {
    setMembers((current) =>
      current.map((member, memberIndex) =>
        memberIndex === index && member.name !== currentUser
          ? { ...member, status: member.status === 'confirmed' ? 'declined' : 'confirmed' }
          : member,
      ),
    );
  };

  const claimTask = () => {
    if (isHazardous) {
      Alert.alert('Небезпечне завдання', 'Не прибирайте небезпечні відходи самостійно. Повідомлення має бути передане відповідним службам.');
      return;
    }
    const confirmed = members.filter((member) => member.status === 'confirmed').map((member) => member.name);
    if (!confirmed.includes(currentUser)) {
      Alert.alert('Потрібен відповідальний', 'Ви маєте бути підтвердженим учасником, щоб почати виконання.');
      return;
    }
    if (assignmentType === 'team' && confirmed.length < 2) {
      Alert.alert('Команда ще не готова', 'Додайте учасника та підтвердьте його участь або оберіть самостійне виконання.');
      return;
    }
    onClaim({ ...task, status: 'in_progress', assignmentType, members: confirmed });
  };

  const openAddress = async () => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${task.address}, Дніпро`)}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Не вдалося відкрити мапу', 'Спробуйте знайти адресу вручну: ' + task.address);
    }
  };

  const currentStatus = task.status as TaskStatus;
  const isActive = currentStatus === 'in_progress';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Назад">
          <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Завдання</Text>
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => Alert.alert('Інформація', 'Завдання перевірене модератором EcoQuest Dnipro.')}
          accessibilityRole="button"
          accessibilityLabel="Інформація про завдання"
        >
          <Ionicons name="ellipsis-horizontal" size={21} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.artwork}><TaskArtwork /></View>
        <View style={styles.body}>
          <View style={styles.badgeRow}>
            <Badge label={task.category} />
            <Badge label={`Складність ${task.difficulty}`} color="#946200" bg="#FEF3C7" />
            <Badge label={`+${task.rewardXp} XP`} color="#946200" bg="#FFF4C2" />
          </View>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, currentStatus !== 'available' && styles.statusDotActive]} />
            <Text style={styles.statusText}>{statusLabel[currentStatus]}</Text>
          </View>
          <Text style={styles.title}>{task.title}</Text>
          <TouchableOpacity onPress={openAddress} style={styles.address} accessibilityRole="link">
            <Ionicons name="location-outline" size={16} color={theme.colors.primaryDark} />
            <Text style={styles.addressText}>{task.address}</Text>
            <Ionicons name="open-outline" size={14} color={theme.colors.textMuted} />
          </TouchableOpacity>

          {isHazardous && (
            <View style={styles.warning}>
              <Ionicons name="warning-outline" size={19} color="#B42318" />
              <Text style={styles.warningText}>Не прибирайте самостійно. Повідомлення буде передане відповідним службам.</Text>
            </View>
          )}

          {task.status === 'available' && mode === 'select' && (
            <View style={styles.selectionCard}>
              <Text style={styles.sectionTitle}>Як прибиратимете?</Text>
              {([
                ['solo', 'Самостійно', 'Прибираю сам і надсилаю звіт'],
                ['team', 'Командою', 'Запросіть друзів — усі отримають однакову винагороду'],
                ['org', 'Від організації', 'Додаткові бали організації у власний рейтинг'],
              ] as const).map(([value, title, description]) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => setAssignmentType(value)}
                  style={[styles.radioItem, assignmentType === value && styles.radioSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: assignmentType === value }}
                >
                  <Ionicons name={assignmentType === value ? 'radio-button-on' : 'radio-button-off'} size={20} color={theme.colors.primaryDark} />
                  <View style={styles.radioCopy}>
                    <Text style={styles.radioTitle}>{title}</Text>
                    <Text style={styles.radioDescription}>{description}</Text>
                  </View>
                </TouchableOpacity>
              ))}

              {assignmentType === 'team' && (
                <View style={styles.team}>
                  <Text style={styles.teamHeading}>Команда · підтвердіть участь</Text>
                  {members.map((member, index) => (
                    <TouchableOpacity
                      key={`${member.name}-${index}`}
                      onPress={() => toggleMember(index)}
                      disabled={member.name === currentUser}
                      style={styles.memberRow}
                      accessibilityRole="button"
                      accessibilityLabel={`${member.name}: ${member.status}`}
                    >
                      <View style={styles.memberAvatar}><Ionicons name="person" size={14} color={theme.colors.secondaryPurple} /></View>
                      <Text style={styles.memberName} numberOfLines={1}>{member.name}</Text>
                      <Text style={[styles.memberStatus, member.status === 'confirmed' && styles.confirmed]}>
                        {member.name === currentUser ? 'Відповідальний' : member.status === 'confirmed' ? '✓ Підтверджено' : member.status === 'invited' ? 'Запрошено · натисніть' : 'Відхилено · натисніть'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <View style={styles.addMemberRow}>
                    <TextInput
                      value={newMember}
                      onChangeText={setNewMember}
                      placeholder="@username"
                      placeholderTextColor={theme.colors.textMuted}
                      autoCapitalize="none"
                      style={styles.memberInput}
                      returnKeyType="done"
                      onSubmitEditing={addMember}
                      accessibilityLabel="Ім’я або Telegram-нікнейм учасника"
                    />
                    <TouchableOpacity onPress={addMember} style={styles.addButton} accessibilityRole="button">
                      <Ionicons name="add" size={20} color="#fff" />
                      <Text style={styles.addButtonText}>Додати</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {assignmentType === 'org' && (
                <View style={styles.orgNotice}>
                  <Ionicons name="leaf" size={17} color={theme.colors.primaryDark} />
                  <Text style={styles.orgText}>Зелений Дніпро · +{task.rewardXp} балів після схвалення звіту</Text>
                </View>
              )}
              <Text style={styles.rewardNote}>Винагорода зараховується лише після схвалення звіту модератором.</Text>
            </View>
          )}

          {isActive && (
            <View style={styles.progressCard}>
              <Ionicons name="time-outline" size={20} color="#1378A9" />
              <View style={styles.progressCopy}>
                <Text style={styles.progressTitle}>Завдання у виконанні</Text>
                <Text style={styles.progressText}>Після прибирання додайте фото та надішліть спільний звіт.</Text>
              </View>
            </View>
          )}
          {currentStatus === 'pending_verification' && (
            <View style={styles.progressCard}>
              <Ionicons name="hourglass-outline" size={20} color="#946200" />
              <View style={styles.progressCopy}>
                <Text style={[styles.progressTitle, { color: '#946200' }]}>Звіт на перевірці</Text>
                <Text style={styles.progressText}>XP буде нараховано після схвалення звіту модератором.</Text>
              </View>
            </View>
          )}
          {currentStatus === 'rejected_verification' && (
            <View style={styles.warning}>
              <Ionicons name="alert-circle-outline" size={19} color="#B42318" />
              <Text style={styles.warningText}>Звіт потрібно доопрацювати. Додайте нове фото після прибирання.</Text>
            </View>
          )}
          {currentStatus === 'completed' && (
            <View style={[styles.progressCard, { backgroundColor: theme.colors.primaryLight }]}>
              <Ionicons name="checkmark-circle" size={20} color={theme.colors.primaryDark} />
              <View style={styles.progressCopy}>
                <Text style={[styles.progressTitle, { color: theme.colors.primaryDark }]}>Завдання виконане</Text>
                <Text style={styles.progressText}>Звіт схвалено. Винагороду нараховано учасникам.</Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        {task.status === 'available' && mode === 'view' && (
          <Button title="Взяти завдання" onPress={() => setMode('select')} disabled={isHazardous} />
        )}
        {task.status === 'available' && mode === 'select' && (
          <>
            <TouchableOpacity onPress={() => setMode('view')} style={styles.cancelButton} accessibilityRole="button">
              <Text style={styles.cancelText}>Назад</Text>
            </TouchableOpacity>
            <View style={styles.claimButton}>
              <Button
                title={assignmentType === 'solo' ? 'Взяти самостійно' : assignmentType === 'team' ? 'Запросити команду' : 'Взяти від організації'}
                onPress={claimTask}
                disabled={isHazardous}
              />
            </View>
          </>
        )}
        {isActive && <Button title="Надіслати звіт «після»" onPress={onSubmitReport} />}
        {currentStatus === 'rejected_verification' && <Button title="Надіслати новий звіт" onPress={onSubmitReport} />}
        {(currentStatus === 'pending_verification' || currentStatus === 'completed') && (
          <Button title="До каталогу завдань" variant="outline" onPress={onBack} />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAF8' },
  header: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, backgroundColor: '#fff' },
  backButton: { width: 42, height: 42, alignItems: 'flex-start', justifyContent: 'center' },
  moreButton: { width: 42, height: 42, alignItems: 'flex-end', justifyContent: 'center' },
  headerTitle: { color: theme.colors.textPrimary, fontSize: 15, fontWeight: '800' },
  scroll: { paddingBottom: 94 },
  artwork: { marginHorizontal: 12, marginTop: 7 },
  body: { paddingHorizontal: 16, paddingTop: 13 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, marginTop: 11, borderRadius: 14, backgroundColor: '#E8EFEA' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.primary },
  statusDotActive: { backgroundColor: '#1686CD' },
  statusText: { color: '#476052', fontSize: 10, fontWeight: '700' },
  title: { color: theme.colors.textPrimary, fontSize: 21, fontWeight: '900', lineHeight: 26, marginTop: 8 },
  address: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9, minHeight: 36 },
  addressText: { flex: 1, color: theme.colors.textSecondary, fontSize: 12, lineHeight: 17 },
  selectionCard: { backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: '#E5EBE7', padding: 13, marginTop: 14 },
  sectionTitle: { color: theme.colors.textPrimary, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  radioItem: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E8ECE9', marginTop: 6, gap: 9 },
  radioSelected: { borderColor: theme.colors.primary, backgroundColor: '#F0FBF5' },
  radioCopy: { flex: 1 },
  radioTitle: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: '700' },
  radioDescription: { color: theme.colors.textSecondary, fontSize: 10, lineHeight: 14, marginTop: 2 },
  team: { marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderColor: '#EDF0ED' },
  teamHeading: { color: theme.colors.textPrimary, fontSize: 12, fontWeight: '800', marginBottom: 5 },
  memberRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 7, borderBottomWidth: 1, borderColor: '#F0F2F0' },
  memberAvatar: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: theme.colors.purpleLight },
  memberName: { flex: 1, color: theme.colors.textPrimary, fontSize: 11, fontWeight: '600' },
  memberStatus: { color: '#8B6A2E', fontSize: 9, fontWeight: '700' },
  confirmed: { color: theme.colors.primaryDark },
  addMemberRow: { flexDirection: 'row', gap: 7, marginTop: 10 },
  memberInput: { flex: 1, height: 42, borderRadius: 11, borderWidth: 1, borderColor: '#DCE5DE', backgroundColor: '#fff', paddingHorizontal: 11, fontSize: 12, color: theme.colors.textPrimary },
  addButton: { minWidth: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 9, borderRadius: 11, backgroundColor: theme.colors.textPrimary },
  addButtonText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  orgNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 11, backgroundColor: theme.colors.primaryLight, marginTop: 10 },
  orgText: { flex: 1, color: theme.colors.primaryDark, fontSize: 11, fontWeight: '700' },
  rewardNote: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 14, marginTop: 9 },
  progressCard: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 13, marginTop: 14, backgroundColor: '#EAF6FC', borderRadius: 13 },
  progressCopy: { flex: 1 },
  progressTitle: { color: '#1378A9', fontSize: 13, fontWeight: '800' },
  progressText: { color: theme.colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 },
  warning: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, marginTop: 12, borderRadius: 12, backgroundColor: '#FEF0EF' },
  warningText: { flex: 1, color: '#8E2721', fontSize: 11, lineHeight: 16 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: 14, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#E9EEEA' },
  cancelButton: { minWidth: 68, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: '700' },
  claimButton: { flex: 1 },
});
