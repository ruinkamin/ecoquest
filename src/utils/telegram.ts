import { Alert, Linking } from 'react-native';

const BOT_URL = 'https://t.me/EcoQuestDniproBot';

export const openTelegramBot = async (): Promise<void> => {
  try {
    await Linking.openURL(BOT_URL);
  } catch {
    Alert.alert(
      'Не вдалося відкрити Telegram',
      'Перевірте підключення до інтернету або відкрийте @EcoQuestDniproBot у Telegram вручну.',
    );
  }
};
