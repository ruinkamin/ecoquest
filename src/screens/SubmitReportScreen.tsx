import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../theme';
import { Button } from '../components/Common';
import { ApiError, Submission, UploadPhoto, api } from '../api';
import { preparePhotoForUpload } from '../utils/photo';

interface Props {
  colors: ThemeColors;
  currentUserName: string;
  questId?: number;
  onClose: () => void;
  onSuccessAward: (awardedXp: number) => void;
}

const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

export const SubmitReportScreen: React.FC<Props> = ({
  colors,
  currentUserName,
  questId,
  onClose,
  onSuccessAward,
}) => {
  const [photo, setPhoto] = useState<UploadPhoto | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(false);
  const [pollingStatus, setPollingStatus] = useState('');
  const [error, setError] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const selectPhoto = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Потрібен доступ до камери', 'Дозвольте доступ у налаштуваннях телефона, щоб надіслати фотозвіт.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.75,
        });
        if (!result.canceled) setPhoto(await preparePhotoForUpload(result.assets[0], 'proof'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.75,
      });
      if (!result.canceled) setPhoto(await preparePhotoForUpload(result.assets[0], 'proof'));
    } catch (pickerError: unknown) {
      Alert.alert('Не вдалося вибрати фото', pickerError instanceof Error ? pickerError.message : 'Спробуйте ще раз.');
    }
  };

  const choosePhoto = () => {
    Alert.alert('Фото результату', 'Зробіть нове фото або виберіть його з галереї.', [
      { text: 'Камера', onPress: () => void selectPhoto('camera') },
      { text: 'Галерея', onPress: () => void selectPhoto('library') },
      { text: 'Скасувати', style: 'cancel' },
    ]);
  };

  const pollResult = async (initial: Submission) => {
    let current = initial;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (['approved', 'rejected'].includes(current.status)) {
        if (mounted.current) {
          setSubmission(current);
          setPollingStatus('');
        }
        return;
      }
      if (mounted.current) setPollingStatus('AI та організація перевіряють звіт…');
      await sleep(2500);
      if (!mounted.current) return;
      current = await api.getSubmission(initial.id);
      if (mounted.current) setSubmission(current);
    }
    if (mounted.current) setPollingStatus('Звіт ще перевіряється. Статус оновиться у картці квесту.');
  };

  const submit = async () => {
    if (!photo || !questId || loading) return;
    setLoading(true);
    setError('');
    setPollingStatus('Завантажуємо фото…');
    try {
      const result = await api.submitQuestReport(questId, photo);
      if (mounted.current) setSubmission(result);
      await pollResult(result);
    } catch (submitError: unknown) {
      if (mounted.current) {
        setPollingStatus('');
        setError(
          submitError instanceof ApiError
            ? submitError.message
            : submitError instanceof Error
              ? submitError.message
              : 'Не вдалося надіслати звіт.',
        );
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  const accepted = submission?.status === 'approved';
  const rejected = submission?.status === 'rejected';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.navBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрити звіт">
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.textPrimary }]}>Фотозвіт</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity
          style={[
            styles.uploadContainer,
            { backgroundColor: colors.surface, borderColor: photo ? colors.primary : colors.border },
          ]}
          onPress={choosePhoto}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Додати фото результату"
        >
          {photo ? (
            <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" />
          ) : (
            <View style={styles.uploadPrompt}>
              <View style={[styles.camWrap, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="camera" size={30} color={colors.primaryDark} />
              </View>
              <Text style={[styles.uploadTitle, { color: colors.textPrimary }]}>Додати фото «після»</Text>
              <Text style={[styles.uploadSub, { color: colors.textSecondary }]}>Зніміть цю саму ділянку після виконання</Text>
            </View>
          )}
          {photo ? <Text style={styles.photoTag}>Фото «після» · натисніть, щоб замінити</Text> : null}
        </TouchableOpacity>

        {pollingStatus ? (
          <View style={[styles.pollingBox, { backgroundColor: colors.purpleLight }]}>
            {loading ? <ActivityIndicator color={colors.secondaryPurple} /> : <Ionicons name="checkmark-circle" size={20} color={colors.primaryDark} />}
            <Text style={[styles.pollingText, { color: colors.textPrimary }]}>{pollingStatus}</Text>
          </View>
        ) : null}

        {accepted && (
          <View style={[styles.resultCard, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="checkmark-circle" size={22} color={colors.primaryDark} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.resultTitle, { color: colors.primaryDark }]}>
                Підтверджено на {submission?.final_percent ?? 0}%
              </Text>
              <Text style={[styles.uploadSub, { color: colors.textSecondary }]}>
                Нараховано {submission?.awarded_xp ?? 0} XP · результат збережено в портфоліо
              </Text>
            </View>
          </View>
        )}

        {rejected && (
          <View style={[styles.resultCard, { backgroundColor: colors.dangerLight }]}>
            <Ionicons name="refresh-circle" size={22} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.resultTitle, { color: colors.danger }]}>Потрібне доопрацювання</Text>
              <Text style={[styles.uploadSub, { color: colors.textSecondary }]}>
                {submission?.moderator_note || 'Перевірте коментар у деталях квесту та надішліть новий фотозвіт.'}
              </Text>
            </View>
          </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={[styles.teamCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.teamTitle, { color: colors.textPrimary }]}>Звіт від {currentUserName}</Text>
          <Text style={[styles.uploadSub, { color: colors.textSecondary }]}>
            Надсилання фіксує склад команди. XP отримають лише учасники, які підтвердили участь до цього моменту.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {accepted ? (
          <Button
            title="Показати на мапі змін"
            colors={colors}
            variant="primary"
            onPress={() => {
              onSuccessAward(submission?.awarded_xp || 0);
            }}
          />
        ) : (
          <Button
            title={rejected ? 'Закрити' : 'Надіслати звіт'}
            colors={colors}
            variant={rejected ? 'outline' : 'primary'}
            disabled={!photo || !questId || loading || !!submission}
            loading={loading}
            onPress={rejected ? onClose : submit}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  navBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1 },
  navTitle: { fontSize: 17, fontWeight: '800' },
  scroll: { padding: 16, paddingBottom: 100 },
  uploadContainer: { height: 220, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', marginBottom: 16, overflow: 'hidden' },
  preview: { width: '100%', height: '100%' },
  uploadPrompt: { alignItems: 'center', padding: 16 },
  camWrap: { width: 58, height: 58, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 11 },
  uploadTitle: { fontSize: 16, fontWeight: '800' },
  uploadSub: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  photoTag: { position: 'absolute', bottom: 9, left: 9, backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7 },
  pollingBox: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, gap: 9, marginBottom: 14 },
  pollingText: { fontSize: 13, fontWeight: '700', flex: 1 },
  resultCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 14, marginBottom: 14 },
  resultTitle: { fontSize: 14, fontWeight: '900' },
  teamCard: { padding: 14, borderRadius: 14, borderWidth: 1, marginTop: 2 },
  teamTitle: { fontSize: 15, fontWeight: '900' },
  errorText: { color: '#DC2626', fontWeight: '700', fontSize: 12, marginBottom: 12 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, borderTopWidth: 1 },
});
