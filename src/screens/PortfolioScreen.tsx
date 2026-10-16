import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiUser, Portfolio, api, getPhotoUrl } from '../api';
import { ThemeColors } from '../theme';

interface Props {
  userId: number;
  colors: ThemeColors;
  onClose: () => void;
}

export const PortfolioScreen: React.FC<Props> = ({ userId, colors, onClose }) => {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.getPortfolio(userId)
      .then((result) => {
        if (mounted) {
          setPortfolio(result);
          setError('');
        }
      })
      .catch((loadError: unknown) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : 'Не вдалося завантажити портфоліо.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [userId]);

  const stats = portfolio?.stats;
  const displayName = stats?.user.name || 'Волонтер EcoQuest';
  const reliability = stats?.reliability == null ? null : Math.round(stats.reliability * 100);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.nav, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Назад">
          <Ionicons name="arrow-back" size={23} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.textPrimary }]}>Портфоліо волонтера</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? <ActivityIndicator size="large" color={colors.primaryDark} /> : null}
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        {stats && (
          <>
            <View style={styles.header}>
              <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.avatarText, { color: colors.primaryDark }]}>
                  {displayName.slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.name, { color: colors.textPrimary }]}>{displayName}</Text>
              <Text style={[styles.subhead, { color: colors.textSecondary }]}>
                Рівень {stats.level} · перевірений внесок у Дніпро
              </Text>
            </View>

            <View style={[styles.statsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Metric label="Квестів" value={stats.quests_completed} colors={colors} />
              <Metric label="Надійність" value={reliability == null ? '—' : `${reliability}%`} colors={colors} />
              <Metric label="Виконання" value={stats.avg_completion_percent == null ? '—' : `${Math.round(stats.avg_completion_percent)}%`} colors={colors} />
              <Metric label="XP" value={stats.lifetime_xp} colors={colors} />
            </View>

            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Підтверджені добрі справи</Text>
            {portfolio?.items.map((item) => (
              <View key={item.quest_id} style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>{item.title || 'Добра справа'}</Text>
                <View style={styles.photoRow}>
                  <EvidencePhoto url={item.photo_before_url} label="ДО" />
                  <EvidencePhoto url={item.photo_after_url} label="ПІСЛЯ" />
                </View>
                <View style={styles.itemMeta}>
                  <Text style={[styles.itemPercent, { color: colors.primaryDark }]}>{item.final_percent}% виконання</Text>
                  <Text style={[styles.itemXp, { color: colors.gold }]}>+{item.awarded_xp} XP</Text>
                </View>
                <Text style={[styles.itemTeam, { color: colors.textSecondary }]}>
                  {item.team.map((member: ApiUser) => member.name).join(', ') || item.owner_org_name || 'EcoQuest'}
                </Text>
              </View>
            ))}
            {!portfolio?.items.length && (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>Підтверджені квести з’являться тут після перевірки.</Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const Metric: React.FC<{ label: string; value: number | string; colors: ThemeColors }> = ({ label, value, colors }) => (
  <View style={styles.metric}>
    <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{value}</Text>
    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
  </View>
);

const EvidencePhoto: React.FC<{ url: string; label: string }> = ({ url, label }) => {
  const photo = getPhotoUrl(url);
  return (
    <View style={styles.photoCell}>
      {photo ? <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" /> : <View style={styles.photo} />}
      <Text style={styles.photoLabel}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  nav: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1 },
  navTitle: { fontSize: 16, fontWeight: '900' },
  scroll: { padding: 16, paddingBottom: 44 },
  header: { alignItems: 'center', paddingVertical: 12 },
  avatar: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { fontSize: 23, fontWeight: '900' },
  name: { fontSize: 21, fontWeight: '900' },
  subhead: { fontSize: 12, marginTop: 3 },
  statsCard: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderRadius: 16, paddingVertical: 7, marginVertical: 13 },
  metric: { width: '50%', alignItems: 'center', padding: 8 },
  metricValue: { fontSize: 20, fontWeight: '900' },
  metricLabel: { fontSize: 11, marginTop: 3 },
  sectionTitle: { fontSize: 17, fontWeight: '900', marginTop: 10, marginBottom: 10 },
  itemCard: { padding: 12, borderRadius: 16, borderWidth: 1, marginBottom: 10 },
  itemTitle: { fontSize: 14, fontWeight: '800', marginBottom: 9 },
  photoRow: { flexDirection: 'row', gap: 7 },
  photoCell: { flex: 1, height: 116, overflow: 'hidden', borderRadius: 10, position: 'relative', backgroundColor: '#DCE8E1' },
  photo: { width: '100%', height: '100%' },
  photoLabel: { position: 'absolute', left: 6, top: 6, backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 9, fontWeight: '900', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 },
  itemMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  itemPercent: { fontSize: 12, fontWeight: '900' },
  itemXp: { fontSize: 12, fontWeight: '900' },
  itemTeam: { fontSize: 11, marginTop: 4 },
  error: { fontSize: 13, fontWeight: '700', textAlign: 'center', margin: 16 },
  empty: { fontSize: 13, lineHeight: 20 },
});
