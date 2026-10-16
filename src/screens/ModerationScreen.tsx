import React from 'react';
import {
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Common';
import { Task } from '../data/tasks';
import { TaskArtwork } from '../components/TaskArtwork';
import { theme } from '../theme';

export const ModerationScreen: React.FC<{
  tasks: Task[];
  onBack: () => void;
  onReview: (taskId: string, approved: boolean) => void;
}> = ({ tasks, onBack, onReview }) => {
  const queue = tasks.filter((task) => task.status === 'pending_verification');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Назад">
          <Ionicons name="arrow-back" size={21} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Перевірка звітів</Text>
          <Text style={styles.subtitle}>Демо-панель модератора</Text>
        </View>
        <View style={styles.queueCount}><Text style={styles.queueCountText}>{queue.length}</Text></View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {queue.map((task) => (
          <View key={task.id} style={styles.card}>
            <View style={styles.cardHeading}>
              <View style={styles.pendingDot} />
              <Text style={styles.pendingLabel}>Очікує перевірки</Text>
              <Text style={styles.reward}>+{task.rewardXp} XP</Text>
            </View>
            <Text style={styles.taskTitle}>{task.title}</Text>
            <Text style={styles.taskMeta}>{task.district} · складність {task.difficulty}</Text>
            <View style={styles.photoRow}>
              <View style={styles.photoColumn}>
                <Text style={styles.photoLabel}>ДО</Text>
                <TaskArtwork compact />
              </View>
              <View style={styles.photoColumn}>
                <Text style={styles.photoLabel}>ПІСЛЯ</Text>
                {task.photoAfter ? (
                  <Image source={{ uri: task.photoAfter }} style={styles.photo} resizeMode="cover" />
                ) : (
                  <View style={styles.photoPlaceholder}><Ionicons name="image-outline" size={23} color={theme.colors.textMuted} /></View>
                )}
              </View>
            </View>
            <View style={styles.participants}>
              <Ionicons name="people-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.participantsText}>{task.members.join(' · ') || 'Даніїл Ч. (ви)'}</Text>
            </View>
            {task.assignmentType === 'org' && (
              <View style={styles.orgNotice}>
                <Ionicons name="leaf-outline" size={15} color={theme.colors.primaryDark} />
                <Text style={styles.orgText}>Зелений Дніпро отримає ще {task.rewardXp} балів</Text>
              </View>
            )}
            <View style={styles.actions}>
              <View style={styles.rejectButton}>
                <Button title="Повернути" variant="outline" onPress={() => onReview(task.id, false)} />
              </View>
              <View style={styles.approveButton}>
                <Button title="Схвалити звіт" onPress={() => onReview(task.id, true)} />
              </View>
            </View>
          </View>
        ))}
        {queue.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Ionicons name="checkmark" size={28} color={theme.colors.primaryDark} /></View>
            <Text style={styles.emptyTitle}>Черга порожня</Text>
            <Text style={styles.emptyText}>Нові звіти з’являться тут після надсилання фото волонтерами.</Text>
            <View style={styles.emptyButton}><Button title="До профілю" variant="outline" onPress={onBack} /></View>
          </View>
        )}
      </ScrollView>
      <View style={styles.footerNote}>
        <Ionicons name="information-circle-outline" size={16} color={theme.colors.textMuted} />
        <Text style={styles.footerText}>Локальний демо-режим: рішення зберігається лише під час роботи застосунку.</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F8F5' },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, gap: 9, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#E9EEEA' },
  backButton: { width: 36, height: 42, justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: '800' },
  subtitle: { color: theme.colors.textMuted, fontSize: 10, marginTop: 2 },
  queueCount: { minWidth: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0CF' },
  queueCountText: { color: '#946200', fontSize: 11, fontWeight: '800' },
  content: { padding: 15, gap: 12, paddingBottom: 22 },
  card: { padding: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E6ECE7', borderRadius: 16 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pendingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F3B624' },
  pendingLabel: { flex: 1, color: '#946200', fontSize: 10, fontWeight: '800' },
  reward: { color: '#946200', fontSize: 11, fontWeight: '800' },
  taskTitle: { color: theme.colors.textPrimary, fontSize: 15, lineHeight: 20, fontWeight: '800', marginTop: 8 },
  taskMeta: { color: theme.colors.textSecondary, fontSize: 10, marginTop: 3 },
  photoRow: { flexDirection: 'row', gap: 8, marginTop: 11 },
  photoColumn: { flex: 1 },
  photoLabel: { color: theme.colors.textMuted, fontSize: 8, fontWeight: '800', marginBottom: 4 },
  photo: { width: '100%', height: 93, borderRadius: 11, backgroundColor: '#EAF0EB' },
  photoPlaceholder: { height: 93, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F4F1' },
  participants: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  participantsText: { flex: 1, color: theme.colors.textSecondary, fontSize: 10 },
  orgNotice: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, backgroundColor: theme.colors.primaryLight, borderRadius: 9, marginTop: 8 },
  orgText: { color: theme.colors.primaryDark, fontSize: 10, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  rejectButton: { flex: 1 },
  approveButton: { flex: 1.35 },
  empty: { alignItems: 'center', paddingHorizontal: 26, paddingTop: 80 },
  emptyIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 29, backgroundColor: theme.colors.primaryLight },
  emptyTitle: { color: theme.colors.textPrimary, fontSize: 17, fontWeight: '800', marginTop: 14 },
  emptyText: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5 },
  emptyButton: { width: '100%', marginTop: 18 },
  footerNote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1, borderColor: '#E9EEEA', backgroundColor: '#fff' },
  footerText: { flex: 1, color: theme.colors.textMuted, fontSize: 9 },
});
