import React, { useMemo, useState } from 'react';
import {
  Alert,
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
import { Task } from '../data/tasks';
import { theme } from '../theme';
import { openTelegramBot } from '../utils/telegram';

const pinPositions: { top: `${number}%`; left: `${number}%` }[] = [
  { top: '43%', left: '22%' },
  { top: '29%', left: '70%' },
  { top: '59%', left: '65%' },
  { top: '72%', left: '28%' },
  { top: '25%', left: '42%' },
];

type MapFilter = 'available' | 'in_progress' | 'all';

export const MapExperienceScreen: React.FC<{
  tasks: Task[];
  onSelectTask: (task: Task) => void;
}> = ({ tasks, onSelectTask }) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MapFilter>('available');
  const [selected, setSelected] = useState<Task | null>(null);
  const visibleTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const statusMatches =
          filter === 'all' ||
          (filter === 'available' && task.status === 'available') ||
          (filter === 'in_progress' && (task.status === 'in_progress' || task.status === 'pending_verification'));
        const queryMatches = `${task.title} ${task.district} ${task.address}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase());
        return statusMatches && queryMatches;
      }),
    [filter, query, tasks],
  );

  const selectFilter = (next: MapFilter) => {
    setFilter(next);
    setSelected(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.controls}>
        <View style={styles.searchRow}>
          <View style={styles.search}>
            <Ionicons name="search-outline" size={17} color={theme.colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Пошук району або адреси"
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="search"
              style={styles.searchInput}
              accessibilityLabel="Пошук району або адреси"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Очистити пошук">
                <Ionicons name="close-circle" size={19} color={theme.colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={styles.locateButton}
            onPress={() => Alert.alert('Дніпро', 'На мапі показані завдання поруч із центром Дніпра.')}
            accessibilityRole="button"
            accessibilityLabel="Моє місцезнаходження"
          >
            <Ionicons name="locate-outline" size={19} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {([
            ['available', '✓ Доступні'],
            ['in_progress', 'Виконуються'],
            ['all', 'Усі завдання'],
          ] as const).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              onPress={() => selectFilter(key)}
              style={[styles.chip, filter === key && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === key }}
            >
              <Text style={[styles.chipText, filter === key && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.map}>
        <View style={styles.parkNorth} />
        <View style={styles.parkSouth} />
        <View style={styles.river} />
        <View style={styles.riverShore} />
        {Array.from({ length: 7 }, (_, index) => (
          <View key={`road-h-${index}`} style={[styles.roadHorizontal, { top: `${8 + index * 13}%`, transform: [{ rotate: index % 2 ? '3deg' : '-2deg' }] }]} />
        ))}
        {Array.from({ length: 5 }, (_, index) => (
          <View key={`road-v-${index}`} style={[styles.roadVertical, { left: `${7 + index * 21}%`, transform: [{ rotate: index % 2 ? '7deg' : '-5deg' }] }]} />
        ))}
        <View style={styles.island}>
          <Text style={styles.islandLabel}>Монастирський острів</Text>
          <View style={styles.islandTree}><Ionicons name="leaf" size={18} color="#27905A" /></View>
        </View>
        <Text style={styles.riverLabel}>р. Дніпро</Text>
        <View style={styles.neighborhood}><Text style={styles.neighborhoodText}>Парк Шевченка</Text></View>

        {visibleTasks.map((task, index) => {
          const position = pinPositions[index % pinPositions.length];
          return (
            <TouchableOpacity
              key={task.id}
              onPress={() => setSelected(task)}
              style={[styles.marker, position]}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Завдання: ${task.title}`}
            >
              <View style={[styles.markerIcon, task.status !== 'available' && styles.markerInProgress]}>
                <Ionicons name={task.status === 'available' ? 'leaf' : 'time'} size={17} color="#fff" />
              </View>
              <View style={styles.markerBadge}><Text style={styles.markerBadgeText}>+{task.rewardXp} XP</Text></View>
            </TouchableOpacity>
          );
        })}

        {visibleTasks.length === 0 && (
          <View style={styles.noPins}>
            <Ionicons name="search-outline" size={22} color={theme.colors.textSecondary} />
            <Text style={styles.noPinsText}>На цій мапі завдань не знайдено</Text>
          </View>
        )}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={styles.legendDot} /><Text style={styles.legendText}>Доступне</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, styles.legendBlue]} /><Text style={styles.legendText}>Виконується</Text></View>
      </View>

      {!selected && (
        <View style={styles.reportCta}>
          <Button title="Повідомити про сміття" variant="purple" icon={<Ionicons name="paper-plane" size={16} color="#fff" />} onPress={openTelegramBot} />
        </View>
      )}

      {selected && (
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.badgeRow}>
            <Badge label={selected.status === 'available' ? 'Доступне' : 'Виконується'} />
            <Badge label={`Складність ${selected.difficulty}`} color="#946200" bg="#FEF3C7" />
            <Badge label={`+${selected.rewardXp} XP`} color="#946200" bg="#FFF4C2" />
          </View>
          <Text style={styles.sheetTitle}>{selected.title}</Text>
          <Text style={styles.sheetAddress}><Ionicons name="location-outline" size={13} color={theme.colors.textSecondary} /> {selected.district}</Text>
          <View style={styles.sheetActions}>
            <TouchableOpacity onPress={() => setSelected(null)} style={styles.dismiss} accessibilityRole="button">
              <Text style={styles.dismissText}>Закрити</Text>
            </TouchableOpacity>
            <View style={styles.detailsButton}>
              <Button title="Детальніше" onPress={() => onSelectTask(selected)} />
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E9F0E3' },
  controls: { zIndex: 3, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 9, backgroundColor: '#F8FAF6' },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  search: { flex: 1, height: 42, flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E7ECE7' },
  searchInput: { flex: 1, paddingVertical: 0, fontSize: 13, color: theme.colors.textPrimary },
  locateButton: { height: 42, width: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E7ECE7' },
  chips: { gap: 7, paddingTop: 9 },
  chip: { minHeight: 33, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8E2' },
  chipActive: { backgroundColor: '#15241D', borderColor: '#15241D' },
  chipText: { fontSize: 11, fontWeight: '600', color: theme.colors.textPrimary },
  chipTextActive: { color: '#fff' },
  map: { flex: 1, overflow: 'hidden', position: 'relative', backgroundColor: '#F0F0D8' },
  roadHorizontal: { position: 'absolute', left: '-10%', width: '120%', height: 9, backgroundColor: '#fff', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E4E5D2' },
  roadVertical: { position: 'absolute', top: '-6%', bottom: '-6%', width: 8, backgroundColor: '#fff', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#E4E5D2' },
  parkNorth: { position: 'absolute', top: '3%', left: '5%', width: '35%', height: '24%', borderRadius: 42, backgroundColor: '#D4E9B6' },
  parkSouth: { position: 'absolute', bottom: '9%', right: '-10%', width: '49%', height: '25%', borderRadius: 55, backgroundColor: '#CBE3AF' },
  river: { position: 'absolute', top: '39%', left: '-15%', width: '128%', height: '22%', backgroundColor: '#91D2E8', transform: [{ rotate: '-10deg' }], borderRadius: 80 },
  riverShore: { position: 'absolute', top: '36%', left: '-10%', width: '125%', height: '2%', backgroundColor: '#B5DCC9', transform: [{ rotate: '-10deg' }] },
  island: { position: 'absolute', top: '41%', left: '33%', width: '36%', height: '15%', borderRadius: 50, backgroundColor: '#B6DA9D', borderWidth: 2, borderColor: '#A9D18E', alignItems: 'center', justifyContent: 'center' },
  islandLabel: { fontSize: 9, color: '#326B47', fontWeight: '800', textAlign: 'center' },
  islandTree: { position: 'absolute', top: '25%', left: '14%', backgroundColor: '#D6ECC4', width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  riverLabel: { position: 'absolute', top: '34%', left: '9%', color: '#3288A0', fontSize: 11, fontStyle: 'italic', transform: [{ rotate: '-10deg' }] },
  neighborhood: { position: 'absolute', top: '17%', right: '8%', padding: 6, backgroundColor: 'rgba(255,255,255,0.65)', borderRadius: 6 },
  neighborhoodText: { color: '#6A7966', fontSize: 9 },
  marker: { position: 'absolute', alignItems: 'center', zIndex: 2 },
  markerIcon: { width: 34, height: 34, borderRadius: 18, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  markerInProgress: { backgroundColor: '#1686CD' },
  markerBadge: { marginTop: -2, backgroundColor: '#FFC928', borderRadius: 7, paddingHorizontal: 5, paddingVertical: 2 },
  markerBadgeText: { color: '#664B00', fontSize: 9, fontWeight: '900' },
  noPins: { position: 'absolute', top: '43%', left: '10%', right: '10%', borderRadius: 18, padding: 18, alignItems: 'center', gap: 6, backgroundColor: '#fff' },
  noPinsText: { color: theme.colors.textSecondary, fontSize: 13, textAlign: 'center' },
  legend: { position: 'absolute', left: 14, bottom: 88, flexDirection: 'row', gap: 11, backgroundColor: 'rgba(255,255,255,0.94)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary },
  legendBlue: { backgroundColor: '#1686CD' },
  legendText: { color: '#526159', fontSize: 9 },
  reportCta: { position: 'absolute', left: 16, right: 16, bottom: 13 },
  bottomSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 18, elevation: 12 },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 3, backgroundColor: '#D9DFDA', marginBottom: 11 },
  badgeRow: { flexDirection: 'row', gap: 6, marginBottom: 9 },
  sheetTitle: { color: theme.colors.textPrimary, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  sheetAddress: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 6 },
  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 13 },
  dismiss: { minHeight: 46, paddingHorizontal: 14, justifyContent: 'center' },
  dismissText: { color: theme.colors.textSecondary, fontWeight: '600' },
  detailsButton: { flex: 1 },
});
