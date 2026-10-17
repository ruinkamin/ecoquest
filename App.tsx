import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { lightTheme, darkTheme } from './src/theme';
import { OnboardingAuthScreen } from './src/screens/OnboardingAuthScreen';
import { ImpactHero } from './src/components/ImpactHero';
import { MapScreen } from './src/screens/MapScreen';
import { TaskDetailsScreen } from './src/screens/TaskDetailsScreen';
import { SubmitReportScreen } from './src/screens/SubmitReportScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { CommunityScreen } from './src/screens/CommunityScreen';
import { Button } from './src/components/Common';
import { Ionicons } from '@expo/vector-icons';
import { ApiUser, Quest, UploadPhoto, api, clearAuthToken, restoreAuthToken, setUnauthorizedHandler } from './src/api';
import { PortfolioScreen } from './src/screens/PortfolioScreen';
import { preparePhotoForUpload } from './src/utils/photo';

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const colors = isDark ? darkTheme : lightTheme;

  // Стан користувача
  const [user, setUser] = useState<ApiUser | null>(null);

  const [activeTab, setActiveTab] = useState<'map' | 'profile'>('map');
  const [currentTask, setCurrentTask] = useState<Quest | null>(null);
  const [reportQuestId, setReportQuestId] = useState<number | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCommunityModal, setShowCommunityModal] = useState(false);
  const [showAddReportModal, setShowAddReportModal] = useState(false);
  const [reportDesc, setReportDesc] = useState('');
  const [reportPhoto, setReportPhoto] = useState<UploadPhoto | null>(null);
  const [reportReviewerType, setReportReviewerType] = useState<'self' | 'ai'>('ai');
  const [creatingReport, setCreatingReport] = useState(false);
  const [mapRefreshKey, setMapRefreshKey] = useState(0);
  const [focusImpactId, setFocusImpactId] = useState<number | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [publicPortfolioId, setPublicPortfolioId] = useState<number | null>(null);

  const updateUser = useCallback((updatedUser: ApiUser) => setUser(updatedUser), []);
  const handleAuthSuccess = useCallback((authenticatedUser: ApiUser) => {
    setUser(authenticatedUser);
    setHasStarted(true);
    void api.getMe()
      .then(setUser)
      .catch((error: unknown) => {
        if (!(error instanceof Error && 'status' in error && error.status === 401)) {
          Alert.alert('Профіль не завантажився', error instanceof Error ? error.message : 'Спробуйте оновити профіль.');
        }
      });
  }, []);

  const handleDeepLink = useCallback((url: string) => {
    const match = url.match(/portfolio\/(\d+)/);
    if (match) setPublicPortfolioId(Number(match[1]));
  }, []);

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => subscription.remove();
  }, [handleDeepLink]);

  // Якщо користувач ще не пройшов стартовий екран і не вибрав перегляд як гість
  const [hasStarted, setHasStarted] = useState(false);

  const handleToggleTheme = () => {
    setIsDark(!isDark);
  };

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setHasStarted(false);
      setShowAuthModal(false);
      setShowCommunityModal(false);
    });
    let mounted = true;
    void (async () => {
      let hadSavedToken = false;
      try {
        const token = await restoreAuthToken();
        hadSavedToken = Boolean(token);
        if (token) {
          const currentUser = await api.getMe();
          if (mounted) {
            setUser(currentUser);
            setHasStarted(true);
          }
        }
      } catch (error: unknown) {
        if (mounted) {
          setHasStarted(true);
          if (
            hadSavedToken &&
            !(error instanceof Error && 'status' in error && error.status === 401)
          ) {
            Alert.alert(
              'Не вдалося перевірити сесію',
              error instanceof Error ? error.message : 'Перевірте з’єднання з сервером.',
            );
          }
        }
      } finally {
        if (mounted) setIsRestoringSession(false);
      }
    })();
    return () => {
      mounted = false;
      setUnauthorizedHandler(null);
    };
  }, []);

  const handleLogout = () => {
    void clearAuthToken();
    setUser(null);
    setHasStarted(false);
    setShowCommunityModal(false);
  };

  const chooseReportPhoto = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Потрібен доступ до камери', 'Дозвольте доступ у налаштуваннях телефона, щоб додати фото активності.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.75,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setReportPhoto(await preparePhotoForUpload(asset, 'report'));
    } catch (error: unknown) {
      Alert.alert('Не вдалося відкрити камеру', error instanceof Error ? error.message : 'Спробуйте ще раз.');
    }
  }, []);

  const submitResidentReport = async () => {
    if (!reportPhoto || creatingReport) return;
    setCreatingReport(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Потрібна геолокація', 'Дозвольте доступ до геолокації, щоб мітка з’явилася у правильному місці.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await api.createReport(
        reportPhoto,
        location.coords.latitude,
        location.coords.longitude,
        reportDesc,
        reportReviewerType,
      );
      setShowAddReportModal(false);
      setReportDesc('');
      setReportPhoto(null);
      setReportReviewerType('ai');
      setMapRefreshKey((key) => key + 1);
      Alert.alert('Активність створено', 'Організації побачать її на мапі та зможуть створити квест.');
    } catch (error: unknown) {
      Alert.alert('Не вдалося створити активність', error instanceof Error ? error.message : 'Перевірте з’єднання та спробуйте ще раз.');
    } finally {
      setCreatingReport(false);
    }
  };

  if (isRestoringSession) {
    return (
      <View style={[styles.root, styles.restoreScreen, { backgroundColor: colors.background }]}>
        <ImpactHero />
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={{ color: colors.textSecondary }}>Завантажуємо EcoQuest…</Text>
      </View>
    );
  }

  if (!hasStarted && publicPortfolioId !== null) {
    return (
      <PortfolioScreen
        userId={publicPortfolioId}
        colors={colors}
        onClose={() => setPublicPortfolioId(null)}
      />
    );
  }

  if (!hasStarted) {
    return (
      <OnboardingAuthScreen
        colors={colors}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
        onSuccess={handleAuthSuccess}
        onSkipToGuest={() => {
          void clearAuthToken();
          setUser(null);
          setHasStarted(true);
        }}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Основна область екранів */}
      <View style={styles.screenArea}>
        {activeTab === 'map' ? (
          <MapScreen
            colors={colors}
            isAuthed={!!user}
            onRequireAuth={() => setShowAuthModal(true)}
            onSelectTask={(task) => setCurrentTask(task)}
            onOpenReportModal={() => setShowAddReportModal(true)}
            refreshKey={mapRefreshKey}
            focusImpactId={focusImpactId}
          />
        ) : (
          <ProfileScreen
            userName={user?.name || 'Волонтер EcoQuest'}
            lifetimeXp={user?.lifetime_xp || 0}
            level={user?.level || 1}
            userId={user?.id || 0}
            spendableXp={user?.spendable_xp || 0}
            colors={colors}
            isDark={isDark}
            onToggleTheme={handleToggleTheme}
            onLogout={handleLogout}
            onProfileUpdated={updateUser}
            onPortfolio={() => user && setPublicPortfolioId(user.id)}
            onOpenCommunity={() => setShowCommunityModal(true)}
            onOpenMap={() => setActiveTab('map')}
          />
        )}
      </View>

      {/* Нижня панель навігації */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('map')}>
          <Ionicons
            name={activeTab === 'map' ? 'map' : 'map-outline'}
            size={22}
            color={activeTab === 'map' ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: activeTab === 'map' ? colors.primary : colors.textMuted, fontWeight: activeTab === 'map' ? '700' : '500' },
            ]}
          >
            Мапа
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            if (!user) {
              setShowAuthModal(true);
            } else {
              setActiveTab('profile');
            }
          }}
        >
          <Ionicons
            name={activeTab === 'profile' ? 'person' : 'person-outline'}
            size={22}
            color={activeTab === 'profile' ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: activeTab === 'profile' ? colors.primary : colors.textMuted, fontWeight: activeTab === 'profile' ? '700' : '500' },
            ]}
          >
            Профіль
          </Text>
        </TouchableOpacity>
      </View>

      {/* Модалка деталей квесту */}
      {currentTask && (
        <Modal visible animationType="slide">
          <TaskDetailsScreen
            task={currentTask}
            currentUserName={user?.name || 'Волонтер EcoQuest'}
            colors={colors}
            isAuthed={!!user}
            onRequireAuth={() => {
              setCurrentTask(null);
              setShowAuthModal(true);
            }}
            onBack={() => setCurrentTask(null)}
            onSubmitReport={() => {
              setReportQuestId(currentTask.id);
              setCurrentTask(null);
              setIsSubmittingReport(true);
            }}
            onChanged={() => setMapRefreshKey((key) => key + 1)}
          />
        </Modal>
      )}

      {/* Модалка подання звіту "після" */}
      {isSubmittingReport && (
        <Modal visible animationType="slide">
          <SubmitReportScreen
            colors={colors}
            currentUserName={user?.name || 'Волонтер EcoQuest'}
            questId={reportQuestId || undefined}
            onClose={() => setIsSubmittingReport(false)}
            onSuccessAward={(awardedXp) => {
              setIsSubmittingReport(false);
              if (user) {
                setUser({
                  ...user,
                  lifetime_xp: (user.lifetime_xp || 0) + awardedXp,
                });
                void api.getMe().then(setUser).catch((error: unknown) => {
                  Alert.alert(
                    'XP нараховано, але профіль не оновився',
                    error instanceof Error ? error.message : 'Оновіть профіль пізніше.',
                  );
                });
              }
              setActiveTab('map');
              if (reportQuestId !== null) setFocusImpactId(reportQuestId);
              setMapRefreshKey((key) => key + 1);
            }}
          />
        </Modal>
      )}

      {/* Створення активності на мапі */}
      <Modal
        visible={showAddReportModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddReportModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={[styles.reportModalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalCardTitle, { color: colors.textPrimary }]}>
              Створити активність
            </Text>
            <Text style={[styles.modalCardSub, { color: colors.textSecondary }]}>
              Додайте фото й оберіть, хто оцінить активність.
            </Text>

            <TouchableOpacity
              style={[styles.photoDrop, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={chooseReportPhoto}
              accessibilityRole="button"
            >
              {reportPhoto ? (
                <Image source={{ uri: reportPhoto.uri }} style={styles.reportPreview} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={32} color={colors.primary} />
                  <Text style={[styles.photoDropText, { color: colors.textSecondary }]}>Додати фото активності</Text>
                </>
              )}
            </TouchableOpacity>

            <TextInput
              style={[
                styles.reportInput,
                { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary },
              ]}
              placeholder="Короткий опис або орієнтир (необовʼязково)"
              placeholderTextColor={colors.textMuted}
              value={reportDesc}
              onChangeText={setReportDesc}
            />

            <Text style={[styles.modalCardSub, { color: colors.textPrimary, fontWeight: '800' }]}>
              Хто оцінюватиме?
            </Text>
            <View style={styles.reportReviewerRow}>
              {([
                ['self', 'Я оціню'],
                ['ai', 'Штучний інтелект'],
              ] as const).map(([value, label]) => {
                const selected = reportReviewerType === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.reportReviewerOption,
                      {
                        backgroundColor: selected ? colors.primaryLight : colors.surface,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setReportReviewerType(value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={selected ? colors.primaryDark : colors.textMuted}
                    />
                    <Text style={{ color: selected ? colors.primaryDark : colors.textSecondary, fontSize: 12, fontWeight: '800' }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ gap: 8 }}>
              <Button
                title="Створити активність"
                colors={colors}
                variant="primary"
                loading={creatingReport}
                disabled={!reportPhoto}
                onPress={submitResidentReport}
              />
              <Button
                title="Скасувати"
                colors={colors}
                variant="outline"
                onPress={() => {
                  setShowAddReportModal(false);
                  setReportDesc('');
                  setReportPhoto(null);
                  setReportReviewerType('ai');
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Модалка авторизації для гостей */}
      <Modal visible={showAuthModal} animationType="slide">
        <OnboardingAuthScreen
          colors={colors}
          isDark={isDark}
          onToggleTheme={handleToggleTheme}
          onSuccess={(u) => {
            setShowAuthModal(false);
            handleAuthSuccess(u);
          }}
          onSkipToGuest={() => setShowAuthModal(false)}
        />
      </Modal>

      <Modal
        visible={publicPortfolioId !== null}
        animationType="slide"
        onRequestClose={() => setPublicPortfolioId(null)}
      >
        {publicPortfolioId !== null && (
          <PortfolioScreen
            userId={publicPortfolioId}
            colors={colors}
            onClose={() => setPublicPortfolioId(null)}
          />
        )}
      </Modal>

      <Modal
        visible={showCommunityModal}
        animationType="slide"
        onRequestClose={() => setShowCommunityModal(false)}
      >
        {user && (
          <CommunityScreen
            user={user}
            colors={colors}
            onClose={() => setShowCommunityModal(false)}
          />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignSelf: 'center', width: '100%', maxWidth: 560 },
  restoreScreen: { alignItems: 'center', justifyContent: 'center', padding: 16, gap: 16 },
  screenArea: { flex: 1 },
  tabBar: {
    height: 60,
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingBottom: 6,
  },
  tabItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabLabel: { fontSize: 11, marginTop: 3 },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  reportModalCard: {
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalCardTitle: { fontSize: 20, fontWeight: '800' },
  modalCardSub: { fontSize: 13, marginTop: 4, marginBottom: 16 },
  photoDrop: {
    height: 120,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  photoDropText: { fontSize: 13, fontWeight: '600', marginTop: 6 },
  reportPreview: { width: '100%', height: '100%', borderRadius: 12 },
  reportReviewerRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  reportReviewerOption: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderRadius: 12, paddingHorizontal: 6 },
  reportInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
});