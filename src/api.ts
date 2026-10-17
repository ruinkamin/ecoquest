import { Platform } from 'react-native';

const isLocalBrowser =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
export const API_URL = (
  isLocalBrowser
    ? 'http://127.0.0.1:8000'
    : configuredApiUrl || 'https://ecoquest.discloud.app'
).replace(/\/+$/, '');
const API_HOST = API_URL.replace(/^https?:\/\//i, '').split('/')[0] || 'невідомий сервер';

const AUTH_TOKEN_KEY = 'ecoquest.access-token';
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

const getBrowserStorage = () => {
  if (typeof globalThis.localStorage === 'undefined') {
    throw new Error('Browser storage is unavailable. Enable local storage and try again.');
  }
  return globalThis.localStorage;
};

export interface ApiUser {
  id: number;
  name: string;
  avatar_url?: string | null;
  email?: string | null;
  role?: string;
  has_password?: boolean;
  has_google?: boolean;
  lifetime_xp?: number;
  spendable_xp?: number;
  level?: number;
  created_count?: number;
  completed_count?: number;
  moderated_org_ids?: number[];
}

export interface AuthResponse {
  access_token: string;
  user: ApiUser;
}

export interface Quest {
  id: number;
  title?: string | null;
  description?: string | null;
  lat: number;
  lng: number;
  photo_url: string;
  status: string;
  difficulty?: number | null;
  reward_xp?: number | null;
  executor_id?: number | null;
  organization_id?: number | null;
  owner_org_name?: string | null;
  participants?: { user: ApiUser; status: string }[];
  actions?: {
    can_claim: boolean;
    can_invite: boolean;
    can_respond: boolean;
    can_submit: boolean;
    can_abandon: boolean;
  };
  last_submission?: Submission | null;
}

export interface Submission {
  id: number;
  quest_id: number;
  photo_url: string;
  status: string;
  final_percent?: number | null;
  awarded_xp?: number | null;
  moderator_note?: string | null;
}

export interface ImpactItem {
  quest_id: number;
  title?: string | null;
  lat: number;
  lng: number;
  photo_before_url: string;
  photo_after_url: string;
  final_percent: number;
  completed_at?: string | null;
  owner_org_name?: string | null;
  executor_org_name?: string | null;
  team: ApiUser[];
}

export interface MapReport {
  id: number;
  created_by?: number;
  lat: number;
  lng: number;
  photo_url: string;
  description?: string | null;
  status: string;
  reviewer_type: 'self' | 'ai';
  review_status: 'pending' | 'evaluated' | 'failed';
  review_score?: number | null;
  review_approved?: boolean | null;
  review_note?: string | null;
  reviewed_at?: string | null;
  created_at?: string;
}

export interface VolunteerTeam {
  id: number;
  name: string;
  invite_code: string;
  created_by: number;
  created_at: string;
  members: ApiUser[];
}

export interface PlatformStats {
  places_cleaned: number;
  quests_available?: number;
  quests_in_progress?: number;
  reports_total: number;
  reports_converted: number;
  volunteers: number;
  organizations: number;
  partners?: number;
  xp_awarded: number;
  promo_codes_issued?: number;
  avg_completion_percent?: number;
  ai_agreement?: number;
  weeks?: { week_start: string; places_cleaned: number; reports: number }[];
}

export interface UserStats {
  user: ApiUser;
  lifetime_xp: number;
  level: number;
  level_progress_xp: number;
  xp_per_level: number;
  quests_completed: number;
  submissions_approved: number;
  submissions_rejected: number;
  reliability?: number | null;
  avg_completion_percent?: number | null;
  reports_created: number;
  reports_converted: number;
  organizations: number;
}

export interface Portfolio {
  stats: UserStats;
  items: (ImpactItem & { awarded_xp: number })[];
}

export interface Reward {
  id: number;
  partner_id: number;
  partner_name: string;
  title: string;
  terms?: string | null;
  image_url?: string | null;
  cost_xp: number;
  valid_until?: string | null;
  is_active?: boolean;
  available: number;
}

export interface Redemption {
  id: number;
  reward: Reward;
  code: string;
  spent_xp: number;
  created_at: string;
}

export interface LeaderboardEntry {
  user: ApiUser;
  lifetime_xp: number;
  level: number;
}

export interface OrganizationLeaderboardEntry {
  organization: { id: number; name: string; points?: number };
  points: number;
}

export interface OrganizationSummary {
  id: number;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  head_id?: number;
  points?: number;
  status?: string;
  moderator_note?: string | null;
  created_at?: string;
}

export interface OrganizationStats {
  organization: OrganizationSummary;
  points: number;
  members: number;
  quests_created: number;
  quests_published: number;
  quests_completed_owned: number;
  quests_completed_as_executor: number;
  reports_converted: number;
  avg_completion_percent: number;
  trust?: {
    decisions: number;
    disputed: number;
    disputed_ratio: number;
    under_review: boolean;
  };
}

export interface PartnerSummary {
  id: number;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  status?: string;
  moderator_note?: string | null;
  created_at?: string;
}

export interface RewardInput {
  title: string;
  terms?: string;
  image_url?: string;
  cost_xp: number;
  valid_until?: string;
  is_active?: boolean;
}

export interface ModerationSubmission extends Submission {
  quest?: Quest;
  executor?: ApiUser;
  ai_failed?: boolean;
  ai_percent?: number | null;
  org_percent?: number | null;
  org_rounds?: number;
  rounds_left?: number;
  ai_revisions?: number;
  disputed?: boolean;
  messages?: { id: number; text: string; percent?: number; created_at?: string }[];
  can_review?: boolean;
}

export interface ApiAction {
  id: number;
  target_type: string;
  target_id: number;
  moderator_id: number;
  action: string;
  reason?: string | null;
  before_json?: Record<string, unknown>;
  after_json?: Record<string, unknown>;
  created_at?: string;
}

export type UploadPhoto = {
  uri: string;
  name: string;
  type: string;
};

type NativeUploadFormData = FormData & {
  append(name: string, value: UploadPhoto): void;
};

const appendPhoto = async (form: FormData, photo: UploadPhoto) => {
  if (Platform.OS === 'web') {
    const response = await fetch(photo.uri);
    if (!response.ok) throw new Error('Could not read the selected photo.');
    form.append('photo', await response.blob(), photo.name);
    return;
  }
  (form as NativeUploadFormData).append('photo', photo);
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const persistAuthToken = async (token: string) => {
  authToken = token;
  if (Platform.OS === 'web') {
    getBrowserStorage().setItem(AUTH_TOKEN_KEY, token);
  } else {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
  }
};

export const restoreAuthToken = async () => {
  const token = Platform.OS === 'web'
    ? getBrowserStorage().getItem(AUTH_TOKEN_KEY)
    : await (await import('expo-secure-store')).getItemAsync(AUTH_TOKEN_KEY);
  authToken = token;
  return token;
};

export const clearAuthToken = async () => {
  authToken = null;
  if (Platform.OS === 'web') {
    getBrowserStorage().removeItem(AUTH_TOKEN_KEY);
  } else {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  }
};

export const getAuthToken = () => authToken;

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

export const getPhotoUrl = (url?: string | null) => {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

export const apiFetch = async <T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> => {
  const requestAuthToken = authToken;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (requestAuthToken) headers.Authorization = `Bearer ${requestAuthToken}`;

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && !headers['Content-Type'] && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  } catch {
    throw new ApiError(
      `Не вдалося зв'язатися з сервером EcoQuest (${API_HOST}). Перевірте інтернет-з'єднання та доступність сервера.`,
      0,
    );
  }

  if (response.status === 401 && requestAuthToken && authToken === requestAuthToken) {
    try {
      await clearAuthToken();
    } finally {
      onUnauthorized?.();
    }
    throw new ApiError('Сесія завершилася. Увійдіть знову.', 401);
  }

  const contentType = response.headers.get('content-type') || '';
  const data: unknown = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const rawDetail = typeof data === 'object' && data !== null && 'detail' in data
      ? data.detail
      : null;
    const detail = Array.isArray(rawDetail)
      ? rawDetail
          .map((item) => (
            typeof item === 'object' && item !== null && 'msg' in item
              ? String(item.msg)
              : String(item)
          ))
          .join('\n')
      : typeof rawDetail === 'string'
        ? rawDetail
        : `Помилка сервера (${response.status})`;
    throw new ApiError(detail, response.status);
  }

  return data as T;
};

const queryString = (params: Record<string, string | number | undefined>) => {
  const query = Object.entries(params)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return query ? `?${query}` : '';
};

export const api = {
  register: (name: string, email: string, password: string) =>
    apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  login: (email: string, password: string) =>
    apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  googleLogin: (idToken: string) =>
    apiFetch<AuthResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken }),
    }),
  devLogin: (name: string) =>
    apiFetch<AuthResponse>('/auth/dev', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  forgotPassword: (email: string) =>
    apiFetch<string | { message?: string; dev_token?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    apiFetch<AuthResponse>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
  getMe: () => apiFetch<ApiUser>('/me'),
  getStats: () => apiFetch<PlatformStats>('/stats'),
  getQuests: (
    bbox?: string,
    status: boolean | string = false,
    limit = 200,
    search?: string,
    difficulty?: number,
  ) =>
    apiFetch<Quest[]>(`/quests${queryString({
      bbox,
      status: typeof status === 'boolean' ? (status ? 'available' : undefined) : status,
      limit,
      q: search?.trim() || undefined,
      difficulty,
    })}`),
  createQuest: async (
    photo: UploadPhoto,
    lat: number,
    lng: number,
    organizationId: number,
    description?: string,
    title?: string,
  ) => {
    const form = new FormData();
    await appendPhoto(form, photo);
    form.append('lat', String(lat));
    form.append('lng', String(lng));
    form.append('organization_id', String(organizationId));
    if (description?.trim()) form.append('description', description.trim());
    if (title?.trim()) form.append('title', title.trim());
    return apiFetch<Quest>('/quests', { method: 'POST', body: form });
  },
  getReports: (bbox?: string, status: 'open' | 'converted' | 'all' = 'open', limit = 200) =>
    apiFetch<MapReport[]>(`/reports${queryString({ bbox, status, limit })}`),
  getReport: (id: number) => apiFetch<MapReport>(`/reports/${id}`),
  convertReportToQuest: (reportId: number, organizationId: number, title?: string, description?: string) =>
    apiFetch<Quest>(`/reports/${reportId}/quest`, {
      method: 'POST',
      body: JSON.stringify({ organization_id: organizationId, title, description }),
    }),
  getImpact: (bbox?: string, limit = 200) => apiFetch<ImpactItem[]>(`/impact${queryString({ bbox, limit })}`),
  getQuest: (id: number) => apiFetch<Quest>(`/quests/${id}`),
  claimQuest: (id: number, mode: 'solo' | 'team' | 'organization' = 'solo', organizationId?: number) =>
    apiFetch<Quest>(`/quests/${id}/claim`, {
      method: 'POST',
      body: JSON.stringify({ mode, organization_id: organizationId }),
    }),
  abandonQuest: (id: number) =>
    apiFetch<Quest>(`/quests/${id}/abandon`, { method: 'POST' }),
  removeQuestParticipant: (questId: number, userId: number) =>
    apiFetch<void>(`/quests/${questId}/participants/${userId}`, { method: 'DELETE' }),
  respondParticipation: (id: number, accept: boolean) =>
    apiFetch(`/quests/${id}/participation`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    }),
  inviteParticipant: (id: number, userId?: number, email?: string) =>
    apiFetch(`/quests/${id}/participants`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, email }),
    }),
  createReport: async (
    photo: UploadPhoto,
    lat: number,
    lng: number,
    description: string,
    reviewerType: 'self' | 'ai',
  ) => {
    const form = new FormData();
    await appendPhoto(form, photo);
    form.append('lat', String(lat));
    form.append('lng', String(lng));
    form.append('reviewer_type', reviewerType);
    if (description.trim()) form.append('description', description.trim());
    return apiFetch<MapReport>('/reports', { method: 'POST', body: form });
  },
  getMyReports: () => apiFetch<MapReport[]>('/me/reports?limit=500'),
  evaluateReport: (id: number, score: number, note?: string) =>
    apiFetch<MapReport>(`/reports/${id}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ score, note }),
    }),
  retryReportReview: (id: number) =>
    apiFetch<MapReport>(`/reports/${id}/retry-review`, { method: 'POST' }),
  submitQuestReport: async (id: number, photo: UploadPhoto) => {
    const form = new FormData();
    await appendPhoto(form, photo);
    return apiFetch<Submission>(`/quests/${id}/submissions`, { method: 'POST', body: form });
  },
  getSubmission: (id: number) => apiFetch<Submission>(`/submissions/${id}`),
  getMyStats: () => apiFetch<UserStats>('/me/stats'),
  getMyQuests: (kind: 'taken' | 'completed' | 'created' = 'taken') =>
    apiFetch<Quest[]>(`/me/quests${queryString({ kind })}`),
  getMyOrganizations: () => apiFetch<OrganizationSummary[]>('/me/organizations'),
  getMyPartners: () => apiFetch<PartnerSummary[]>('/me/partners'),
  getMyRedemptions: () => apiFetch<Redemption[]>('/me/redemptions'),
  getMyInvitations: () => apiFetch<{ quest: Quest; status: string }[]>('/me/invitations'),
  getMyTeams: () => apiFetch<VolunteerTeam[]>('/me/teams'),
  createTeam: (name: string) =>
    apiFetch<VolunteerTeam>('/teams', { method: 'POST', body: JSON.stringify({ name }) }),
  joinTeam: (code: string) =>
    apiFetch<VolunteerTeam>('/teams/join', { method: 'POST', body: JSON.stringify({ code }) }),
  searchUsers: (search: string) => apiFetch<ApiUser[]>(`/users/search${queryString({ q: search })}`),
  getUserStats: (id: number) => apiFetch<UserStats>(`/users/${id}/stats`),
  getPortfolio: (id: number) => apiFetch<Portfolio>(`/users/${id}/portfolio`),
  getRewards: () => apiFetch<Reward[]>('/rewards'),
  getReward: (id: number) => apiFetch<Reward>(`/rewards/${id}`),
  redeemReward: (id: number) => apiFetch<{ code: string }>(`/rewards/${id}/redeem`, { method: 'POST' }),
  getLeaderboard: () => apiFetch<LeaderboardEntry[]>('/leaderboard'),
  getOrganizationLeaderboard: () => apiFetch<OrganizationLeaderboardEntry[]>('/leaderboard/organizations'),
  getOrganizations: () => apiFetch<OrganizationSummary[]>('/organizations'),
  applyForOrganization: (name: string, description: string, logoUrl?: string) =>
    apiFetch<OrganizationSummary>('/organizations', {
      method: 'POST',
      body: JSON.stringify({ name, description, logo_url: logoUrl }),
    }),
  getOrganization: (id: number) => apiFetch<OrganizationSummary & {
    head?: ApiUser;
    members?: (ApiUser & { role?: string })[];
    completed_quests?: number;
    is_head?: boolean;
    is_member?: boolean;
    is_moderator?: boolean;
    trust?: { decisions: number; disputed: number; disputed_ratio: number; under_review: boolean };
  }>(`/organizations/${id}`),
  addOrganizationMember: (id: number, userId?: number, email?: string) =>
    apiFetch<ApiUser>(`/organizations/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, email }),
    }),
  setOrganizationMemberRole: (organizationId: number, userId: number, role: 'member' | 'moderator') =>
    apiFetch<ApiUser & { role: string }>(`/organizations/${organizationId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  removeOrganizationMember: (organizationId: number, userId: number) =>
    apiFetch<void>(`/organizations/${organizationId}/members/${userId}`, { method: 'DELETE' }),
  getOrganizationStats: (id: number) => apiFetch<OrganizationStats>(`/organizations/${id}/stats`),
  getOrganizationQuestQueue: (id: number, status: 'pending' | 'available' | 'blocked' | 'all' = 'pending') =>
    apiFetch<Quest[]>(`/organizations/${id}/moderation/quests${queryString({ status })}`),
  getOrganizationModerationQuest: (organizationId: number, questId: number) =>
    apiFetch<Quest>(`/organizations/${organizationId}/moderation/quests/${questId}`),
  editOrganizationQuest: (organizationId: number, questId: number, changes: Partial<Pick<Quest, 'title' | 'description' | 'difficulty' | 'reward_xp'>>) =>
    apiFetch<Quest>(`/organizations/${organizationId}/moderation/quests/${questId}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    }),
  publishOrganizationQuest: (organizationId: number, questId: number, reason: string) =>
    apiFetch<Quest>(`/organizations/${organizationId}/moderation/quests/${questId}/publish`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  blockOrganizationQuest: (organizationId: number, questId: number, reason: string) =>
    apiFetch<Quest>(`/organizations/${organizationId}/moderation/quests/${questId}/block`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  getOrganizationSubmissions: (
    organizationId: number,
    status: 'review' | 'platform' | 'decided' | 'all' = 'review',
  ) =>
    apiFetch<ModerationSubmission[]>(`/organizations/${organizationId}/moderation/submissions${queryString({ status })}`),
  getOrganizationSubmission: (organizationId: number, submissionId: number) =>
    apiFetch<ModerationSubmission>(`/organizations/${organizationId}/moderation/submissions/${submissionId}`),
  argueOrganizationSubmission: (organizationId: number, submissionId: number, percent: number, text: string) =>
    apiFetch<ModerationSubmission>(`/organizations/${organizationId}/moderation/submissions/${submissionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ percent, text }),
    }),
  decideOrganizationSubmission: (organizationId: number, submissionId: number, percent: number, note?: string) =>
    apiFetch<ModerationSubmission>(`/organizations/${organizationId}/moderation/submissions/${submissionId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ percent, note }),
    }),
  retryOrganizationSubmissionAI: (organizationId: number, submissionId: number) =>
    apiFetch<ModerationSubmission>(`/organizations/${organizationId}/moderation/submissions/${submissionId}/retry-ai`, { method: 'POST' }),
  getPartners: () => apiFetch<PartnerSummary[]>('/partners'),
  applyForPartner: (name: string, description: string, logoUrl?: string) =>
    apiFetch<PartnerSummary>('/partners', {
      method: 'POST',
      body: JSON.stringify({ name, description, logo_url: logoUrl }),
    }),
  getPartner: (id: number) => apiFetch<PartnerSummary & { head_id?: number }>(`/partners/${id}`),
  getPartnerRewards: (id: number) => apiFetch<Reward[]>(`/partners/${id}/rewards`),
  createPartnerReward: (partnerId: number, reward: RewardInput) =>
    apiFetch<Reward>(`/partners/${partnerId}/rewards`, { method: 'POST', body: JSON.stringify(reward) }),
  editPartnerReward: (partnerId: number, rewardId: number, changes: Partial<RewardInput>) =>
    apiFetch<Reward>(`/partners/${partnerId}/rewards/${rewardId}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  addPartnerRewardCodes: (partnerId: number, rewardId: number, codes: string[]) =>
    apiFetch<Reward>(`/partners/${partnerId}/rewards/${rewardId}/codes`, {
      method: 'POST',
      body: JSON.stringify({ codes }),
    }),
  getModerationQuests: (status: 'hazard' | 'pending' | 'available' | 'blocked' | 'all' = 'hazard') =>
    apiFetch<Quest[]>(`/moderation/quests${queryString({ status })}`),
  getModerationQuest: (id: number) => apiFetch<Quest>(`/moderation/quests/${id}`),
  editModerationQuest: (id: number, changes: Partial<Pick<Quest, 'title' | 'description' | 'difficulty' | 'reward_xp'>>) =>
    apiFetch<Quest>(`/moderation/quests/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  publishModerationQuest: (id: number, reason: string) =>
    apiFetch<Quest>(`/moderation/quests/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  blockModerationQuest: (id: number, reason: string) =>
    apiFetch<Quest>(`/moderation/quests/${id}/block`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  getModerationSubmissions: () => apiFetch<ModerationSubmission[]>('/moderation/submissions'),
  getModerationSubmission: (id: number) => apiFetch<ModerationSubmission>(`/moderation/submissions/${id}`),
  decideModerationSubmission: (id: number, percent: number, note?: string) =>
    apiFetch<ModerationSubmission>(`/moderation/submissions/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ percent, note }),
    }),
  retryModerationSubmissionAI: (id: number) =>
    apiFetch<ModerationSubmission>(`/moderation/submissions/${id}/retry-ai`, { method: 'POST' }),
  getModerationOrganizations: () => apiFetch<OrganizationSummary[]>('/moderation/organizations'),
  decideModerationOrganization: (id: number, approved: boolean, note?: string) =>
    apiFetch<OrganizationSummary>(`/moderation/organizations/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ approved, note }),
    }),
  getModerationOrganizationTrust: () => apiFetch<{
    organization: OrganizationSummary;
    trust: { decisions: number; disputed: number; disputed_ratio: number; under_review: boolean };
  }[]>('/moderation/organizations/trust'),
  getModerationPartners: () => apiFetch<PartnerSummary[]>('/moderation/partners'),
  decideModerationPartner: (id: number, approved: boolean, note?: string) =>
    apiFetch<PartnerSummary>(`/moderation/partners/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ approved, note }),
    }),
  getModerationActions: (
    targetType?: 'quest' | 'submission' | 'organization' | 'partner',
    targetId?: number,
    limit = 100,
  ) => apiFetch<ApiAction[]>(`/moderation/actions${queryString({
    target_type: targetType,
    target_id: targetId,
    limit,
  })}`),
  getHealth: () => apiFetch<{ status?: string; [key: string]: unknown }>('/health'),
};
