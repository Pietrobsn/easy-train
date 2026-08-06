import {
  consumeAuthCallback,
  getCurrentUser,
  getRememberedEmail as getAuthRememberedEmail,
  getRememberLogin as getAuthRememberLogin,
  getSession,
  requestPasswordReset,
  setRememberLogin as setAuthRememberLogin,
  signInWithPassword,
  signOut as supabaseSignOut,
  signUp as supabaseSignUp,
  supabaseAnonRpc,
  supabaseEnabled,
  supabaseRpc,
  updatePassword,
} from './supabase.js';
import { student, workoutPlan } from './workouts.js';

const STATE_VERSION = 15;
const SAVE_DEBOUNCE_MS = 180;
const ALLOWED_ACCENTS = new Set(['red', 'green', 'blue', 'yellow']);
const ALLOWED_FOCUS = new Set(['auto', 'legs', 'chest', 'back', 'shoulders', 'arms', 'core', 'cardio', 'full']);
const ALLOWED_THEMES = new Set(['dark', 'light', 'system']);

const defaultState = {
  version: STATE_VERSION,
  onboardingComplete: false,
  student: { ...student, name: 'Atleta' },
  workoutPlan,
  sessions: [],
  activeSession: null,
  activityDates: [],
  exerciseHistory: {},
  preferences: {
    soundEnabled: true,
    vibrationEnabled: true,
    keepAwakeEnabled: true,
    restOverlayEnabled: true,
    autoCopyWeight: true,
    funnyCoachEnabled: true,
    coachDismissedDate: null,
    theme: 'system',
    themePreferenceInitialized: true,
  },
};

let cloudRevision = null;
let pendingState = null;
let pendingResolvers = [];
let saveTimer = null;
let flushInFlight = null;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

// Neutraliza caracteres capazes de virar marcação quando dados antigos ou
// compartilhados forem inseridos em templates HTML. A interface ainda escapa
// os textos nos pontos críticos; isto funciona como defesa adicional.
function neutralText(value, maxLength = 100, { multiline = false, trim = false } = {}) {
  const replacements = { '<': '‹', '>': '›', '&': '＆', '"': '”', "'": '’', '`': '´' };
  const controls = multiline
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
    : /[\u0000-\u001F\u007F]/g;
  let text = String(value ?? '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(controls, ' ')
    .replace(/[<>&"'`]/g, (character) => replacements[character])
    .slice(0, maxLength);
  if (trim) text = text.trim();
  return text;
}

function safeIdentifier(value, prefix = 'item', maxLength = 100) {
  const cleaned = String(value ?? '')
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
  if (cleaned.length >= 3) return cleaned;
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`.slice(0, maxLength);
}

function uniqueIdentifier(value, prefix, used) {
  const base = safeIdentifier(value, prefix);
  let candidate = base;
  let counter = 1;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, Math.max(3, 94 - String(counter).length))}-${counter}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

function safeDate(value) {
  const text = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function safeDateTime(value) {
  const text = String(value || '');
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizePlan(plan = {}, basePlan = defaultState.workoutPlan) {
  const source = plan && typeof plan === 'object' ? plan : {};
  const dayIds = new Set();
  const exerciseIds = new Set();
  const rawDays = Array.isArray(source.days) ? source.days.slice(0, 14) : [];

  const days = rawDays.map((rawDay, dayIndex) => {
    const day = rawDay && typeof rawDay === 'object' ? rawDay : {};
    const title = neutralText(day.title, 60, { trim: true }) || `Treino ${dayIndex + 1}`;
    const exercises = (Array.isArray(day.exercises) ? day.exercises : [])
      .slice(0, 40)
      .map((rawExercise, exerciseIndex) => {
        const exercise = rawExercise && typeof rawExercise === 'object' ? rawExercise : {};
        const minReps = Math.round(clampNumber(exercise.minReps, 1, 100, 8));
        const maxReps = Math.round(clampNumber(exercise.maxReps, minReps, 100, Math.max(minReps, 12)));
        return {
          ...exercise,
          id: uniqueIdentifier(exercise.id, `exercise-${dayIndex + 1}-${exerciseIndex + 1}`, exerciseIds),
          name: neutralText(exercise.name, 80, { trim: true }) || `Exercício ${exerciseIndex + 1}`,
          sets: Math.round(clampNumber(exercise.sets, 1, 20, 3)),
          minReps,
          maxReps,
          restSeconds: Math.round(clampNumber(exercise.restSeconds, 0, 900, 60)),
          tip: neutralText(exercise.tip, 240, { multiline: true, trim: true }),
          muscles: (Array.isArray(exercise.muscles) ? exercise.muscles : [])
            .slice(0, 8)
            .map((muscle) => neutralText(muscle, 40, { trim: true }))
            .filter(Boolean),
        };
      });

    return {
      ...day,
      id: uniqueIdentifier(day.id, `day-${dayIndex + 1}`, dayIds),
      title,
      shortTitle: neutralText(day.shortTitle, 60, { trim: true }) || title.split(',')[0].trim() || title,
      icon: neutralText(day.icon, 8, { trim: true }) || '🏋️',
      accent: ALLOWED_ACCENTS.has(day.accent) ? day.accent : 'yellow',
      focus: ALLOWED_FOCUS.has(day.focus) ? day.focus : 'auto',
      estimatedMinutes: Math.round(clampNumber(day.estimatedMinutes, 10, 180, 60)),
      exercises,
    };
  });

  return {
    ...clone(basePlan),
    ...source,
    id: safeIdentifier(source.id || basePlan.id || 'my-plan', 'plan'),
    name: neutralText(source.name || basePlan.name || 'Meu plano de treino', 80, { trim: true }) || 'Meu plano de treino',
    startsAt: safeDate(source.startsAt),
    expiresAt: safeDate(source.expiresAt),
    weeklyGoal: Math.round(clampNumber(source.weeklyGoal, 1, 7, days.length || 3)),
    days,
  };
}

function normalizeSet(rawSet = {}) {
  const set = rawSet && typeof rawSet === 'object' ? rawSet : {};
  const weight = set.weight === '' || set.weight == null ? '' : String(clampNumber(set.weight, 0, 10000, 0));
  const reps = set.reps === '' || set.reps == null ? '' : String(Math.round(clampNumber(set.reps, 0, 1000, 0)));
  return { weight, reps, done: Boolean(set.done) };
}

function normalizeExerciseState(rawState = {}) {
  const exerciseState = rawState && typeof rawState === 'object' ? rawState : {};
  return {
    ...exerciseState,
    startedAt: safeDateTime(exerciseState.startedAt),
    completedAt: safeDateTime(exerciseState.completedAt),
    pausedAt: safeDateTime(exerciseState.pausedAt),
    pausedSeconds: Math.round(clampNumber(exerciseState.pausedSeconds, 0, 21600, 0)),
    restUntil: safeDateTime(exerciseState.restUntil),
    restRemainingSeconds: Math.round(clampNumber(exerciseState.restRemainingSeconds, 0, 900, 0)),
    notes: neutralText(exerciseState.notes, 240, { multiline: true }),
    prCelebrated: clampNumber(exerciseState.prCelebrated, 0, 10000, 0),
    sets: (Array.isArray(exerciseState.sets) ? exerciseState.sets : []).slice(0, 20).map(normalizeSet),
  };
}

function normalizeSession(rawSession) {
  if (!rawSession || typeof rawSession !== 'object') return null;
  const session = rawSession;
  const snapshotExercises = (Array.isArray(session.snapshot?.exercises) ? session.snapshot.exercises : [])
    .slice(0, 40)
    .map((exercise, index) => ({
      ...exercise,
      id: safeIdentifier(exercise?.id, `snapshot-exercise-${index + 1}`),
      name: neutralText(exercise?.name, 80, { trim: true }) || `Exercício ${index + 1}`,
      sets: Math.round(clampNumber(exercise?.sets, 1, 20, 3)),
      minReps: Math.round(clampNumber(exercise?.minReps, 1, 100, 8)),
      maxReps: Math.round(clampNumber(exercise?.maxReps, 1, 100, 12)),
      restSeconds: Math.round(clampNumber(exercise?.restSeconds, 0, 900, 60)),
    }));

  const exercises = {};
  for (const [rawId, value] of Object.entries(session.exercises && typeof session.exercises === 'object' ? session.exercises : {}).slice(0, 40)) {
    exercises[safeIdentifier(rawId, 'session-exercise')] = normalizeExerciseState(value);
  }

  const bestLift = session.summary?.bestLift && typeof session.summary.bestLift === 'object'
    ? {
        weight: clampNumber(session.summary.bestLift.weight, 0, 10000, 0),
        name: neutralText(session.summary.bestLift.name, 80, { trim: true }),
      }
    : null;

  return {
    ...session,
    id: safeIdentifier(session.id, 'session'),
    workoutId: safeIdentifier(session.workoutId, 'workout'),
    startedAt: safeDateTime(session.startedAt),
    completedAt: safeDateTime(session.completedAt),
    localDate: safeDate(session.localDate || session.completedAt?.slice?.(0, 10)),
    pausedAt: safeDateTime(session.pausedAt),
    pausedSeconds: Math.round(clampNumber(session.pausedSeconds, 0, 21600, 0)),
    snapshot: {
      ...(session.snapshot || {}),
      workoutTitle: neutralText(session.snapshot?.workoutTitle, 100, { trim: true }) || 'Treino',
      workoutIcon: neutralText(session.snapshot?.workoutIcon, 8, { trim: true }) || '🏋️',
      workoutAccent: ALLOWED_ACCENTS.has(session.snapshot?.workoutAccent) ? session.snapshot.workoutAccent : 'yellow',
      exercises: snapshotExercises,
    },
    exercises,
    summary: session.summary && typeof session.summary === 'object'
      ? {
          ...session.summary,
          workoutTitle: neutralText(session.summary.workoutTitle, 100, { trim: true }) || 'Treino',
          durationSeconds: Math.round(clampNumber(session.summary.durationSeconds, 0, 21600, 0)),
          exerciseCount: Math.round(clampNumber(session.summary.exerciseCount, 0, 40, 0)),
          setCount: Math.round(clampNumber(session.summary.setCount, 0, 800, 0)),
          totalVolume: clampNumber(session.summary.totalVolume, 0, 50000000, 0),
          newPRs: Math.round(clampNumber(session.summary.newPRs, 0, 100, 0)),
          rating: session.summary.rating == null ? null : Math.round(clampNumber(session.summary.rating, 1, 5, 3)),
          note: neutralText(session.summary.note, 180, { multiline: true }),
          bestLift,
        }
      : null,
  };
}

function normalizeHistory(rawHistory) {
  const history = rawHistory && typeof rawHistory === 'object' ? rawHistory : {};
  const normalized = {};
  for (const [rawId, records] of Object.entries(history).slice(-250)) {
    const id = safeIdentifier(rawId, 'history-exercise');
    normalized[id] = (Array.isArray(records) ? records : []).slice(-200).map((record) => ({
      date: safeDate(record?.date),
      weight: clampNumber(record?.weight, 0, 10000, 0),
      reps: Math.round(clampNumber(record?.reps, 0, 1000, 0)),
      name: neutralText(record?.name, 80, { trim: true }),
    }));
  }
  return normalized;
}

function mergeState(stored = {}, profile = {}) {
  const base = clone(defaultState);
  const sessions = (Array.isArray(stored.sessions) ? stored.sessions : [])
    .slice(-500)
    .map(normalizeSession)
    .filter(Boolean);
  const activeSession = normalizeSession(stored.activeSession || null);

  return {
    ...base,
    ...stored,
    version: STATE_VERSION,
    onboardingComplete: Boolean(stored.onboardingComplete),
    student: {
      ...base.student,
      ...(stored.student || {}),
      id: profile.id || stored.student?.id || null,
      name: neutralText(profile.display_name || stored.student?.name || 'Atleta', 80, { trim: true }) || 'Atleta',
      username: neutralText(profile.username || stored.student?.username || '', 24, { trim: true }).toLowerCase(),
      bio: neutralText(profile.bio || stored.student?.bio || '', 180, { multiline: true }),
      discoverable: profile.discoverable ?? stored.student?.discoverable ?? true,
      lastWorkout: neutralText(stored.student?.lastWorkout || base.student.lastWorkout, 80, { trim: true }),
      currentStreak: Math.round(clampNumber(stored.student?.currentStreak, 0, 100000, 0)),
      bestStreak: Math.round(clampNumber(stored.student?.bestStreak, 0, 100000, 0)),
    },
    workoutPlan: normalizePlan(stored.workoutPlan, base.workoutPlan),
    sessions,
    activeSession,
    activityDates: [...new Set(
      (Array.isArray(stored.activityDates) ? stored.activityDates : []).map(safeDate).filter(Boolean),
    )].slice(-1000),
    exerciseHistory: normalizeHistory(stored.exerciseHistory),
    preferences: {
      ...base.preferences,
      ...(stored.preferences || {}),
      soundEnabled: stored.preferences?.soundEnabled !== false,
      vibrationEnabled: stored.preferences?.vibrationEnabled !== false,
      keepAwakeEnabled: stored.preferences?.keepAwakeEnabled !== false,
      restOverlayEnabled: stored.preferences?.restOverlayEnabled !== false,
      autoCopyWeight: stored.preferences?.autoCopyWeight !== false,
      funnyCoachEnabled: stored.preferences?.funnyCoachEnabled !== false,
      coachDismissedDate: safeDate(stored.preferences?.coachDismissedDate),
      theme: stored.preferences?.themePreferenceInitialized === true && ALLOWED_THEMES.has(stored.preferences?.theme)
        ? stored.preferences.theme
        : 'system',
      themePreferenceInitialized: true,
    },
  };
}

function sanitizeStateForCloud(value) {
  return mergeState(value, {
    id: value?.student?.id,
    display_name: value?.student?.name,
    username: value?.student?.username,
    bio: value?.student?.bio,
    discoverable: value?.student?.discoverable,
  });
}

async function writeCloudState(state) {
  const cleanState = sanitizeStateForCloud(state);
  const result = await supabaseRpc('easy_train_save_my_state', {
    p_state: cleanState,
    p_expected_revision: cloudRevision,
  });
  if (Number.isFinite(Number(result?.revision))) cloudRevision = Number(result.revision);
  return result?.state || cleanState;
}

async function flushPendingSave() {
  if (flushInFlight) return flushInFlight;
  if (!pendingState) return null;

  const stateToSave = pendingState;
  const resolvers = pendingResolvers.splice(0);
  pendingState = null;
  saveTimer = null;
  flushInFlight = writeCloudState(stateToSave)
    .then((result) => {
      resolvers.forEach(({ resolve }) => resolve(result));
      return result;
    })
    .catch((error) => {
      const conflict = error?.hint === 'STATE_CONFLICT' || error?.code === '40001';
      // Erros transitórios mantêm a última versão para nova tentativa. Um conflito
      // precisa ser recarregado; reaplicar o payload antigo derrotaria a proteção.
      if (!conflict) pendingState ||= stateToSave;
      resolvers.forEach(({ reject }) => reject(error));
      throw error;
    })
    .finally(() => {
      flushInFlight = null;
      if (pendingState && pendingResolvers.length) saveTimer = setTimeout(flushPendingSave, SAVE_DEBOUNCE_MS);
    });
  return flushInFlight;
}

export const repository = {
  supabaseEnabled,

  consumeAuthCallback() { return consumeAuthCallback(); },
  async requestPasswordReset(email) { return requestPasswordReset(email); },
  async updatePassword(password) { return updatePassword(password); },
  async getSession() { return getSession(); },
  async getCurrentUser() { return getCurrentUser(); },
  getRememberLogin() { return getAuthRememberLogin(); },
  getRememberedEmail() { return getAuthRememberedEmail(); },
  setRememberLogin(enabled, email = '') { setAuthRememberLogin(enabled, email); },

  async signIn(email, password, { remember = true } = {}) {
    await signInWithPassword(email, password, { remember });
    return this.getAppState();
  },

  async signUp({ displayName, username, email, password, remember = true }) {
    const normalizedUsername = neutralText(username, 24, { trim: true }).toLowerCase();
    const available = await supabaseAnonRpc('easy_train_username_available', { p_username: normalizedUsername });
    if (!available) throw new Error('Esse @usuário já está em uso.');
    const result = await supabaseSignUp({
      displayName: neutralText(displayName, 80, { trim: true }),
      username: normalizedUsername,
      email,
      password,
      remember,
    });
    return { session: result?.access_token ? result : null, user: result?.user || null };
  },

  async signOut() {
    cloudRevision = null;
    pendingState = null;
    pendingResolvers.splice(0).forEach(({ reject }) => reject(new Error('Sessão encerrada.')));
    clearTimeout(saveTimer);
    saveTimer = null;
    await supabaseSignOut();
  },

  async getAppState() {
    const bootstrap = await supabaseRpc('easy_train_get_my_bootstrap');
    const profile = bootstrap?.profile || {};
    cloudRevision = Number.isFinite(Number(bootstrap?.state_revision)) ? Number(bootstrap.state_revision) : null;
    const rawState = bootstrap?.state || {};
    const normalized = mergeState(rawState, profile);
    if (JSON.stringify(rawState) !== JSON.stringify(normalized)) await writeCloudState(normalized);
    return normalized;
  },

  async saveAppState(state) {
    pendingState = clone(state);
    return new Promise((resolve, reject) => {
      pendingResolvers.push({ resolve, reject });
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushPendingSave, SAVE_DEBOUNCE_MS);
    });
  },

  sanitizePlan(plan) { return normalizePlan(plan); },

  discardPendingSaves(reason = 'Alterações locais descartadas.') {
    pendingState = null;
    clearTimeout(saveTimer);
    saveTimer = null;
    pendingResolvers.splice(0).forEach(({ reject }) => reject(new Error(reason)));
  },

  async flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    return flushPendingSave();
  },

  async updateProfile({ displayName, username, bio = '', discoverable = true }) {
    return supabaseRpc('easy_train_update_my_profile', {
      p_display_name: neutralText(displayName, 80, { trim: true }),
      p_username: neutralText(username, 24, { trim: true }).toLowerCase(),
      p_bio: neutralText(bio, 180, { multiline: true, trim: true }),
      p_discoverable: Boolean(discoverable),
    });
  },

  async searchPeople(query) {
    return supabaseRpc('easy_train_search_people', { p_query: neutralText(query, 30, { trim: true }) });
  },
  async getCollabDashboard() { return supabaseRpc('easy_train_get_collab_dashboard'); },
  async sendCollabRequest(targetUserId) {
    return supabaseRpc('easy_train_send_collab_request', { p_target_user: targetUserId });
  },
  async respondCollabRequest(requestId, accept) {
    return supabaseRpc('easy_train_respond_collab_request', {
      p_request_id: requestId,
      p_accept: Boolean(accept),
    });
  },
  async sharePlan(targetUserId, plan, title) {
    return supabaseRpc('easy_train_share_plan', {
      p_target_user: targetUserId,
      p_plan: normalizePlan(plan),
      p_title: neutralText(title, 100, { trim: true }),
    });
  },
  async markShareImported(shareId) {
    return supabaseRpc('easy_train_mark_share_imported', { p_share_id: shareId });
  },
  async getCompetitions() { return supabaseRpc('easy_train_get_competitions'); },
  async createCompetition(data) {
    return supabaseRpc('easy_train_create_competition', {
      p_title: neutralText(data.title, 80, { trim: true }),
      p_description: neutralText(data.description || '', 240, { multiline: true, trim: true }),
      p_metric: data.metric,
      p_start_date: data.startDate,
      p_end_date: data.endDate,
      p_invite_user_ids: data.inviteUserIds || [],
    });
  },
  async joinCompetition(code) {
    return supabaseRpc('easy_train_join_competition', {
      p_code: neutralText(code, 10, { trim: true }).toUpperCase(),
    });
  },
  async respondCompetition(competitionId, accept) {
    return supabaseRpc('easy_train_respond_competition', {
      p_competition_id: competitionId,
      p_accept: Boolean(accept),
    });
  },
};
