import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '../components/Common';
import { TaskArtwork } from '../components/TaskArtwork';
import { Task, statusLabel } from '../data/tasks';
import { theme } from '../theme';

type CatalogFilter = 'available' | 'mine';

export const TaskCatalogScreen: React.FC<{
  tasks: Task[];
  onSelectTask: (task: Task) => void;
}> = ({ tasks, onSelectTask }) => {
  const [filter, setFilter] = useState<CatalogFilter>('available');
  const [query, setQuery] = useState('');
  const shownTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const matchesTab = filter === 'available' ? task.status === 'available' : task.status !== 'available';
        const matchesQuery = `${task.title} ${task.district} ${task.category}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase());
        return matchesTab && matchesQuery;
      }),
    [filter, query, tasks],
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Завдання</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Очистити пошук"
          onPress={() => setQuery('')}
          style={styles.headerAction}
        >
          <Ionicons name="options-outline" size={21} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.search}>
        <Ionicons name="search-outline" size={18} color={theme.colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Пошук завдань"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Пошук завдань"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Очистити">
            <Ionicons name="close-circle" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.segment}>
        {(['available', 'mine'] as const).map((item) => (
          <TouchableOpacity
            key={item}
            onPress={() => setFilter(item)}
            style={[styles.segmentOption, filter === item && styles.segmentSelected]}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === item }}
          >
            <Text style={[styles.segmentText, filter === item && styles.segmentTextSelected]}>
              {item === 'available' ? 'Доступні' : 'Мої'}
            </Text>
            <Text style={[styles.count, filter === item && styles.countSelected]}>
              {item === 'available' ? tasks.filter((task) => task.status === 'available').length : tasks.filter((task) => task.status !== 'available').length}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {shownTasks.map((task) => (
          <TouchableOpacity
            key={task.id}
            onPress={() => onSelectTask(task)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={`${task.title}, ${task.rewardXp} XP`}
            style={styles.card}
          >
            <TaskArtwork compact />
            <View style={styles.cardBody}>
              <View style={styles.statusRow}>
                <Badge
                  label={statusLabel[task.status]}
                  color={task.status === 'available' ? theme.colors.primaryDark : theme.colors.statusInProgress}
                  bg={task.status === 'available' ? theme.colors.primaryLight : '#E0F2FE'}
                />
                <Text style={styles.distance}>{task.distance}</Text>
              </View>
              <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
              <Text style={styles.location} numberOfLines={1}>
                <Ionicons name="location-outline" size={12} color={theme.colors.textSecondary} /> {task.district}
              </Text>
              <View style={styles.metaRow}>
                <Badge label={`Складність ${task.difficulty}`} color="#B45309" bg="#FEF3C7" />
                <Badge label={`⚡ +${task.rewardXp} XP`} color="#946200" bg="#FFF4C2" />
              </View>
              {task.status !== 'available' && task.members.length > 0 && (
                <Text style={styles.members}>{task.members.length} учасн. · {task.members.join(', ')}</Text>
              )}
            </View>
          </TouchableOpacity>
        ))}
        {shownTasks.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name={filter === 'mine' ? 'leaf-outline' : 'search-outline'} size={26} color={theme.colors.primaryDark} />
            </View>
            <Text style={styles.emptyTitle}>{filter === 'mine' ? 'Поки немає ваших завдань' : 'Нічого не знайдено'}</Text>
            <Text style={styles.emptyText}>
              {filter === 'mine' ? 'Оберіть доступне завдання та долучайтеся до прибирання.' : 'Змініть пошуковий запит і спробуйте ще раз.'}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F8F5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.textPrimary },
  headerAction: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  search: { marginHorizontal: 16, height: 46, borderRadius: 14, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, gap: 8, borderWidth: 1, borderColor: '#E7EEE8' },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.textPrimary, paddingVertical: 0 },
  segment: { flexDirection: 'row', backgroundColor: '#E7ECE8', borderRadius: 14, padding: 4, marginHorizontal: 16, marginTop: 14, marginBottom: 8 },
  segmentOption: { flex: 1, minHeight: 40, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, borderRadius: 11 },
  segmentSelected: { backgroundColor: '#fff' },
  segmentText: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600' },
  segmentTextSelected: { color: theme.colors.textPrimary },
  count: { overflow: 'hidden', backgroundColor: '#D7E0DA', color: '#53635A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9, fontSize: 10, fontWeight: '700' },
  countSelected: { backgroundColor: theme.colors.primarySoft, color: theme.colors.primaryDark },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, gap: 12 },
  card: { padding: 9, backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: '#E9EFEB' },
  cardBody: { paddingHorizontal: 4, paddingTop: 10, paddingBottom: 3 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  distance: { color: theme.colors.textMuted, fontSize: 11 },
  taskTitle: { color: theme.colors.textPrimary, fontSize: 15, fontWeight: '800', lineHeight: 20 },
  location: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 7, marginTop: 9 },
  members: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 8 },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 72 },
  emptyIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: theme.colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: '800', marginTop: 15 },
  emptyText: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
});
