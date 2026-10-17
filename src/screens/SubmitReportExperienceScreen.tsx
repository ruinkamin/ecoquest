import React, { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Common';
import { Task } from '../data/tasks';
import { theme } from '../theme';
import { TaskArtwork } from '../components/TaskArtwork';

export const SubmitReportExperienceScreen: React.FC<{
  task: Task;
  onClose: () => void;
  onSuccess: (photoUri: string) => void;
}> = ({ task, onClose, onSuccess }) => {
  const [photoUri, setPhotoUri] = useState<string | null>(task.photoAfter ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const applySelectedAsset = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
      Alert.alert('Фото завелике', 'Оберіть зображення розміром до 10 МБ.');
      return;
    }
    setPhotoUri(asset.uri);
  };

  const chooseFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      });
      applySelectedAsset(result);
    } catch {
      Alert.alert('Не вдалося відкрити галерею', 'Перевірте дозвіл на доступ до фотографій та спробуйте ще раз.');
    }
  };

  const takePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Потрібен дозвіл камери', 'Дозвольте доступ до камери у налаштуваннях пристрою, щоб зробити фото.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      });
      applySelectedAsset(result);
    } catch {
      Alert.alert('Не вдалося відкрити камеру', 'Спробуйте вибрати фотографію з галереї.');
    }
  };

  const submit = () => {
    if (!photoUri) {
      Alert.alert('Додайте фото', 'Щоб надіслати звіт, потрібне фото «після».');
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setShowSuccess(true);
    }, 450);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Закрити звіт">
          <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Звіт про прибирання</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.taskCard}>
          <View style={styles.beforePreview}><TaskArtwork compact /></View>
          <View style={styles.taskCopy}>
            <Text style={styles.taskCaption}>ЗАВДАННЯ</Text>
            <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
            <Text style={styles.taskReward}>⚡ +{task.rewardXp} XP кожному учаснику</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Фото «після»</Text>
        <Text style={styles.sectionSubtitle}>Покажіть ту саму ділянку після прибирання · до 10 МБ</Text>
        <View style={[styles.uploadBox, photoUri && styles.uploadBoxSelected]}>
          {photoUri ? (
            <>
              <Image source={{ uri: photoUri }} style={styles.selectedImage} resizeMode="cover" />
              <View style={styles.photoTag}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.photoTagText}>Фото додано</Text>
              </View>
            </>
          ) : (
            <View style={styles.uploadPlaceholder}>
              <View style={styles.cameraCircle}><Ionicons name="camera-outline" size={27} color={theme.colors.primaryDark} /></View>
              <Text style={styles.uploadTitle}>Додайте фото результату</Text>
              <Text style={styles.uploadSub}>Фото обов’язкове для перевірки</Text>
            </View>
          )}
        </View>
        <View style={styles.photoActions}>
          <TouchableOpacity style={styles.photoAction} onPress={chooseFromGallery} accessibilityRole="button">
            <Ionicons name="images-outline" size={17} color={theme.colors.primaryDark} />
            <Text style={styles.photoActionText}>Галерея</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoAction} onPress={takePhoto} accessibilityRole="button">
            <Ionicons name="camera-outline" size={17} color={theme.colors.primaryDark} />
            <Text style={styles.photoActionText}>Зробити фото</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.teamCard}>
          <Text style={styles.sectionTitle}>Склад команди</Text>
          <Text style={styles.sectionSubtitle}>XP отримають підтверджені учасники після схвалення</Text>
          {task.members.length > 0 ? task.members.map((name, index) => (
            <View key={`${name}-${index}`} style={styles.memberRow}>
              <View style={styles.memberAvatar}><Text style={styles.memberInitial}>{name === 'Даніїл Ч. (ви)' ? 'ДЧ' : name.slice(0, 1)}</Text></View>
              <Text style={styles.memberName}>{name}</Text>
              <Text style={styles.confirmed}>✓ Підтверджено</Text>
            </View>
          )) : (
            <View style={styles.memberRow}>
              <View style={styles.memberAvatar}><Text style={styles.memberInitial}>ДЧ</Text></View>
              <Text style={styles.memberName}>Даніїл Ч. (ви)</Text>
              <Text style={styles.confirmed}>✓ Підтверджено</Text>
            </View>
          )}
          {task.assignmentType === 'org' && (
            <View style={styles.orgPoints}>
              <Ionicons name="leaf" size={17} color={theme.colors.primaryDark} />
              <Text style={styles.orgPointsText}>Зелений Дніпро · +{task.rewardXp} балів після схвалення</Text>
            </View>
          )}
        </View>
        <View style={styles.reviewNote}>
          <Ionicons name="information-circle-outline" size={18} color="#54705E" />
          <Text style={styles.reviewText}>Звіт перевірить модератор. XP буде нараховано лише після схвалення.</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Надіслати звіт"
          loading={isSubmitting}
          disabled={!photoUri || isSubmitting}
          icon={<Ionicons name="paper-plane-outline" size={16} color="#fff" />}
          onPress={submit}
        />
      </View>

      <Modal visible={showSuccess} transparent animationType="fade" onRequestClose={() => setShowSuccess(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIcon}><Ionicons name="paper-plane" size={28} color="#fff" /></View>
            <Text style={styles.successTitle}>Звіт надіслано!</Text>
            <Text style={styles.successText}>Модератор перевірить фото «до» та «після». Нагороду буде зараховано після схвалення.</Text>
            <View style={styles.pendingBadge}><Ionicons name="time-outline" size={16} color="#946200" /><Text style={styles.pendingText}>Очікує перевірки</Text></View>
            <Button
              title="До завдання"
              onPress={() => {
                setShowSuccess(false);
                onSuccess(photoUri!);
              }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAF8' },
  header: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#E9EEEA' },
  headerButton: { width: 38, height: 40, justifyContent: 'center' },
  headerTitle: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 26 },
  taskCard: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8EDEA', gap: 10, marginBottom: 17 },
  beforePreview: { width: 84, overflow: 'hidden', borderRadius: 10 },
  taskCopy: { flex: 1, paddingRight: 3 },
  taskCaption: { color: theme.colors.textMuted, fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  taskTitle: { color: theme.colors.textPrimary, fontSize: 12, lineHeight: 16, fontWeight: '800', marginTop: 3 },
  taskReward: { color: '#946200', fontSize: 10, fontWeight: '700', marginTop: 5 },
  sectionTitle: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: '800' },
  sectionSubtitle: { color: theme.colors.textSecondary, fontSize: 10, lineHeight: 14, marginTop: 3, marginBottom: 9 },
  uploadBox: { height: 164, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#9CCFB1', backgroundColor: '#E9FBF0', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  uploadBoxSelected: { borderStyle: 'solid', borderColor: theme.colors.primary, backgroundColor: '#fff' },
  uploadPlaceholder: { alignItems: 'center' },
  cameraCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D1F5DF' },
  uploadTitle: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: '800', marginTop: 8 },
  uploadSub: { color: theme.colors.textSecondary, fontSize: 10, marginTop: 3 },
  selectedImage: { width: '100%', height: '100%' },
  photoTag: { position: 'absolute', left: 9, top: 9, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(19, 84, 53, 0.88)' },
  photoTagText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  photoActions: { flexDirection: 'row', gap: 8, marginTop: 9, marginBottom: 19 },
  photoAction: { minHeight: 42, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#DDE8E0' },
  photoActionText: { color: theme.colors.primaryDark, fontSize: 11, fontWeight: '700' },
  teamCard: { padding: 13, borderRadius: 15, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8EDEA' },
  memberRow: { minHeight: 41, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderColor: '#F0F2F0' },
  memberAvatar: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.purpleLight },
  memberInitial: { color: theme.colors.secondaryPurple, fontSize: 9, fontWeight: '800' },
  memberName: { flex: 1, color: theme.colors.textPrimary, fontSize: 11, fontWeight: '600' },
  confirmed: { color: theme.colors.primaryDark, fontSize: 9, fontWeight: '700' },
  orgPoints: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8, padding: 9, borderRadius: 10, backgroundColor: theme.colors.primaryLight },
  orgPointsText: { flex: 1, color: theme.colors.primaryDark, fontSize: 10, fontWeight: '700' },
  reviewNote: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: '#F0F5F1', marginTop: 12 },
  reviewText: { flex: 1, color: '#52685A', fontSize: 10, lineHeight: 15 },
  footer: { padding: 12, paddingBottom: 14, borderTopWidth: 1, borderColor: '#E9EEEA', backgroundColor: '#fff' },
  modalOverlay: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(13, 30, 22, 0.45)' },
  successCard: { width: '100%', alignItems: 'center', padding: 22, borderRadius: 22, backgroundColor: '#fff' },
  successIcon: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 30, backgroundColor: theme.colors.primary, marginBottom: 14 },
  successTitle: { color: theme.colors.textPrimary, fontSize: 20, fontWeight: '900' },
  successText: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8 },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 16, backgroundColor: '#FFF4D6', marginVertical: 16 },
  pendingText: { color: '#946200', fontSize: 11, fontWeight: '800' },
});
