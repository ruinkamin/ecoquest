export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primarySoft: string;
  secondaryPurple: string;
  purpleLight: string;
  background: string;
  surface: string;
  surfaceSubtle: string;
  card: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderLight: string;
  gold: string;
  goldLight: string;
  danger: string;
  dangerLight: string;
  info: string;
  infoLight: string;
  mapLand: string;
  mapRiver: string;
  mapIsland: string;
  statusInProgress: string;
}

export const lightTheme: ThemeColors = {
  primary: '#10B981',
  primaryDark: '#059669',
  primaryLight: '#E8FDF3',
  primarySoft: '#D1FAE5',
  secondaryPurple: '#6366F1',
  purpleLight: '#EEF2FF',
  background: '#FFFFFF',
  surface: '#F8FAFC',
  surfaceSubtle: '#F1F5F9',
  card: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  gold: '#F59E0B',
  goldLight: '#FEF3C7',
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
  info: '#0EA5E9',
  infoLight: '#E0F2FE',
  mapLand: '#D8ECE5',
  mapRiver: '#99D5EA',
  mapIsland: '#B7E4C7',
  statusInProgress: '#0284C7',
};

export const darkTheme: ThemeColors = {
  primary: '#10B981',
  primaryDark: '#34D399',
  primaryLight: '#064E3B',
  primarySoft: '#022C22',
  secondaryPurple: '#818CF8',
  purpleLight: '#1E1B4B',
  background: '#0F172A',
  surface: '#1E293B',
  surfaceSubtle: '#334155',
  card: '#1E293B',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  border: '#334155',
  borderLight: '#1E293B',
  gold: '#FBBF24',
  goldLight: '#451A03',
  danger: '#F87171',
  dangerLight: '#450A0A',
  info: '#38BDF8',
  infoLight: '#082F49',
  mapLand: '#1E3A2F',
  mapRiver: '#0E3A53',
  mapIsland: '#134E35',
  statusInProgress: '#38BDF8',
};

export const defaultTheme = lightTheme;
export const theme = { colors: defaultTheme };