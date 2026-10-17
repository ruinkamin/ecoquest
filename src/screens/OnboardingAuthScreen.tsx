import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutAnimation,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeColors } from '../theme';
import { Button } from '../components/Common';
import { Ionicons } from '@expo/vector-icons';
import { ImpactHero } from '../components/ImpactHero';
import * as Google from 'expo-auth-session/providers/google';
import { ApiUser, api, persistAuthToken } from '../api';

interface Props {
  colors: ThemeColors;
  isDark: boolean;
  onToggleTheme: () => void;
  onSuccess: (userData: ApiUser) => void;
  onSkipToGuest: () => void;
}

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

const googleClientConfigured = Platform.select({
  ios: Boolean(GOOGLE_IOS_CLIENT_ID),
  android: Boolean(GOOGLE_ANDROID_CLIENT_ID),
  default: Boolean(GOOGLE_WEB_CLIENT_ID),
}) ?? false;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface GoogleSignInButtonProps {
  colors: ThemeColors;
  loading: boolean;
  onLoadingChange: (loading: boolean) => void;
  onError: (message: string) => void;
  onSuccess: (userData: ApiUser) => void;
}

const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  colors,
  loading,
  onLoadingChange,
  onError,
  onSuccess,
}) => {
  const processedGoogleToken = useRef<string | null>(null);
  const [googleRequest, googleResponse, promptGoogleAuth] = Google.useIdTokenAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID ?? '',
    androidClientId: GOOGLE_ANDROID_CLIENT_ID ?? '',
    selectAccount: true,
    language: 'uk',
  });

  useEffect(() => {
    if (googleResponse?.type !== 'success') return;
    const idToken = googleResponse.params.id_token;
    if (!idToken || processedGoogleToken.current === idToken) return;
    processedGoogleToken.current = idToken;
    onLoadingChange(true);
    onError('');
    api.googleLogin(idToken)
      .then(async (result) => {
        await persistAuthToken(result.access_token);
        onSuccess(result.user);
      })
      .catch((error: unknown) => {
        onError(error instanceof Error ? error.message : 'Не вдалося увійти через Google.');
      })
      .finally(() => onLoadingChange(false));
  }, [googleResponse, onError, onLoadingChange, onSuccess]);

  const handlePress = async () => {
    if (!googleRequest) {
      onError('Google Sign-In ще завантажується. Спробуйте за мить.');
      return;
    }
    onLoadingChange(true);
    onError('');
    try {
      const result = await promptGoogleAuth();
      if (result.type !== 'success') {
        onLoadingChange(false);
      } else if (!result.params.id_token) {
        onLoadingChange(false);
        onError('Google не повернув токен входу. Спробуйте ще раз.');
      }
    } catch (error: unknown) {
      onLoadingChange(false);
      onError(error instanceof Error ? error.message : 'Не вдалося відкрити Google Sign-In.');
    }
  };

  return (
    <Button
      title="Продовжити з Google"
      colors={colors}
      variant="outline"
      loading={loading}
      disabled={!googleRequest || loading}
      icon={<Ionicons name="logo-google" size={18} color={colors.textPrimary} />}
      onPress={handlePress}
    />
  );
};

export const OnboardingAuthScreen: React.FC<Props> = ({
  colors,
  isDark,
  onToggleTheme,
  onSuccess,
  onSkipToGuest,
}) => {
  const [step, setStep] = useState<'welcome' | 'how' | 'register' | 'login' | 'forgot' | 'reset' | 'dev'>('welcome');
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [infoText, setInfoText] = useState('');

  const transitionTo = (next: typeof step) => {
    setErrorText('');
    setInfoText('');
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStep(next);
  };

  const handleEmailAuth = async () => {
    const finalName = userName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (step === 'register' && !finalName) {
      setErrorText("Вкажіть ім'я.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setErrorText('Введіть коректну електронну адресу.');
      return;
    }
    if (password.length < 6) {
      setErrorText('Пароль має містити щонайменше 6 символів.');
      return;
    }
    setLoading(true);
    setErrorText('');
    try {
      const result = step === 'register'
        ? await api.register(finalName, normalizedEmail, password)
        : await api.login(normalizedEmail, password);
      await persistAuthToken(result.access_token);
      onSuccess(result.user);
    } catch (error: unknown) {
      setErrorText(error instanceof Error ? error.message : 'Не вдалося виконати вхід.');
    } finally {
      setLoading(false);
    }
  };

  const handleDevLogin = async (devName: string) => {
    setLoading(true);
    setErrorText('');
    try {
      const result = await api.devLogin(devName);
      await persistAuthToken(result.access_token);
      onSuccess(result.user);
    } catch (error: unknown) {
      setErrorText(error instanceof Error ? error.message : 'Демо-вхід недоступний.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setErrorText('Введіть коректну електронну адресу.');
      return;
    }
    setLoading(true);
    setErrorText('');
    try {
      const response = await api.forgotPassword(normalizedEmail);
      if (typeof response === 'object' && response.dev_token) {
        setResetToken(response.dev_token);
      }
      const message =
        typeof response === 'string'
          ? response
          : response.message || 'Якщо акаунт існує, інструкції для відновлення надіслано на пошту.';
      transitionTo('reset');
      setInfoText(message);
    } catch (forgotError: unknown) {
      setErrorText(forgotError instanceof Error ? forgotError.message : 'Не вдалося надіслати запит на відновлення.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetToken.trim()) {
      setErrorText('Введіть одноразовий токен із листа.');
      return;
    }
    if (password.length < 6) {
      setErrorText('Пароль має містити щонайменше 6 символів.');
      return;
    }
    setLoading(true);
    setErrorText('');
    try {
      const result = await api.resetPassword(resetToken.trim(), password);
      await persistAuthToken(result.access_token);
      onSuccess(result.user);
    } catch (resetError: unknown) {
      setErrorText(resetError instanceof Error ? resetError.message : 'Не вдалося змінити пароль.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.themeToggleRow}>
        <TouchableOpacity
          style={[styles.themeBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={onToggleTheme}
        >
          <Ionicons name={isDark ? 'sunny' : 'moon'} size={18} color={colors.textPrimary} />
          <Text style={[styles.themeBtnText, { color: colors.textPrimary }]}>
            {isDark ? 'Світла тема' : 'Темна тема'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        {step === 'welcome' && (
          <View style={styles.flexBetween}>
            <ImpactHero />

            <View style={styles.textBlock}>
              <Text style={[styles.mainTitle, { color: colors.textPrimary }]}>
                EcoQuest — добрі зміни поруч
              </Text>
              <Text style={[styles.mainSub, { color: colors.textSecondary }]}>
                Позначайте проблемні місця, виконуйте квести й отримуйте XP за підтверджені справи. Міські партнери можуть додавати промокоди та власні нагороди.
              </Text>
            </View>

            <View style={styles.btnStack}>
              <Button
                title="Почати"
                colors={colors}
                variant="primary"
                onPress={() => transitionTo('how')}
              />
              <TouchableOpacity onPress={() => transitionTo('login')} style={styles.devLink}>
                <Text style={[styles.devLinkText, { color: colors.primaryDark }]}>Вже є акаунт? Увійти</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onSkipToGuest} style={styles.devLink}>
                <Text style={[styles.devLinkText, { color: colors.textSecondary }]}>Переглянути як гість</Text>
              </TouchableOpacity>
              <TouchableOpacity               onPress={() => transitionTo('dev')} style={styles.devLink}>
                <Text style={[styles.devLinkText, { color: colors.secondaryPurple }]}>
                  ⚡ Швидкий демо-вхід для журі
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 'how' && (
          <View style={styles.flexBetween}>
            <View>
              <View style={styles.howHeader}>
                <Text style={[styles.howTitle, { color: colors.textPrimary }]}>Як це працює</Text>
                <TouchableOpacity onPress={() => transitionTo('register')}>
                  <Text style={[styles.devLinkText, { color: colors.primaryDark }]}>Пропустити</Text>
                </TouchableOpacity>
              </View>
              {[
                ['compass-outline', '#10B981', 'Знайдіть точку', 'Мітки створюють мешканці, організації перетворюють їх на квести.'],
                ['people-outline', '#2196F3', 'Зберіть команду', 'Запросіть друзів або виконайте завдання самостійно.'],
                ['camera-outline', '#7C4DFF', 'Покажіть результат', 'Додайте фото «після» — AI та організація перевірять звіт.'],
                ['gift-outline', '#F5A900', 'Отримайте XP', 'Підтверджений внесок стане балами та записом у портфоліо.'],
              ].map(([icon, color, title, body], index) => (
                <View key={title} style={[styles.howCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.howIcon, { backgroundColor: `${color}18` }]}>
                    <Ionicons name={icon as 'compass-outline'} size={22} color={color} />
                  </View>
                  <View style={styles.howCopy}>
                    <Text style={[styles.howCardTitle, { color: colors.textPrimary }]}>{index + 1}  {title}</Text>
                    <Text style={[styles.howCardBody, { color: colors.textSecondary }]}>{body}</Text>
                  </View>
                </View>
              ))}
              <View style={[styles.safetyNote, { backgroundColor: colors.goldLight }]}>
                <Ionicons name="warning-outline" size={20} color={colors.gold} />
                <Text style={[styles.howCardBody, { color: colors.textPrimary, flex: 1 }]}>
                  Не прибирайте голки, хімікати та інші небезпечні відходи — повідомте організацію.
                </Text>
              </View>
            </View>
            <Button title="Далі" colors={colors} variant="primary" onPress={() => transitionTo('register')} />
          </View>
        )}

        {(step === 'register' || step === 'login' || step === 'forgot' || step === 'reset') && (
          <ScrollView contentContainerStyle={styles.scrollForm}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="leaf" size={30} color={colors.primaryDark} />
            </View>
            <Text style={[styles.formTitle, { color: colors.textPrimary }]}>
              {step === 'register'
                ? 'Створіть акаунт'
                : step === 'forgot'
                  ? 'Відновлення пароля'
                  : step === 'reset'
                    ? 'Новий пароль'
                    : 'З поверненням!'}
            </Text>
            <Text style={[styles.formSub, { color: colors.textSecondary }]}>
              {step === 'register'
                ? 'Кілька полів — і можна брати завдання'
                : step === 'forgot'
                  ? 'Надішлемо інструкції, якщо для адреси є акаунт'
                  : step === 'reset'
                    ? 'Введіть одноразовий токен із листа та новий пароль'
                    : 'Увійдіть, щоб продовжити волонтерити'}
            </Text>

            {errorText ? <Text style={styles.errorBanner}>{errorText}</Text> : null}
            {infoText ? <Text style={[styles.errorBanner, { color: colors.primaryDark }]}>{infoText}</Text> : null}

            {step === 'register' && (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Імʼя</Text>
                <TextInput
                  style={[
                    styles.textInput,
                    { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary },
                  ]}
                  placeholder="Імʼя та прізвище"
                  placeholderTextColor={colors.textMuted}
                  value={userName}
                  onChangeText={setUserName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            )}

            {step !== 'reset' && (
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Електронна пошта</Text>
              <TextInput
                style={[
                  styles.textInput,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary },
                ]}
                placeholder="user@eco.dnipro"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            )}

            {step === 'reset' && (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Одноразовий токен</Text>
                <TextInput
                  style={[
                    styles.textInput,
                    { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary },
                  ]}
                  placeholder="Токен із листа"
                  placeholderTextColor={colors.textMuted}
                  value={resetToken}
                  onChangeText={setResetToken}
                  autoCapitalize="none"
                />
              </View>
            )}

            {step !== 'forgot' && (
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Пароль</Text>
              <TextInput
                style={[
                  styles.textInput,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary },
                ]}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                returnKeyType="done"
              />
            </View>
            )}

            <View style={styles.btnRowGap}>
              {(step === 'register' || step === 'login') && (
              <Button
                title={step === 'register' ? 'Створити акаунт' : 'Увійти'}
                colors={colors}
                variant="primary"
                loading={loading}
                onPress={handleEmailAuth}
              />
              )}
              {step === 'forgot' && (
                <Button
                  title="Надіслати інструкції"
                  colors={colors}
                  variant="primary"
                  loading={loading}
                  onPress={handleForgotPassword}
                />
              )}
              {step === 'reset' && (
                <Button
                  title="Зберегти новий пароль"
                  colors={colors}
                  variant="primary"
                  loading={loading}
                  onPress={handleResetPassword}
                />
              )}
              {step === 'login' && (
                <TouchableOpacity onPress={() => transitionTo('forgot')} style={styles.devLink}>
                  <Text style={[styles.devLinkText, { color: colors.primaryDark }]}>Забули пароль?</Text>
                </TouchableOpacity>
              )}
              {(step === 'register' || step === 'login') && googleClientConfigured && (
                <GoogleSignInButton
                  colors={colors}
                  loading={loading}
                  onLoadingChange={setLoading}
                  onError={setErrorText}
                  onSuccess={onSuccess}
                />
              )}
              {(step === 'register' || step === 'login') && !googleClientConfigured && (
                <Text style={[styles.googleSetup, { color: colors.textMuted }]}>
                  Google Sign-In потребує OAuth Client ID для цієї платформи у .env.local
                </Text>
              )}
              {(step === 'register' || step === 'login') && <TouchableOpacity
                onPress={() => transitionTo(step === 'register' ? 'login' : 'register')}
                style={styles.devLink}
              >
                <Text style={[styles.devLinkText, { color: colors.primaryDark }]}>
                  {step === 'register' ? 'Вже є акаунт? Увійти' : 'Немає акаунта? Зареєструватися'}
                </Text>
              </TouchableOpacity>}
              <Button
                title={step === 'forgot' || step === 'reset' ? 'Назад до входу' : 'Назад'}
                colors={colors}
                variant="outline"
                onPress={() => transitionTo(step === 'forgot' || step === 'reset' ? 'login' : 'welcome')}
              />
            </View>
          </ScrollView>
        )}

        {step === 'dev' && (
          <View style={styles.devContainer}>
            <Text style={[styles.formTitle, { color: colors.textPrimary }]}>Демо-ролі для журі</Text>
            <Text style={[styles.formSub, { color: colors.textSecondary }]}>
              Оберіть персонажа зі сценарію бекенду
            </Text>
            {errorText ? <Text style={styles.errorBanner}>{errorText}</Text> : null}

            {[
              { name: 'Маша', desc: 'Жителька: створює мітки сміття' },
              { name: 'Даня', desc: 'Глава «ДніпроПуть»: публікує квести та оцінює' },
              { name: 'Діма', desc: 'Модератор організації: робота з AI' },
              { name: 'Боря', desc: 'Волонтер: бере квести, отримує XP' },
              { name: 'Рома', desc: 'Головний модератор платформи' },
            ].map((char) => (
              <TouchableOpacity
                key={char.name}
                style={[styles.charCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                disabled={loading}
                onPress={() => handleDevLogin(char.name)}
              >
                <View>
                  <Text style={[styles.charName, { color: colors.textPrimary }]}>{char.name}</Text>
                  <Text style={[styles.charDesc, { color: colors.textSecondary }]}>{char.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            ))}

            <View style={{ marginTop: 16 }}>
              <Button title="Назад" colors={colors} variant="outline" onPress={() => transitionTo('welcome')} />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  themeToggleRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  themeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  themeBtnText: { fontSize: 12, fontWeight: '600' },
  inner: { flex: 1, padding: 16 },
  flexBetween: { flex: 1, justifyContent: 'space-between', paddingBottom: 16 },
  textBlock: { marginVertical: 20 },
  mainTitle: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  mainSub: { fontSize: 15, lineHeight: 22 },
  btnStack: { gap: 10 },
  howHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  howTitle: { fontSize: 25, fontWeight: '900' },
  howCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 9,
    gap: 12,
  },
  howIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  howCopy: { flex: 1, gap: 3 },
  howCardTitle: { fontSize: 15, fontWeight: '800' },
  howCardBody: { fontSize: 12, lineHeight: 17 },
  safetyNote: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, marginTop: 3 },
  googleSetup: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
  devLink: { alignItems: 'center', padding: 8 },
  devLinkText: { fontSize: 14, fontWeight: '700' },
  scrollForm: { flexGrow: 1, justifyContent: 'center', paddingBottom: 24 },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  formTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  formSub: { fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 24 },
  errorBanner: { color: '#EF4444', textAlign: 'center', marginBottom: 12, fontWeight: '600' },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  textInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  btnRowGap: { gap: 10, marginTop: 12 },
  devContainer: { flex: 1, justifyContent: 'center' },
  charCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  charName: { fontSize: 16, fontWeight: '700' },
  charDesc: { fontSize: 12, marginTop: 2 },
});