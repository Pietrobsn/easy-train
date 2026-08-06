import { repository } from './repository.js';

const app = document.querySelector('#app');

let state;
let authSession = null;
let authMode = 'login';
let authMessage = '';
let collabState = { loading: false, error: '', dashboard: null, searchResults: [] };
let competitionState = { loading: false, error: '', items: [] };
let view = { name: 'home', workoutId: null, exerciseId: null, sessionId: null };
let workoutSearch = '';
let workoutFilter = 'all';
let historyFilter = 'all';
let planDraft = null;
let lastSummary = null;
let toastTimeout;
let wakeLock = null;
let deferredInstallPrompt = null;
let appInstalledThisSession = false;
let restOverlayDismissed = false;
let onboardingStep = 0;
let confirmResolver = null;
let cloudView = { loading: true, error: '' };
let lastSyncErrorAt = 0;
let runtimeBound = false;
let timerInterval = null;
let conflictPromptOpen = false;
let workoutSearchFrame = null;

const EXERCISE_SUGGESTIONS = [
  'Supino reto com barra', 'Supino inclinado com halteres', 'Crossover', 'Crucifixo máquina',
  'Puxada alta', 'Barra fixa assistida', 'Remada baixa', 'Remada curvada', 'Remada cavalinho',
  'Agachamento livre', 'Hack Squat', 'Leg Press', 'Cadeira extensora', 'Mesa flexora',
  'Cadeira flexora', 'Cadeira adutora', 'Cadeira abdutora', 'Panturrilha sentado',
  'Elevação lateral', 'Desenvolvimento com halteres', 'Fly inverso', 'Tríceps na polia',
  'Tríceps francês', 'Rosca direta', 'Rosca martelo', 'Abdominal máquina', 'Prancha',
];

const WORKOUT_PRESETS = [
  { id: 'legs', label: 'Pernas', icon: '🦵', accent: 'green', focus: 'legs', title: 'Pernas completas' },
  { id: 'chest', label: 'Peito', icon: '💥', accent: 'red', focus: 'chest', title: 'Peito e tríceps' },
  { id: 'back', label: 'Costas', icon: '🪽', accent: 'blue', focus: 'back', title: 'Costas e bíceps' },
  { id: 'arms', label: 'Braços', icon: '💪', accent: 'yellow', focus: 'arms', title: 'Braços completos' },
  { id: 'shoulders', label: 'Ombros', icon: '🧥', accent: 'blue', focus: 'shoulders', title: 'Ombros' },
  { id: 'core', label: 'Abdômen', icon: '🧱', accent: 'yellow', focus: 'core', title: 'Core e abdômen' },
  { id: 'cardio', label: 'Cardio', icon: '🏃', accent: 'red', focus: 'cardio', title: 'Cardio e condicionamento' },
  { id: 'full', label: 'Full body', icon: '🏋️', accent: 'yellow', focus: 'full', title: 'Corpo inteiro' },
];

const WORKOUT_EMOJI_PRESETS = [
  '🏋️', '🔥', '⚡', '💪', '🦵', '💥', '🪽', '🧥', '🧱', '🏃', '🚴', '🥊', '🏆', '😈', '🦍', '🐺',
];

const THEME_STORAGE_KEY = 'easy-train-theme-v2';
const ALLOWED_THEMES = new Set(['dark', 'light', 'system']);
let themePreference = ALLOWED_THEMES.has(localStorage.getItem(THEME_STORAGE_KEY))
  ? localStorage.getItem(THEME_STORAGE_KEY)
  : 'system';

const THEME_OPTIONS = [
  { value: 'system', icon: '◐', label: 'Sistema', detail: 'Segue o aparelho' },
  { value: 'light', icon: '☀', label: 'Claro', detail: 'Mais leve e aberto' },
  { value: 'dark', icon: '☾', label: 'Escuro', detail: 'Confortável à noite' },
];

function resolvedTheme(theme = themePreference) {
  if (theme === 'system') return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  return theme === 'light' ? 'light' : 'dark';
}

function applyTheme(theme = themePreference, { persistLocal = true } = {}) {
  themePreference = ALLOWED_THEMES.has(theme) ? theme : 'system';
  if (persistLocal) localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  const resolved = resolvedTheme(themePreference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = themePreference;
  document.documentElement.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f3f6f8' : '#071018');
}

function currentThemePreference() {
  return state?.preferences?.theme || themePreference || 'system';
}

function themeMeta(theme = currentThemePreference()) {
  return THEME_OPTIONS.find((option) => option.value === theme) || THEME_OPTIONS[0];
}

function renderThemeSelector(className = '') {
  const active = currentThemePreference();
  return `<div class="theme-selector ${className}" role="group" aria-label="Tema do aplicativo">${THEME_OPTIONS.map((option) => `
    <button class="theme-option ${active === option.value ? 'active' : ''}" data-action="set-theme" data-theme-value="${option.value}" aria-pressed="${active === option.value}">
      <span>${option.icon}</span><b>${option.label}</b><small>${option.detail}</small>
      <i class="theme-preview theme-preview-${option.value}" aria-hidden="true"><u></u><u></u><u></u></i>
    </button>`).join('')}</div>`;
}

function nextThemePreference() {
  const order = ['system', 'light', 'dark'];
  return order[(order.indexOf(currentThemePreference()) + 1) % order.length];
}

applyTheme(themePreference, { persistLocal: false });

const pad = (value) => String(value).padStart(2, '0');
function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const todayKey = () => localDateKey();

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDuration(totalSeconds = 0, compact = false) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  if (compact && hours > 0) return `${hours}h${pad(minutes)}min`;
  if (compact) return `${minutes}min`;
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(remainder)}`
    : `${pad(minutes)}:${pad(remainder)}`;
}

function elapsedBetween(start, end = null) {
  if (!start) return 0;
  const endTime = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, Math.floor((endTime - new Date(start).getTime()) / 1000));
}

function activeElapsed(start, end = null, pausedSeconds = 0, pausedAt = null) {
  if (!start) return 0;
  const endTime = end
    ? new Date(end).getTime()
    : pausedAt
      ? new Date(pausedAt).getTime()
      : Date.now();
  return Math.max(0, Math.floor((endTime - new Date(start).getTime()) / 1000) - (Number(pausedSeconds) || 0));
}

function sessionElapsed(session) {
  if (!session) return 0;
  return activeElapsed(session.startedAt, session.completedAt, session.pausedSeconds, session.pausedAt);
}

function exerciseElapsed(exerciseState) {
  if (!exerciseState) return 0;
  return activeElapsed(
    exerciseState.startedAt,
    exerciseState.completedAt,
    exerciseState.pausedSeconds,
    exerciseState.pausedAt,
  );
}

function isSessionPaused(session = state?.activeSession) {
  return Boolean(session?.pausedAt);
}

function formatDate(dateString, options = { day: '2-digit', month: 'short' }) {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('pt-BR', options).format(new Date(`${dateString.slice(0, 10)}T12:00:00`));
}

function getWorkout(workoutId) {
  return state.workoutPlan.days.find((workout) => workout.id === workoutId);
}

function getExercise(workout, exerciseId) {
  return workout?.exercises.find((exercise) => exercise.id === exerciseId);
}

function getExerciseName(exerciseId) {
  for (const workout of state.workoutPlan.days) {
    const exercise = getExercise(workout, exerciseId);
    if (exercise) return exercise.name;
  }
  const namedHistory = (state.exerciseHistory?.[exerciseId] || []).find((record) => record.name);
  if (namedHistory?.name) return namedHistory.name;
  for (const session of state.sessions || []) {
    const snapshotExercise = session.snapshot?.exercises?.find((exercise) => exercise.id === exerciseId);
    if (snapshotExercise?.name) return snapshotExercise.name;
  }
  return 'Exercício';
}

function getSessionWorkout(session) {
  const current = getWorkout(session?.workoutId);
  return {
    title: session?.snapshot?.workoutTitle || current?.title || session?.summary?.workoutTitle || 'Treino',
    icon: session?.snapshot?.workoutIcon || current?.icon || '🏋️',
    accent: session?.snapshot?.workoutAccent || current?.accent || 'yellow',
    exercises: session?.snapshot?.exercises || current?.exercises || [],
  };
}

function safeId(prefix = 'item') {
  const value = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function getActiveSession(workoutId = null) {
  if (!state.activeSession) return null;
  if (workoutId && state.activeSession.workoutId !== workoutId) return null;
  return state.activeSession;
}

function createExerciseState(exercise) {
  return {
    startedAt: null,
    completedAt: null,
    pausedAt: null,
    pausedSeconds: 0,
    restUntil: null,
    restRemainingSeconds: 0,
    notes: '',
    prCelebrated: 0,
    sets: Array.from({ length: exercise.sets }, () => ({ weight: '', reps: '', done: false })),
  };
}

function createSession(workout) {
  return {
    id: crypto.randomUUID(),
    workoutId: workout.id,
    startedAt: new Date().toISOString(),
    completedAt: null,
    localDate: todayKey(),
    pausedAt: null,
    pausedSeconds: 0,
    snapshot: {
      workoutTitle: workout.title,
      workoutIcon: workout.icon,
      workoutAccent: workout.accent,
      exercises: workout.exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        sets: exercise.sets,
        minReps: exercise.minReps,
        maxReps: exercise.maxReps,
        restSeconds: exercise.restSeconds,
      })),
    },
    exercises: Object.fromEntries(
      workout.exercises.map((exercise) => [exercise.id, createExerciseState(exercise)]),
    ),
  };
}

async function persist() {
  try {
    await repository.saveAppState(state);
    return true;
  } catch (error) {
    const conflict = error?.hint === 'STATE_CONFLICT' || error?.code === '40001'
      || String(error?.message || '').includes('outro dispositivo');
    if (conflict && !conflictPromptOpen) {
      conflictPromptOpen = true;
      const reload = await askConfirm({
        title: 'Dados atualizados em outro dispositivo',
        message: 'Recarregue a versão mais recente antes de continuar para não sobrescrever alterações.',
        confirmText: 'Recarregar agora',
        cancelText: 'Agora não',
      });
      conflictPromptOpen = false;
      if (reload) {
        repository.discardPendingSaves('Recarregando a versão mais recente.');
        await bootstrap();
      } else {
        showToast('As alterações desta tela ainda não foram salvas. Recarregue antes de continuar.', 'warning');
      }
      return false;
    }
    const now = Date.now();
    if (now - lastSyncErrorAt > 2500) {
      lastSyncErrorAt = now;
      showToast(error?.message || 'Não foi possível sincronizar os dados.', 'warning');
    }
    return false;
  }
}


// Salva em segundo plano para que a interface responda imediatamente.
// A camada repository agrupa mudanças próximas e mantém a proteção de conflito.
function queuePersist() {
  void persist();
}

function showToast(message, type = 'default') {
  document.querySelector('.toast')?.remove();
  const element = document.createElement('div');
  element.className = `toast ${type}`;
  element.setAttribute('role', type === 'warning' ? 'alert' : 'status');
  element.setAttribute('aria-live', type === 'warning' ? 'assertive' : 'polite');
  element.textContent = message;
  document.body.appendChild(element);
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => element.remove(), 2800);
}

function askConfirm({ title, message, confirmText = 'Confirmar', cancelText = 'Voltar', danger = false }) {
  document.querySelector('.confirm-overlay')?.remove();
  return new Promise((resolve) => {
    confirmResolver = resolve;
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <span class="confirm-icon">${danger ? '!' : '?'}</span>
        <h2 id="confirm-title">${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button class="secondary-btn" data-confirm-choice="cancel">${escapeHtml(cancelText)}</button>
          <button class="${danger ? 'danger-btn' : 'primary-btn'}" data-confirm-choice="confirm">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-confirm-choice="cancel"]')?.focus();
  });
}

function closeConfirm(choice) {
  const resolver = confirmResolver;
  confirmResolver = null;
  document.querySelector('.confirm-overlay')?.remove();
  resolver?.(choice === 'confirm');
}


function renderAuth() {
  const registering = authMode === 'register';
  const resetting = authMode === 'reset';
  const recovering = authMode === 'recovery';
  const rememberedEmail = repository.getRememberedEmail?.() || '';
  const rememberLogin = repository.getRememberLogin?.() !== false;
  const title = recovering
    ? 'Crie uma nova senha'
    : resetting
      ? 'Recupere sua conta'
      : registering
        ? 'Crie sua conta'
        : 'Entre para treinar';
  const description = recovering
    ? 'Use uma senha nova e exclusiva para proteger seus treinos.'
    : resetting
      ? 'Enviaremos um link seguro para o seu e-mail.'
      : registering
        ? 'Monte seus treinos, treine com amigos e dispute rankings.'
        : 'Seus treinos, collabs e competições em um só lugar.';

  return `
    <main class="auth-shell social-auth-shell">
      <section class="auth-card social-auth-card page-enter">
        <div class="auth-brand">
          <img src="/icon-192.png" width="88" height="88" alt="Ícone do Easy Train">
          <span class="eyebrow">EASY TRAIN</span>
          <h1>${title}</h1>
          <p>${description}</p>
        </div>
        <div class="auth-theme-panel">
          <div class="auth-theme-heading"><span>◐</span><div><strong>Aparência</strong><small>Começa seguindo o tema do aparelho. Troque quando quiser.</small></div></div>
          ${renderThemeSelector('auth-theme-selector')}
        </div>
        ${!resetting && !recovering ? `
          <div class="auth-tabs" role="tablist">
            <button role="tab" aria-selected="${!registering}" class="${!registering ? 'active' : ''}" data-action="auth-login-mode">Entrar</button>
            <button role="tab" aria-selected="${registering}" class="${registering ? 'active' : ''}" data-action="auth-register-mode">Criar conta</button>
          </div>
        ` : ''}
        ${authMessage ? `<div class="auth-message">${escapeHtml(authMessage)}</div>` : ''}
        <form id="auth-form" class="auth-form" data-mode="${recovering ? 'recovery' : resetting ? 'reset' : registering ? 'register' : 'login'}">
          ${registering ? `
            <label>Seu nome<input name="displayName" maxlength="80" required autocomplete="name" placeholder="Ex.: Alex"></label>
            <label>Seu @usuário<div class="username-input"><span>@</span><input name="username" minlength="3" maxlength="24" required autocomplete="username" pattern="[A-Za-z0-9_]+" placeholder="pietro"></div></label>
          ` : ''}
          ${!recovering ? `<label>E-mail<input name="email" type="email" required autocomplete="email" value="${escapeHtml(rememberedEmail)}" placeholder="voce@email.com"></label>` : ''}
          ${!resetting ? `<label>${recovering ? 'Nova senha' : 'Senha'}<input name="password" type="password" minlength="6" required autocomplete="${registering || recovering ? 'new-password' : 'current-password'}" placeholder="Mínimo de 6 caracteres"></label>` : ''}
          ${registering || recovering ? '<label>Confirmar senha<input name="confirmPassword" type="password" minlength="6" required autocomplete="new-password" placeholder="Digite novamente"></label>' : ''}
          ${!registering && !resetting && !recovering ? `<label class="remember-login-row"><input name="rememberLogin" type="checkbox" ${rememberLogin ? 'checked' : ''}><span><b>Lembrar meu login</b><small>Permanece conectado neste aparelho. Desative em dispositivo compartilhado.</small></span></label>` : ''}
          <button class="primary-btn full" type="submit">${recovering ? 'Salvar nova senha' : resetting ? 'Enviar link de recuperação' : registering ? 'Criar minha conta' : 'Entrar no Easy Train'}</button>
        </form>
        ${resetting || recovering
          ? '<button class="auth-link-btn" data-action="auth-login-mode">← Voltar para entrar</button>'
          : !registering
            ? '<button class="auth-link-btn" data-action="auth-reset-mode">Esqueci minha senha</button>'
            : ''}
        <div class="auth-social-preview">
          <span>🤝 Collabs</span><span>🏆 Competições</span><span>✍️ Treinos próprios</span>
        </div>
        ${!isStandaloneApp() ? `<button class="auth-install-btn" type="button" data-action="install-app">＋ ${installActionLabel()}</button>` : ''}
      </section>
    </main>
  `;
}

function renderCloudLoading() {
  return `
    <main class="auth-shell">
      <section class="auth-card auth-loading-card" aria-live="polite">
        <img src="/icon-192.png" width="84" height="84" alt="">
        <span class="eyebrow">EASY TRAIN</span>
        <h1>Carregando seus treinos</h1>
        <div class="auth-spinner" aria-hidden="true"></div>
        <p>Sincronizando sua conta e seus treinos...</p>
      </section>
    </main>
  `;
}

function renderConnectionError() {
  return `
    <main class="auth-shell">
      <section class="auth-card page-enter" role="alert">
        <div class="auth-brand">
          <img src="/icon-192.png" width="88" height="88" alt="Ícone do Easy Train">
          <span class="eyebrow">EASY TRAIN</span>
          <h1>Não foi possível conectar</h1>
          <p>${escapeHtml(cloudView.error || 'Confira sua internet e tente novamente.')}</p>
        </div>
        <button class="primary-btn full" data-action="retry-cloud">Tentar novamente</button>
        <div class="auth-online-note"><span>☁</span><p>O Easy Train precisa de internet para carregar e salvar os treinos.</p></div>
      </section>
    </main>
  `;
}

function renderOnboarding() {
  const slides = [
    {
      icon: '🏋️',
      eyebrow: 'TREINO ORGANIZADO',
      title: 'Seu treino inteiro no bolso',
      text: 'Veja os dias cadastrados, siga a ordem dos exercícios e registre cada série sem se perder.',
      detail: 'Treinos organizados por dia e grupo muscular',
    },
    {
      icon: '⏱️',
      eyebrow: 'FOCO NA EXECUÇÃO',
      title: 'Cronômetros que trabalham por você',
      text: 'Tempo total, tempo do exercício e descanso automático. Você também pode pausar tudo sem perder o controle.',
      detail: 'Descanso ajustável · tela ativa · retomada automática',
    },
    {
      icon: '📈',
      eyebrow: 'EVOLUÇÃO REAL',
      title: 'Carga, PR e ofensiva registrados',
      text: 'Acompanhe a linha de evolução, recordes pessoais, volume total e frequência de treino.',
      detail: 'Histórico completo de cargas, recordes e frequência',
    },
  ];
  const slide = slides[onboardingStep] || slides[0];
  return `
    <main class="app-shell onboarding-shell">
      <section class="onboarding-page page-enter">
        <div class="onboarding-brand"><span>⚡</span><b>EASY TRAIN</b></div>
        <div class="onboarding-visual"><span>${slide.icon}</span><i></i><i></i><i></i></div>
        <div class="onboarding-copy">
          <span class="eyebrow">${slide.eyebrow}</span>
          <h1>${slide.title}</h1>
          <p>${slide.text}</p>
          <small>${slide.detail}</small>
        </div>
        <div class="onboarding-dots">${slides.map((_, index) => `<i class="${index === onboardingStep ? 'active' : ''}"></i>`).join('')}</div>
        <div class="onboarding-actions">
          <button class="text-btn" data-action="skip-onboarding">Pular apresentação</button>
          <button class="primary-btn" data-action="next-onboarding">${onboardingStep === slides.length - 1 ? 'Começar agora' : 'Continuar'} →</button>
        </div>
      </section>
    </main>
  `;
}

function playTone(kind = 'set') {
  if (!state?.preferences?.soundEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const notes = kind === 'pr' ? [523, 659, 784] : kind === 'rest' ? [740, 880] : [520];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === 'pr' ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + index * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.11 + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + index * 0.11);
      oscillator.stop(context.currentTime + index * 0.11 + 0.18);
    });
    setTimeout(() => context.close(), 700);
  } catch {
    // Som é apenas um aprimoramento; o treino continua normalmente sem ele.
  }
}

function showPRCelebration(exerciseName, weight) {
  document.querySelector('.pr-celebration')?.remove();
  const element = document.createElement('div');
  element.className = 'pr-celebration';
  element.innerHTML = `
    <div class="pr-celebration-card">
      <button aria-label="Fechar" data-close-pr>×</button>
      <span class="pr-crown">🏆</span>
      <small>NOVO RECORDE PESSOAL</small>
      <strong>${escapeHtml(weight)} kg</strong>
      <p>${escapeHtml(exerciseName)}</p>
      <em>Você está mais forte que no último treino.</em>
    </div>
  `;
  document.body.appendChild(element);
  const close = () => element.remove();
  element.addEventListener('click', (event) => {
    if (event.target === element || event.target.closest('[data-close-pr]')) close();
  });
  setTimeout(close, 3300);
}

async function requestWakeLock() {
  if (!state?.preferences?.keepAwakeEnabled || !state?.activeSession || isSessionPaused() || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    wakeLock = null;
  }
}

async function releaseWakeLock() {
  try { await wakeLock?.release(); } catch { /* sem impacto no treino */ }
  wakeLock = null;
}

function getWeeklyProgress() {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const mondayOffset = (now.getDay() + 6) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const completedDays = uniqueActivityDates().filter((date) => {
    const value = new Date(`${date}T12:00:00`);
    return value >= start && value <= end;
  }).length;
  const goal = Math.max(1, Number(state.workoutPlan.weeklyGoal) || state.workoutPlan.days.length || 1);
  return { completed: completedDays, goal, percent: Math.min(100, Math.round((completedDays / goal) * 100)) };
}

function uniqueActivityDates() {
  const fromSessions = state.sessions
    .filter((session) => session.completedAt)
    .map((session) => session.localDate || session.completedAt.slice(0, 10));
  return [...new Set([...(state.activityDates || []), ...fromSessions])].sort();
}

function calculateStreaks() {
  const dates = uniqueActivityDates();
  if (!dates.length) return { current: 0, best: 0 };

  const timestamps = dates.map((date) => new Date(`${date}T12:00:00`).getTime());
  let best = 1;
  let running = 1;
  for (let index = 1; index < timestamps.length; index += 1) {
    const difference = Math.round((timestamps[index] - timestamps[index - 1]) / 86400000);
    running = difference === 1 ? running + 1 : 1;
    best = Math.max(best, running);
  }

  const latest = timestamps.at(-1);
  const currentDay = new Date();
  currentDay.setHours(12, 0, 0, 0);
  const gap = Math.round((currentDay.getTime() - latest) / 86400000);

  let current = gap <= 1 ? 1 : 0;
  if (current) {
    for (let index = timestamps.length - 1; index > 0; index -= 1) {
      const difference = Math.round((timestamps[index] - timestamps[index - 1]) / 86400000);
      if (difference !== 1) break;
      current += 1;
    }
  }

  return { current, best };
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function inferWorkoutFocus(workout) {
  if (workout?.focus && workout.focus !== 'auto') return workout.focus;
  const text = normalizeText([workout?.title, workout?.shortTitle, ...(workout?.exercises || []).map((exercise) => exercise.name)].join(' '));
  const groups = [
    ['legs', ['perna', 'agach', 'leg press', 'extensora', 'flexora', 'adutora', 'abdutora', 'panturrilha', 'glute']],
    ['back', ['costas', 'remada', 'puxada', 'barra fixa', 'latissimo']],
    ['chest', ['peito', 'supino', 'crucifixo', 'crossover']],
    ['shoulders', ['ombro', 'elevacao lateral', 'desenvolvimento', 'fly inverso']],
    ['arms', ['biceps', 'triceps', 'rosca']],
    ['core', ['abdomen', 'abdominal', 'prancha', 'core']],
    ['cardio', ['cardio', 'corrida', 'esteira', 'bike', 'bicicleta', 'eliptico', 'aerobico']],
  ];
  const scored = groups.map(([focus, terms]) => ({
    focus,
    score: terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);
  return scored[0]?.score ? scored[0].focus : 'full';
}

function daysSince(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  date.setHours(12, 0, 0, 0);
  return Math.max(0, Math.floor((now - date) / 86400000));
}

function getCoachInsight() {
  if (!state?.workoutPlan?.days?.length) return null;
  if (!state?.preferences?.funnyCoachEnabled) return null;
  if (state.preferences.coachDismissedDate === todayKey()) return null;
  if (state.activeSession) return null;

  const completed = (state.sessions || []).filter((session) => session.completedAt);
  const planStartDays = daysSince(`${state.workoutPlan.startsAt || todayKey()}T12:00:00`);
  const candidates = (state.workoutPlan.days || []).map((workout) => {
    const sessions = completed
      .filter((session) => session.workoutId === workout.id)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    const last = sessions[0]?.completedAt || null;
    const gap = last ? daysSince(last) : planStartDays;
    const otherSessionsAfter = completed.filter((session) => (
      session.workoutId !== workout.id
      && (!last || new Date(session.completedAt) > new Date(last))
    )).length;
    return { workout, focus: inferWorkoutFocus(workout), gap, otherSessionsAfter, neverDone: !last };
  });

  const overdue = candidates
    .filter((item) => item.gap >= 8 || item.otherSessionsAfter >= 2)
    .sort((a, b) => {
      const aLeg = a.focus === 'legs' ? 8 : 0;
      const bLeg = b.focus === 'legs' ? 8 : 0;
      return (b.gap + b.otherSessionsAfter * 2 + bLeg) - (a.gap + a.otherSessionsAfter * 2 + aLeg);
    })[0];

  if (!overdue) return null;
  const daysText = overdue.neverDone
    ? 'ainda não apareceu nesta ficha'
    : `está há ${overdue.gap} dia${overdue.gap === 1 ? '' : 's'} sem acontecer`;
  const common = { workoutId: overdue.workout.id, button: `Treinar ${overdue.workout.shortTitle || overdue.workout.title}` };

  if (overdue.focus === 'legs') {
    return {
      ...common,
      tone: 'legs', icon: '🍦', eyebrow: 'ALERTA DE BASE',
      title: 'Quer virar um cone de sorvete?',
      text: `O shape em V precisa de uma base, meu nobre. O treino de pernas ${daysText}.`,
    };
  }
  if (overdue.focus === 'back') return { ...common, tone: 'back', icon: '🪽', eyebrow: 'CADÊ AS COSTAS?', title: 'A camiseta não vai preencher sozinha.', text: `Seu treino de costas ${daysText}. Bora abrir essas asas.` };
  if (overdue.focus === 'chest') return { ...common, tone: 'chest', icon: '🕵️', eyebrow: 'SUPINO DESAPARECIDO', title: 'O peito já pediu boletim de ocorrência.', text: `Esse treino ${daysText}. Hora de reaparecer no banco.` };
  if (overdue.focus === 'shoulders') return { ...common, tone: 'shoulders', icon: '🧥', eyebrow: 'CABIDE EM MANUTENÇÃO', title: 'Sem ombro, a camiseta fica sem estrutura.', text: `O treino de ombros ${daysText}. Vamos resolver isso.` };
  if (overdue.focus === 'arms') return { ...common, tone: 'arms', icon: '💪', eyebrow: 'MANGA VAZIA', title: 'As mangas estão cobrando aluguel.', text: `O treino de braços ${daysText}. Bora pagar essa dívida.` };
  if (overdue.focus === 'cardio') return { ...common, tone: 'cardio', icon: '🫁', eyebrow: 'FÔLEGO EM MODO AVIÃO', title: 'Subiu uma escada e o pulmão pediu férias?', text: `O cardio ${daysText}. Bora recuperar esse condicionamento.` };
  return { ...common, tone: 'full', icon: '👀', eyebrow: 'O COACH TÁ DE OLHO', title: 'Esse treino está sumido do mapa.', text: `${overdue.workout.title} ${daysText}. Melhor resolver antes que vire lenda.` };
}

function renderCoachCard() {
  const insight = getCoachInsight();
  if (!insight) return '';
  return `
    <article class="coach-nudge ${insight.tone}">
      <button class="coach-dismiss" data-action="dismiss-coach" aria-label="Ocultar mensagem hoje">×</button>
      <span class="coach-icon">${escapeHtml(insight.icon)}</span>
      <div class="coach-copy"><small>${escapeHtml(insight.eyebrow)}</small><strong>${escapeHtml(insight.title)}</strong><p>${escapeHtml(insight.text)}</p></div>
      <button class="coach-action" data-action="open-workout" data-workout-id="${escapeHtml(insight.workoutId)}">${escapeHtml(insight.button)} <b>›</b></button>
    </article>
  `;
}

function workoutProgress(workout, session = getActiveSession(workout.id)) {
  const total = workout.exercises.length;
  if (!session || total === 0) return { completed: 0, total, percent: 0 };
  const completed = workout.exercises.filter(
    (exercise) => session.exercises[exercise.id]?.completedAt,
  ).length;
  return {
    completed,
    total,
    percent: Math.round((completed / total) * 100),
  };
}

function workoutStatus(workout) {
  const active = getActiveSession(workout.id);
  if (active) {
    const progress = workoutProgress(workout, active);
    return progress.percent === 100
      ? { label: 'Pronto para finalizar', className: 'done' }
      : { label: 'Em andamento', className: 'progress' };
  }

  const completedToday = state.sessions.some((session) => (
    session.workoutId === workout.id
    && (session.localDate || session.completedAt?.slice(0, 10)) === todayKey()
  ));

  return completedToday
    ? { label: 'Concluído hoje', className: 'done' }
    : { label: 'Não iniciado', className: 'pending' };
}

function calculatePR(history = []) {
  return history.reduce((highest, record) => Math.max(highest, Number(record.weight) || 0), 0);
}

function calculateSessionVolume(session) {
  return Object.values(session.exercises || {})
    .flatMap((exerciseState) => exerciseState.sets || [])
    .filter((set) => set.done)
    .reduce((sum, set) => sum + (Number(set.weight) * Number(set.reps)), 0);
}

function allHistoryRecords() {
  return Object.entries(state.exerciseHistory || {}).flatMap(([exerciseId, records]) => (
    records.map((record) => ({ ...record, exerciseId }))
  ));
}


function navIcon(name) {
  const icons = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5H15v-6H9v6H3.5a.5.5 0 0 1-.5-.5z"/></svg>',
    evolution: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16M7 15l4-4 3 2 5-6"/><path d="M16 7h3v3"/></svg>',
    streak: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2.7c.4 3-1.4 4.4-3 6.1-1.6 1.7-2.8 3.3-2.8 5.7A5 5 0 0 0 12.5 20c3.1 0 5.5-2.3 5.5-5.5 0-2.7-1.5-5.1-4.8-7.4.2 2.4-.7 3.6-1.8 4.7.2-2.5-1-5.1 1.8-9.1Z"/></svg>',
    workouts: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/></svg>',
    collab: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M13.5 15.5c.8-.7 1.9-1 3.3-1 2.8 0 4.3 1.7 4.7 5.5"/></svg>',
    competition: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v4c0 3-1.8 5-4 5s-4-2-4-5zM9 13v3M15 13v3M7 20h10M4 5H2v2c0 2.2 1.4 4 4 4M20 5h2v2c0 2.2-1.4 4-4 4"/></svg>',
    profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.5-4.2 3-6.5 7.5-6.5s7 2.3 7.5 6.5"/></svg>',
  };
  return `<span class="nav-icon">${icons[name] || icons.home}</span>`;
}

function isStandaloneApp() {
  return Boolean(
    appInstalledThisSession
    || window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true
  );
}

function getInstallPlatform() {
  const userAgent = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

function installActionLabel() {
  if (isStandaloneApp()) return 'Aplicativo adicionado';
  const platform = getInstallPlatform();
  if (platform === 'ios') return 'Ver passo a passo';
  if (platform === 'android' && deferredInstallPrompt) return 'Instalar no Android';
  if (deferredInstallPrompt) return 'Instalar agora';
  return 'Ver como instalar';
}

function installCardDescription() {
  const platform = getInstallPlatform();
  if (platform === 'ios') return 'No Safari, use o botão Compartilhar da barra inferior e escolha “Adicionar à Tela de Início”.';
  if (platform === 'android' && deferredInstallPrompt) return 'Toque no botão e confirme. O Android adicionará o Easy Train como aplicativo.';
  if (platform === 'android') return 'Abra as instruções para instalar pelo menu do navegador.';
  return 'Acesse com um toque, em uma janela própria e com o ícone do Easy Train.';
}

function renderInstallCard() {
  if (isStandaloneApp()) return '';
  return `
    <section class="app-install-card" aria-label="Adicionar aplicativo à tela inicial">
      <img src="/icon-192.png" width="64" height="64" alt="" aria-hidden="true">
      <div class="app-install-copy">
        <span class="eyebrow">ACESSO RÁPIDO</span>
        <strong>Adicione o Easy Train à tela inicial</strong>
        <p>${installCardDescription()}</p>
      </div>
      <button class="install-action-btn" data-action="install-app">${installActionLabel()}</button>
    </section>
  `;
}

function closeInstallGuide() {
  document.querySelector('.install-guide-overlay')?.remove();
}

function showInstallGuide() {
  closeInstallGuide();
  const platform = getInstallPlatform();
  const content = platform === 'ios'
    ? {
        title: 'Adicionar no iPhone ou iPad',
        intro: 'Abra o Easy Train no Safari. O botão Compartilhar fica no meio da barra inferior.',
        steps: [
          ['1', 'Toque no botão azul Compartilhar', 'É o botão do meio na parte de baixo: um quadrado com uma seta apontando para cima.'],
          ['2', 'Desça a lista de ações', 'Toque em “Adicionar à Tela de Início”.'],
          ['3', 'Confirme em “Adicionar”', 'O ícone do Easy Train aparecerá na tela inicial do iPhone.'],
        ],
      }
    : platform === 'android'
      ? {
          title: 'Adicionar no Android',
          intro: 'Use o menu do navegador para instalar:',
          steps: [
            ['1', 'Abra o menu do navegador', 'Toque nos três pontos no canto da tela.'],
            ['2', 'Escolha “Instalar app”', 'Em alguns aparelhos aparece “Adicionar à tela inicial”.'],
            ['3', 'Confirme em “Instalar”', 'O Easy Train ficará disponível como um aplicativo.'],
          ],
        }
      : {
          title: 'Adicionar no computador',
          intro: 'Instale pelo navegador para abrir em uma janela própria:',
          steps: [
            ['1', 'Procure o ícone de instalação', 'Normalmente ele aparece no lado direito da barra de endereço.'],
            ['2', 'Ou abra o menu do navegador', 'Escolha “Instalar Easy Train” ou “Aplicativos”.'],
            ['3', 'Confirme a instalação', 'Um atalho será criado no computador.'],
          ],
        };

  const overlay = document.createElement('div');
  overlay.className = 'install-guide-overlay';
  overlay.innerHTML = `
    <div class="install-guide-card" role="dialog" aria-modal="true" aria-labelledby="install-guide-title">
      <button class="install-guide-close" data-close-install-guide aria-label="Fechar">×</button>
      <img class="install-guide-icon" src="/icon-192.png" width="82" height="82" alt="Ícone do Easy Train">
      <span class="eyebrow">EASY TRAIN</span>
      <h2 id="install-guide-title">${content.title}</h2>
      <p>${content.intro}</p>
      ${platform === 'ios' ? `
        <div class="ios-share-demo" aria-label="Exemplo do botão Compartilhar do Safari">
          <span>‹</span><span>›</span>
          <b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m0 0L8 7m4-4 4 4M5 11v8h14v-8"/></svg><small>BOTÃO DO MEIO</small></b>
          <span>▱</span><span>▣</span>
        </div>
      ` : ''}
      <div class="install-guide-steps">
        ${content.steps.map(([number, title, detail]) => `
          <div><b>${number}</b><span><strong>${title}</strong><small>${detail}</small></span></div>
        `).join('')}
      </div>
      <div class="install-online-note"><span>☁</span><p><strong>É necessário acesso à internet.</strong> A instalação cria um atalho e abre o Easy Train em uma janela própria.</p></div>
      <button class="primary-btn full" data-close-install-guide>Entendi</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.install-guide-close')?.focus();
}

function bottomNav(active = 'home') {
  return `
    <nav class="bottom-nav social-bottom-nav" aria-label="Navegação principal">
      <button class="nav-btn ${active === 'home' ? 'active' : ''}" data-action="go-home">${navIcon('home')}<span>Início</span></button>
      <button class="nav-btn ${active === 'workouts' ? 'active' : ''}" data-action="go-workouts">${navIcon('workouts')}<span>Treinos</span></button>
      <button class="nav-btn ${active === 'collab' ? 'active' : ''}" data-action="go-collab">${navIcon('collab')}<span>Collab</span></button>
      <button class="nav-btn ${active === 'competitions' ? 'active' : ''}" data-action="go-competitions">${navIcon('competition')}<span>Disputas</span></button>
      <button class="nav-btn ${active === 'profile' ? 'active' : ''}" data-action="go-profile">${navIcon('profile')}<span>Perfil</span></button>
    </nav>
  `;
}

function pageHeader({ title, subtitle = '', backAction = null, trailing = '' }) {
  return `
    <div class="topbar">
      ${backAction ? `<button class="icon-btn" data-action="${escapeHtml(backAction)}" aria-label="Voltar">←</button>` : '<span class="topbar-spacer"></span>'}
      <div class="topbar-title">
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
      </div>
      ${trailing || '<span class="topbar-spacer"></span>'}
    </div>
  `;
}

function renderCalendar({ large = false } = {}) {
  const current = new Date();
  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const previousMonthDays = new Date(year, month, 0).getDate();
  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(current)
    .replace(/^./, (letter) => letter.toUpperCase());

  const trainedDays = new Set(
    uniqueActivityDates()
      .map((date) => new Date(`${date}T12:00:00`))
      .filter((date) => date.getMonth() === month && date.getFullYear() === year)
      .map((date) => date.getDate()),
  );

  const cells = [];
  for (let index = firstDay - 1; index >= 0; index -= 1) {
    cells.push(`<span class="calendar-day outside">${previousMonthDays - index}</span>`);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const classes = ['calendar-day'];
    if (trainedDays.has(day)) classes.push('trained');
    if (day === current.getDate()) classes.push('today');
    cells.push(`<span class="${classes.join(' ')}">${day}</span>`);
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push(`<span class="calendar-day outside">${nextDay}</span>`);
    nextDay += 1;
  }

  return `
    <div class="card calendar-card ${large ? 'large' : ''}">
      <div class="calendar-head"><strong>${monthName}</strong><span class="muted">Treinos realizados</span></div>
      <div class="week-grid"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div>
      <div class="calendar-grid">${cells.join('')}</div>
      <div class="legend"><span class="trained">Treinado</span><span class="today">Hoje</span><span>Não treinado</span></div>
    </div>
  `;
}

function renderHome() {
  const completed = [...state.sessions].filter((session) => session.completedAt).sort((a, b) => (
    new Date(a.completedAt) - new Date(b.completedAt)
  ));
  const last = completed.at(-1);
  const streaks = calculateStreaks();
  const weekly = getWeeklyProgress();
  const active = state.activeSession;
  const activeWorkout = active ? getWorkout(active.workoutId) : null;
  const lastDuration = last
    ? formatDuration(sessionElapsed(last), true)
    : 'Ainda sem registro';

  return `
    <main class="app-shell">
      <section class="page page-enter">
        <div class="topbar home-topbar">
          <div>
            <span class="eyebrow">EASY TRAIN</span>
            <h1 class="hero-title">Olá, ${escapeHtml(state.student.name)}! 👋</h1>
            <p>Bora para mais um treino?</p>
          </div>
          <div class="home-topbar-actions">
            <button class="theme-quick-btn" data-action="cycle-theme" aria-label="Trocar tema. Atual: ${themeMeta().label}"><span>${themeMeta().icon}</span><small>${themeMeta().label}</small></button>
            <button class="avatar-btn" data-action="go-profile" aria-label="Abrir perfil">${escapeHtml(state.student.name).slice(0, 1).toUpperCase()}</button>
          </div>
        </div>

        ${activeWorkout ? `
          <button class="resume-card" data-action="open-workout" data-workout-id="${activeWorkout.id}">
            <span class="pulse-dot"></span>
            <span><small>Treino em andamento</small><strong>${escapeHtml(activeWorkout.title)}</strong><em>Continuar de onde parou</em></span>
            <b>›</b>
          </button>
        ` : ''}

        ${renderInstallCard()}
        ${renderCoachCard()}
        ${state.workoutPlan.days.length ? '' : `
          <section class="empty-plan-hero">
            <span>✍️</span>
            <div><small>COMECE DO SEU JEITO</small><strong>Monte seu primeiro treino</strong><p>Crie os dias, exercícios, séries e descansos pelo celular ou computador.</p></div>
            <button class="primary-btn" data-action="open-plan-editor">Criar ficha</button>
          </section>
        `}

        <div class="card summary-card">
          <div class="summary-icon">🏋️</div>
          <div>
            <span class="eyebrow">SEU RITMO</span>
            <div class="big-value">${streaks.current} dias 🔥</div>
            <div class="meta-row"><span>Último treino</span><b>${last ? formatDate(last.completedAt, { day: '2-digit', month: '2-digit' }) : state.student.lastWorkout}</b></div>
            <div class="meta-row"><span>Duração</span><b>${lastDuration}</b></div>
          </div>
        </div>

        <div class="home-grid">
          <button class="mini-dashboard-card" data-action="go-evolution"><span>↗</span><b>Evolução</b><small>Acompanhe suas cargas</small></button>
          <button class="mini-dashboard-card" data-action="go-streak"><span>🔥</span><b>Ofensiva</b><small>Recorde de ${streaks.best} dias</small></button>
        </div>
        <div class="home-social-grid">
          <button class="social-shortcut collab" data-action="go-collab"><span>🤝</span><div><b>Collabs</b><small>Treine com amigos</small></div><em>›</em></button>
          <button class="social-shortcut competition" data-action="go-competitions"><span>🏆</span><div><b>Competições</b><small>Suba no ranking</small></div><em>›</em></button>
        </div>

        <div class="card weekly-goal-card">
          <div class="weekly-ring" style="--weekly-progress:${weekly.percent * 3.6}deg"><span>${weekly.completed}/${weekly.goal}</span></div>
          <div><span class="eyebrow">META DA SEMANA</span><strong>${weekly.completed >= weekly.goal ? 'Meta concluída! 🔥' : `${weekly.goal - weekly.completed} treino${weekly.goal - weekly.completed === 1 ? '' : 's'} para fechar a semana`}</strong><p>${weekly.percent}% da meta semanal concluída</p></div>
        </div>

        <h2 class="section-title">Seu calendário</h2>
        ${renderCalendar()}

        <button class="primary-btn full home-cta" data-action="go-workouts">
          <span>Ver meus treinos</span><span>›</span>
        </button>

        <p class="storage-note">${state.workoutPlan.expiresAt ? `Plano válido até ${formatDate(state.workoutPlan.expiresAt, { day: '2-digit', month: '2-digit', year: 'numeric' })}` : 'Plano sem validade definida'}</p>
      </section>
      ${bottomNav('home')}
    </main>
  `;
}

function renderWorkoutList() {
  const streaks = calculateStreaks();
  const normalizedSearch = workoutSearch.trim().toLocaleLowerCase('pt-BR');
  const filteredDays = state.workoutPlan.days.filter((workout) => {
    const status = workoutStatus(workout);
    const matchesSearch = !normalizedSearch || [
      workout.title,
      workout.shortTitle,
      ...workout.exercises.map((exercise) => exercise.name),
    ].filter(Boolean).some((value) => value.toLocaleLowerCase('pt-BR').includes(normalizedSearch));
    const matchesFilter = workoutFilter === 'all' || status.className === workoutFilter;
    return matchesSearch && matchesFilter;
  });

  const cards = filteredDays.map((workout) => {
    const index = state.workoutPlan.days.findIndex((day) => day.id === workout.id);
    const status = workoutStatus(workout);
    const progress = workoutProgress(workout);
    return `
      <button class="workout-card ${escapeHtml(workout.accent)}" data-action="open-workout" data-workout-id="${escapeHtml(workout.id)}">
        <span class="workout-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="workout-icon">${escapeHtml(workout.icon)}</span>
        <span class="workout-copy">
          <span class="status ${status.className}">${status.label}</span>
          <h3>${escapeHtml(workout.title)}</h3>
          <span class="muted">${workout.exercises.length} exercícios · ~${formatDuration(workout.estimatedMinutes * 60, true)}</span>
          ${status.className === 'progress' ? `<span class="inline-progress"><i style="width:${progress.percent}%"></i></span>` : ''}
        </span>
        <span class="workout-arrow">›</span>
      </button>
    `;
  }).join('');

  return `
    <main class="app-shell">
      <section class="page page-enter">
        ${pageHeader({ title: 'Meus treinos', subtitle: 'Escolha o treino de hoje', backAction: 'go-home' })}
        <div class="plan-banner">
          <span><small>PLANO ATUAL</small><strong>${escapeHtml(state.workoutPlan.name)}</strong></span>
          <b>${state.workoutPlan.days.length} treino${state.workoutPlan.days.length === 1 ? '' : 's'}</b>
        </div>

        <label class="search-field">
          <span>⌕</span>
          <input id="workout-search" value="${escapeHtml(workoutSearch)}" placeholder="Buscar treino ou exercício" autocomplete="off">
          ${workoutSearch ? '<button type="button" data-action="clear-workout-search" aria-label="Limpar busca">×</button>' : ''}
        </label>
        <div class="filter-chips" aria-label="Filtrar treinos">
          ${[
            ['all', 'Todos'],
            ['pending', 'Pendentes'],
            ['progress', 'Em andamento'],
            ['done', 'Concluídos'],
          ].map(([value, label]) => `<button class="filter-chip ${workoutFilter === value ? 'active' : ''}" data-action="set-workout-filter" data-filter="${value}">${label}</button>`).join('')}
        </div>

        <div class="workout-stack">${cards || `
          <div class="card empty-search-state">
            <span>${state.workoutPlan.days.length ? '⌕' : '✍️'}</span><strong>${state.workoutPlan.days.length ? 'Nenhum treino encontrado' : 'Sua ficha ainda está vazia'}</strong>
            <p>${state.workoutPlan.days.length ? 'Tente outro nome ou remova os filtros aplicados.' : 'Monte os seus dias de treino e eles aparecerão aqui.'}</p>
            <button class="secondary-btn" data-action="${state.workoutPlan.days.length ? 'reset-workout-filters' : 'open-plan-editor'}">${state.workoutPlan.days.length ? 'Limpar filtros' : 'Criar primeiro treino'}</button>
          </div>
        `}</div>
        <div class="card streak-card">
          <span class="fire">🔥</span>
          <div><strong>Ofensiva atual: ${streaks.current} dias</strong><div class="muted">Seu melhor recorde: ${streaks.best} dias</div></div>
        </div>
      </section>
      ${bottomNav('workouts')}
    </main>
  `;
}

function renderWorkoutDay(workoutId) {
  const workout = getWorkout(workoutId);
  if (!workout) return renderWorkoutList();
  const session = getActiveSession(workout.id);
  const progress = workoutProgress(workout, session);
  const activeExercise = session
    ? workout.exercises.find((exercise) => {
      const item = session.exercises[exercise.id];
      return item?.startedAt && !item?.completedAt;
    })
    : null;

  const exercises = workout.exercises.map((exercise, index) => {
    const exerciseState = session?.exercises[exercise.id];
    const completed = Boolean(exerciseState?.completedAt);
    const started = Boolean(exerciseState?.startedAt);
    const statusLabel = completed ? 'Feito' : started ? 'Em andamento' : 'Disponível';
    return `
      <button class="exercise-item ${completed ? 'completed' : ''} ${started && !completed ? 'current' : ''}" data-action="open-exercise" data-workout-id="${escapeHtml(workout.id)}" data-exercise-id="${escapeHtml(exercise.id)}" ${session ? '' : 'disabled'}>
        <span class="exercise-number">${completed ? '✓' : index + 1}</span>
        <span class="exercise-info">
          <strong>${escapeHtml(exercise.name)}</strong>
          <span>${exercise.sets} séries · ${exercise.minReps}–${exercise.maxReps} reps · ${formatDuration(exercise.restSeconds)}</span>
        </span>
        <span class="item-state">${statusLabel}</span>
      </button>
    `;
  }).join('');

  const button = session
    ? progress.percent === 100
      ? `<button class="primary-btn full" data-action="finish-workout" data-workout-id="${escapeHtml(workout.id)}">✓ Finalizar treino</button>`
      : activeExercise
        ? `<button class="primary-btn full" data-action="open-exercise" data-workout-id="${escapeHtml(workout.id)}" data-exercise-id="${escapeHtml(activeExercise.id)}">▶ Continuar ${escapeHtml(activeExercise.name)}</button>`
        : `<button class="primary-btn full" data-action="focus-exercise-list">Escolher exercício disponível</button>`
    : `<button class="primary-btn full" data-action="start-workout" data-workout-id="${escapeHtml(workout.id)}">▶ Iniciar treino</button>`;

  return `
    <main class="app-shell">
      <section class="page page-enter">
        ${pageHeader({ title: workout.title, subtitle: `${workout.exercises.length} exercícios · ~${formatDuration(workout.estimatedMinutes * 60, true)}`, backAction: 'go-workouts', trailing: session ? `<button class="pause-icon-btn ${isSessionPaused(session) ? 'paused' : ''}" data-action="toggle-workout-pause" aria-label="${isSessionPaused(session) ? 'Retomar treino' : 'Pausar treino'}">${isSessionPaused(session) ? '▶' : 'Ⅱ'}</button>` : '' })}

        <div class="card workout-timer-card ${session ? 'active' : ''}">
          <div>
            <span class="eyebrow">TEMPO TOTAL</span>
            <div class="timer" id="total-timer">${session ? formatDuration(sessionElapsed(session)) : '00:00'}</div>
          </div>
          <div class="timer-orb">⏱️</div>
        </div>

        ${session ? `<div class="free-order-banner"><span>↯</span><div><strong>Ordem livre ativada</strong><small>Máquina ocupada? Faça qualquer outro exercício e volte depois.</small></div></div>` : ''}
        ${session && isSessionPaused(session) ? `<div class="pause-banner"><span>Ⅱ</span><div><strong>Treino pausado</strong><small>Os cronômetros estão congelados.</small></div><button data-action="toggle-workout-pause">Retomar</button></div>` : ''}
        <div class="progress-head"><span><b>${progress.completed}</b> de ${progress.total} exercícios concluídos</span><b>${progress.percent}%</b></div>
        <div class="progress"><div style="width:${progress.percent}%"></div></div>

        <div class="exercise-list" id="exercise-list">${exercises}</div>
        <div class="sticky-action">${button}</div>
        ${session ? `<button class="text-btn danger-text" data-action="cancel-workout" data-workout-id="${escapeHtml(workout.id)}">Cancelar treino atual</button>` : ''}
      </section>
      ${bottomNav('home')}
    </main>
  `;
}

function renderLineChart(history = [], emptyText = 'O gráfico aparecerá depois do primeiro registro.') {
  if (!history.length) return `<div class="empty-chart">↗<p>${emptyText}</p></div>`;

  const recent = history.slice(-7);
  const values = recent.map((entry) => Number(entry.weight) || 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const width = 330;
  const height = 150;
  const horizontalPadding = 22;
  const verticalPadding = 24;
  const usableWidth = width - horizontalPadding * 2;
  const usableHeight = height - verticalPadding * 2;
  const range = Math.max(1, max - min);

  const points = recent.map((entry, index) => {
    const x = horizontalPadding + ((usableWidth / Math.max(1, recent.length - 1)) * index);
    const y = verticalPadding + usableHeight - (((Number(entry.weight) - min) / range) * usableHeight);
    return { x, y, entry };
  });

  return `
    <div class="line-chart-wrap">
      <svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de evolução de carga">
        <defs>
          <linearGradient id="chartArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#ffca0a" stop-opacity=".34" />
            <stop offset="100%" stop-color="#ffca0a" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line x1="${horizontalPadding}" y1="${height - verticalPadding}" x2="${width - horizontalPadding}" y2="${height - verticalPadding}" class="chart-axis" />
        <polygon class="chart-area" points="${horizontalPadding},${height - verticalPadding} ${points.map((point) => `${point.x},${point.y}`).join(' ')} ${width - horizontalPadding},${height - verticalPadding}" />
        <polyline class="chart-line" points="${points.map((point) => `${point.x},${point.y}`).join(' ')}" />
        ${points.map((point) => `
          <g class="chart-point-group">
            <circle cx="${point.x}" cy="${point.y}" r="5" class="chart-point" />
            <text x="${point.x}" y="${point.y - 12}" text-anchor="middle">${point.entry.weight}kg</text>
          </g>
        `).join('')}
      </svg>
      <div class="chart-labels">${recent.map((entry) => `<span>${formatDate(entry.date, { day: '2-digit', month: '2-digit' })}</span>`).join('')}</div>
    </div>
  `;
}

function renderRestOverlay(exercise, remaining) {
  const total = Math.max(1, exercise.restSeconds);
  const circumference = 301.59;
  const offset = circumference * (1 - Math.min(1, remaining / total));
  return `
    <div class="rest-overlay" id="rest-overlay" role="dialog" aria-modal="true" aria-label="Cronômetro de descanso">
      <div class="rest-overlay-content">
        <span class="eyebrow">RECUPERE O FÔLEGO</span>
        <h2>Tempo de descanso</h2>
        <div class="rest-ring-wrap">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle class="rest-ring-track" cx="60" cy="60" r="48"></circle>
            <circle id="rest-ring" data-total="${total}" class="rest-ring-progress" cx="60" cy="60" r="48" style="stroke-dashoffset:${offset}"></circle>
          </svg>
          <div><strong id="rest-overlay-timer">${formatDuration(remaining)}</strong><span>até a próxima série</span></div>
        </div>
        <p>${escapeHtml(exercise.name)}</p>
        <div class="rest-adjustments">
          <button data-action="adjust-rest" data-seconds="-15">−15s</button>
          <button data-action="adjust-rest" data-seconds="15">+15s</button>
        </div>
        <button class="primary-btn full" data-action="skip-rest">Pular descanso</button>
        <button class="text-btn" data-action="minimize-rest">Continuar vendo o exercício</button>
      </div>
    </div>
  `;
}

function renderExercise(workoutId, exerciseId) {
  const workout = getWorkout(workoutId);
  const exercise = getExercise(workout, exerciseId);
  const session = getActiveSession(workoutId);
  if (!workout || !exercise || !session) return renderWorkoutDay(workoutId);

  const exerciseIndex = workout.exercises.findIndex((item) => item.id === exercise.id);
  const exerciseState = session.exercises[exercise.id];
  exerciseState.notes ??= '';
  exerciseState.prCelebrated ??= 0;
  const history = state.exerciseHistory[exercise.id] || [];
  const pr = calculatePR(history);
  const last = history.at(-1);
  const currentBest = Math.max(0, ...exerciseState.sets.map((set) => set.done ? Number(set.weight) : 0));
  const paused = isSessionPaused(session);
  const restRemaining = paused
    ? Number(exerciseState.restRemainingSeconds) || 0
    : exerciseState.restUntil
      ? Math.max(0, Math.ceil((new Date(exerciseState.restUntil) - Date.now()) / 1000))
      : 0;
  const completedSets = exerciseState.sets.filter((set) => set.done).length;
  const exercisePercent = Math.round((completedSets / exerciseState.sets.length) * 100);

  const rows = exerciseState.sets.map((set, index) => `
    <tr class="${set.done ? 'set-done' : ''}">
      <td><span class="set-number">${index + 1}</span></td>
      <td><input inputmode="decimal" type="number" min="0" step="0.5" value="${escapeHtml(set.weight)}" placeholder="${escapeHtml(last?.weight || 'kg')}" data-set-index="${index}" data-field="weight" aria-label="Peso da série ${index + 1}" ${exerciseState.completedAt || paused ? 'disabled' : ''}></td>
      <td><input inputmode="numeric" type="number" min="0" step="1" value="${escapeHtml(set.reps)}" placeholder="${escapeHtml(last?.reps || 'reps')}" data-set-index="${index}" data-field="reps" aria-label="Repetições da série ${index + 1}" ${exerciseState.completedAt || paused ? 'disabled' : ''}></td>
      <td><button class="check-btn ${set.done ? 'done' : ''}" data-action="toggle-set" data-set-index="${index}" ${exerciseState.completedAt || paused ? 'disabled' : ''}>${set.done ? '✓' : '○'}</button></td>
    </tr>
  `).join('');

  return `
    <main class="app-shell">
      <section class="page page-enter exercise-page">
        ${pageHeader({ title: `Ordem livre · ${workoutProgress(workout, session).completed}/${workout.exercises.length} feitos`, subtitle: workout.title, backAction: 'open-workout', trailing: `<button class="pause-icon-btn ${paused ? 'paused' : ''}" data-action="toggle-workout-pause" aria-label="${paused ? 'Retomar treino' : 'Pausar treino'}">${paused ? '▶' : 'Ⅱ'}</button>` })}

        ${paused ? `<div class="pause-banner exercise-pause"><span>Ⅱ</span><div><strong>Treino pausado</strong><small>Retome para registrar novas séries.</small></div><button data-action="toggle-workout-pause">Retomar</button></div>` : ''}
        <div class="exercise-quick-switch" aria-label="Escolher outro exercício">
          ${workout.exercises.map((item, index) => {
            const itemState = session.exercises[item.id];
            return `<button class="quick-exercise ${item.id === exercise.id ? 'active' : ''} ${itemState?.completedAt ? 'done' : ''}" data-action="open-exercise" data-workout-id="${escapeHtml(workout.id)}" data-exercise-id="${escapeHtml(item.id)}" title="${escapeHtml(item.name)}"><span>${itemState?.completedAt ? '✓' : index + 1}</span><small>${escapeHtml(item.name)}</small></button>`;
          }).join('')}
        </div>
        <div class="free-order-tip"><span>↯</span><p><b>Sem fila obrigatória.</b> Troque de exercício quando a máquina estiver ocupada.</p></div>
        <div class="card exercise-hero">
          <div class="exercise-emoji">${escapeHtml(workout.icon)}</div>
          <span class="eyebrow">${exercise.sets} SÉRIES · ${exercise.minReps}–${exercise.maxReps} REPS</span>
          <h2>${escapeHtml(exercise.name)}</h2>
          ${exercise.muscles?.length ? `<div class="muscle-tags">${exercise.muscles.map((muscle) => `<span>${escapeHtml(muscle)}</span>`).join('')}</div>` : ''}
          <div class="exercise-progress"><i style="width:${exercisePercent}%"></i></div>
          <div class="exercise-stats">
            <div class="mini-stat"><strong>${pr ? `${pr}kg` : '—'}</strong><span>PR atual</span></div>
            <div class="mini-stat"><strong>${last ? `${last.weight}kg` : '—'}</strong><span>Última carga</span></div>
            <div class="mini-stat"><strong id="exercise-timer">${formatDuration(exerciseElapsed(exerciseState))}</strong><span>Tempo</span></div>
          </div>
          ${currentBest > pr && pr > 0 ? '<div class="pr-alert">🔥 Possível novo PR neste treino!</div>' : ''}
        </div>

        ${exerciseState.startedAt ? '' : `<button class="primary-btn full start-exercise-btn" data-action="start-exercise" ${paused ? 'disabled' : ''}>▶ Iniciar exercício</button>`}

        <div class="card sets-card">
          <div class="card-heading">
            <div><strong>Séries de hoje</strong><span>${completedSets}/${exercise.sets} concluídas</span></div>
            ${last ? `<button class="small-action" data-action="copy-last-load" ${paused ? 'disabled' : ''}>Usar última carga</button>` : ''}
          </div>
          <table class="set-table">
            <thead><tr><th>Série</th><th>Peso (kg)</th><th>Reps</th><th>Feita</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        <div class="rest-box ${restRemaining ? 'counting' : ''}">
          <div><span class="eyebrow">DESCANSO</span><strong>${restRemaining ? 'Cronômetro ativo' : formatDuration(exercise.restSeconds)}</strong></div>
          <div class="rest-time" id="rest-timer">${formatDuration(restRemaining)}</div>
          ${restRemaining ? '<button class="small-action" data-action="open-rest-overlay">Abrir</button>' : '<button class="small-action" disabled>Aguardando</button>'}
        </div>

        ${exercise.tip ? `<div class="card technique-card"><span>💡</span><div><strong>Dica de execução</strong><p>${escapeHtml(exercise.tip)}</p></div></div>` : ''}

        <div class="card notes-card">
          <div class="card-heading"><div><strong>Anotação do exercício</strong><span>Fica salva neste treino</span></div><span class="notes-icon">✎</span></div>
          <textarea data-exercise-notes maxlength="240" placeholder="Ex.: banco na posição 3, aumentar 2 kg na próxima...">${escapeHtml(exerciseState.notes)}</textarea>
          <small><span id="notes-count">${exerciseState.notes.length}</span>/240 caracteres</small>
        </div>

        <div class="card history-card">
          <div class="card-heading"><div><strong>Evolução de carga</strong><span>${history.length} registros</span></div><b class="trend-badge">↗</b></div>
          ${renderLineChart(history)}
        </div>

        <div class="exercise-navigation free-navigation">
          <button class="secondary-btn" data-action="open-workout" data-workout-id="${escapeHtml(workout.id)}">↯ Escolher outro</button>
          ${exerciseState.completedAt
            ? `<button class="primary-btn" data-action="open-workout" data-workout-id="${escapeHtml(workout.id)}">Voltar à lista</button>`
            : `<button class="primary-btn" data-action="complete-exercise" ${completedSets === exercise.sets && !paused ? '' : 'disabled'}>Concluir exercício</button>`}
        </div>
        ${restRemaining && !paused && !restOverlayDismissed && state.preferences?.restOverlayEnabled ? renderRestOverlay(exercise, restRemaining) : ''}
      </section>
      ${bottomNav('home')}
    </main>
  `;
}

function renderEvolution() {
  const completed = [...state.sessions].filter((session) => session.completedAt).sort((a, b) => (
    new Date(b.completedAt) - new Date(a.completedAt)
  ));
  const totalSeconds = completed.reduce((sum, session) => sum + sessionElapsed(session), 0);
  const totalVolume = completed.reduce((sum, session) => sum + calculateSessionVolume(session), 0);
  const histories = Object.entries(state.exerciseHistory || {})
    .filter(([, records]) => records.length)
    .sort((a, b) => b[1].length - a[1].length);
  const featured = histories.find(([exerciseId]) => exerciseId === view.exerciseId) || histories[0] || [null, []];
  const prs = histories
    .map(([exerciseId, records]) => ({ exerciseId, weight: calculatePR(records), last: records.at(-1) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  const recentRows = completed.slice(0, 4).map((session) => {
    const workout = getSessionWorkout(session);
    return `
      <button class="history-row" data-action="open-session-detail" data-session-id="${escapeHtml(session.id)}">
        <span class="history-icon ${escapeHtml(workout?.accent || 'yellow')}">${escapeHtml(workout?.icon || '🏋️')}</span>
        <span><strong>${escapeHtml(workout?.title || 'Treino')}</strong><small>${formatDate(session.completedAt, { day: '2-digit', month: 'long' })}</small></span>
        <b>${formatDuration(sessionElapsed(session), true)} ›</b>
      </button>
    `;
  }).join('');

  return `
    <main class="app-shell">
      <section class="page page-enter">
        ${pageHeader({ title: 'Sua evolução', subtitle: 'Acompanhe o que está melhorando' })}
        <div class="metric-grid">
          <div class="metric-card"><span>🏆</span><b>${allHistoryRecords().length}</b><small>registros de carga</small></div>
          <div class="metric-card"><span>🏋️</span><b>${completed.length}</b><small>treinos concluídos</small></div>
          <div class="metric-card"><span>⏱️</span><b>${formatDuration(totalSeconds, true)}</b><small>tempo treinando</small></div>
          <div class="metric-card"><span>📊</span><b>${Math.round(totalVolume).toLocaleString('pt-BR')}kg</b><small>volume registrado</small></div>
        </div>

        <div class="card evolution-chart-card">
          <div class="card-heading evolution-heading">
            <div><span class="eyebrow">EVOLUÇÃO POR EXERCÍCIO</span><strong>${featured[0] ? escapeHtml(getExerciseName(featured[0])) : 'Evolução de carga'}</strong></div>
            <span class="status done">${featured[1].length} treinos</span>
          </div>
          ${histories.length ? `<select id="evolution-exercise" class="chart-select" aria-label="Escolher exercício do gráfico">${histories.map(([exerciseId]) => `<option value="${escapeHtml(exerciseId)}" ${featured[0] === exerciseId ? 'selected' : ''}>${escapeHtml(getExerciseName(exerciseId))}</option>`).join('')}</select>` : ''}
          ${renderLineChart(featured[1], 'Registre cargas durante os treinos para acompanhar sua evolução.')}
        </div>

        <h2 class="section-title">Seus recordes</h2>
        <div class="card compact-list">
          ${prs.length ? prs.map((item, index) => `
            <div class="pr-row">
              <span class="rank">${index + 1}</span>
              <span><strong>${escapeHtml(getExerciseName(item.exerciseId))}</strong><small>Último registro: ${formatDate(item.last.date, { day: '2-digit', month: '2-digit' })}</small></span>
              <b>${item.weight} kg</b>
            </div>
          `).join('') : '<div class="empty-state">Seus recordes aparecerão aqui.</div>'}
        </div>

        <div class="section-title-row"><h2 class="section-title">Treinos recentes</h2><button data-action="go-history">Ver todos</button></div>
        <div class="card compact-list">${recentRows || '<div class="empty-state">Conclua o primeiro treino para criar seu histórico.</div>'}</div>
      </section>
      ${bottomNav('evolution')}
    </main>
  `;
}

function renderStreak() {
  const streaks = calculateStreaks();
  const activity = new Set(uniqueActivityDates());
  const lastSeven = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = localDateKey(date);
    return {
      key,
      trained: activity.has(key),
      dayName: new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date).replace('.', ''),
      day: date.getDate(),
    };
  });

  return `
    <main class="app-shell">
      <section class="page page-enter">
        ${pageHeader({ title: 'Sua ofensiva', subtitle: 'Consistência vence motivação' })}
        <div class="streak-hero">
          <div class="streak-flame">🔥</div>
          <span>OFENSIVA ATUAL</span>
          <strong>${streaks.current}</strong>
          <b>${streaks.current === 1 ? 'dia seguido' : 'dias seguidos'}</b>
          <small>Seu recorde é de ${streaks.best} dias</small>
        </div>

        <div class="card week-card">
          <div class="card-heading"><div><strong>Últimos 7 dias</strong><span>${lastSeven.filter((item) => item.trained).length} dias treinados</span></div></div>
          <div class="week-activity">
            ${lastSeven.map((item) => `
              <div class="week-day ${item.trained ? 'trained' : ''}">
                <span>${item.dayName}</span><b>${item.trained ? '✓' : item.day}</b>
              </div>
            `).join('')}
          </div>
        </div>

        ${renderCalendar({ large: true })}

        <div class="card streak-rules">
          <strong>Como a ofensiva funciona?</strong>
          <p>Finalize pelo menos um treino no dia para manter a sequência. Repetir dois treinos no mesmo dia conta apenas uma vez.</p>
          <div><span>✓</span><b>Treino concluído</b><small>O dia entra automaticamente no calendário.</small></div>
          <div><span>↻</span><b>Retomada segura</b><small>Um treino em andamento é salvo automaticamente e pode ser retomado.</small></div>
        </div>
      </section>
      ${bottomNav('streak')}
    </main>
  `;
}

function renderHistory() {
  const completed = [...state.sessions]
    .filter((session) => session.completedAt)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  const filtered = historyFilter === 'all'
    ? completed
    : completed.filter((session) => session.workoutId === historyFilter);
  const averageSeconds = filtered.length
    ? Math.round(filtered.reduce((sum, session) => sum + sessionElapsed(session), 0) / filtered.length)
    : 0;
  const totalVolume = filtered.reduce((sum, session) => sum + calculateSessionVolume(session), 0);

  const rows = filtered.map((session) => {
    const workout = getSessionWorkout(session);
    const summary = session.summary || {};
    const setCount = Object.values(session.exercises || {})
      .flatMap((exerciseState) => exerciseState.sets || [])
      .filter((set) => set.done).length;
    return `
      <button class="session-card" data-action="open-session-detail" data-session-id="${escapeHtml(session.id)}">
        <span class="session-icon ${escapeHtml(workout.accent)}">${escapeHtml(workout.icon)}</span>
        <span class="session-copy">
          <small>${formatDate(session.completedAt, { weekday: 'short', day: '2-digit', month: 'long' })}</small>
          <strong>${escapeHtml(workout.title)}</strong>
          <span>${formatDuration(sessionElapsed(session), true)} · ${setCount} séries · ${Math.round(calculateSessionVolume(session)).toLocaleString('pt-BR')} kg</span>
        </span>
        <span class="session-side">
          ${summary.rating ? `<b>${['', '😵', '😮‍💨', '🙂', '💪', '🔥'][summary.rating]}</b>` : '<b>›</b>'}
          <small>Detalhes</small>
        </span>
      </button>
    `;
  }).join('');

  return `
    <main class="app-shell">
      <section class="page page-enter">
        ${pageHeader({ title: 'Histórico de treinos', subtitle: `${completed.length} sessões registradas`, backAction: 'go-evolution' })}
        <div class="history-summary-grid">
          <div class="metric-card"><span>🏋️</span><b>${filtered.length}</b><small>sessões exibidas</small></div>
          <div class="metric-card"><span>⏱️</span><b>${formatDuration(averageSeconds, true)}</b><small>duração média</small></div>
          <div class="metric-card wide"><span>📊</span><b>${Math.round(totalVolume).toLocaleString('pt-BR')} kg</b><small>volume no período</small></div>
        </div>
        <label class="select-field">
          <span>Filtrar por treino</span>
          <select id="history-filter">
            <option value="all" ${historyFilter === 'all' ? 'selected' : ''}>Todos os treinos</option>
            ${state.workoutPlan.days.map((workout) => `<option value="${escapeHtml(workout.id)}" ${historyFilter === workout.id ? 'selected' : ''}>${escapeHtml(workout.title)}</option>`).join('')}
          </select>
        </label>
        <div class="session-list">${rows || `
          <div class="card empty-search-state"><span>☷</span><strong>Nenhuma sessão neste filtro</strong><p>Os treinos concluídos aparecerão aqui com todos os detalhes.</p></div>
        `}</div>
      </section>
      ${bottomNav('evolution')}
    </main>
  `;
}

function renderSessionDetail(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId && item.completedAt);
  if (!session) return renderHistory();
  const workout = getSessionWorkout(session);
  const summary = session.summary || {};
  const exerciseRows = workout.exercises.map((exercise, exerciseIndex) => {
    const exerciseState = session.exercises?.[exercise.id];
    if (!exerciseState) return '';
    const completedSets = (exerciseState.sets || []).filter((set) => set.done);
    const bestSet = [...completedSets].sort((a, b) => Number(b.weight) - Number(a.weight))[0];
    return `
      <details class="history-exercise" ${exerciseIndex === 0 ? 'open' : ''}>
        <summary>
          <span class="exercise-number">${exerciseIndex + 1}</span>
          <span><strong>${escapeHtml(exercise.name)}</strong><small>${completedSets.length} séries · melhor carga ${bestSet ? `${bestSet.weight} kg` : '—'}</small></span>
          <b>⌄</b>
        </summary>
        <div class="history-set-head"><span>Série</span><span>Peso</span><span>Reps</span><span>Volume</span></div>
        ${completedSets.map((set, index) => `
          <div class="history-set-row"><span>${index + 1}</span><b>${Number(set.weight) || 0} kg</b><b>${Number(set.reps) || 0}</b><strong>${Math.round((Number(set.weight) || 0) * (Number(set.reps) || 0))} kg</strong></div>
        `).join('') || '<p class="empty-inline">Nenhuma série registrada.</p>'}
        ${exerciseState.notes ? `<div class="history-note"><span>✎</span><p>${escapeHtml(exerciseState.notes)}</p></div>` : ''}
      </details>
    `;
  }).join('');
  const rating = summary.rating ? ['', 'Muito pesado', 'Difícil', 'Bom', 'Ótimo', 'Excelente'][summary.rating] : 'Não avaliado';
  return `
    <main class="app-shell">
      <section class="page page-enter">
        ${pageHeader({ title: workout.title, subtitle: formatDate(session.completedAt, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }), backAction: 'go-history' })}
        <div class="session-detail-hero ${escapeHtml(workout.accent)}">
          <span class="session-detail-icon">${escapeHtml(workout.icon)}</span>
          <div><span class="eyebrow">TREINO CONCLUÍDO</span><strong>${formatDuration(sessionElapsed(session))}</strong><small>${Object.keys(session.exercises || {}).length} exercícios realizados</small></div>
          <span class="completion-stamp">✓</span>
        </div>
        <div class="result-grid compact">
          <div><span>📊</span><b>${Math.round(calculateSessionVolume(session)).toLocaleString('pt-BR')} kg</b><small>Volume</small></div>
          <div><span>🏆</span><b>${summary.newPRs ?? 0}</b><small>Novos PRs</small></div>
          <div><span>${summary.rating ? ['','😵','😮‍💨','🙂','💪','🔥'][summary.rating] : '—'}</span><b>${rating}</b><small>Percepção</small></div>
        </div>
        ${summary.note ? `<div class="card session-summary-note"><span>Como foi</span><p>${escapeHtml(summary.note)}</p></div>` : ''}
        <h2 class="section-title">Exercícios e séries</h2>
        <div class="history-exercise-list">${exerciseRows}</div>
      </section>
      ${bottomNav('evolution')}
    </main>
  `;
}

function renderPlanEditor() {
  if (state.activeSession) {
    return `
      <main class="app-shell"><section class="page page-enter">
        ${pageHeader({ title: 'Meus treinos', subtitle: 'Crie e organize sua ficha', backAction: 'go-profile' })}
        <div class="card editor-blocked"><span>⏱️</span><h2>Finalize o treino atual primeiro</h2><p>A ficha fica bloqueada durante uma sessão para não alterar séries que já estão em andamento.</p><button class="primary-btn" data-action="open-workout" data-workout-id="${escapeHtml(state.activeSession.workoutId)}">Voltar ao treino</button></div>
      </section>${bottomNav('profile')}</main>
    `;
  }

  planDraft ||= cloneData(state.workoutPlan);
  const focusLabels = {
    auto: 'Detectar automaticamente', legs: 'Pernas', chest: 'Peito', back: 'Costas',
    shoulders: 'Ombros', arms: 'Braços', core: 'Abdômen', cardio: 'Cardio', full: 'Corpo inteiro',
  };
  const totalExercises = planDraft.days.reduce((sum, day) => sum + day.exercises.length, 0);
  const dayNav = planDraft.days.map((day, index) => `
    <button data-action="jump-editor-day" data-day-id="${escapeHtml(day.id)}">
      <span>${escapeHtml(day.icon || '🏋️')}</span><div><small>DIA ${index + 1}</small><strong>${escapeHtml(day.title || 'Novo treino')}</strong></div><b>${day.exercises.length}</b>
    </button>
  `).join('');

  const days = planDraft.days.map((day, dayIndex) => `
    <section class="editor-day-card ${escapeHtml(day.accent)}" id="editor-day-${escapeHtml(day.id)}" data-editor-day-card="${escapeHtml(day.id)}">
      <div class="editor-day-head">
        <span class="editor-drag">${escapeHtml(day.icon)}</span>
        <div><small>DIA ${dayIndex + 1}</small><strong>${escapeHtml(day.title || 'Novo dia')}</strong></div>
        <div class="editor-order-actions">
          <button data-action="duplicate-day" data-day-id="${escapeHtml(day.id)}" title="Duplicar treino" aria-label="Duplicar treino">⧉</button>
          <button data-action="move-day" data-day-id="${escapeHtml(day.id)}" data-direction="-1" ${dayIndex === 0 ? 'disabled' : ''} aria-label="Mover dia para cima">↑</button>
          <button data-action="move-day" data-day-id="${escapeHtml(day.id)}" data-direction="1" ${dayIndex === planDraft.days.length - 1 ? 'disabled' : ''} aria-label="Mover dia para baixo">↓</button>
        </div>
      </div>
      <div class="editor-grid day-fields">
        <label class="wide">Nome do treino<input value="${escapeHtml(day.title)}" data-editor-kind="day" data-day-id="${escapeHtml(day.id)}" data-field="title" maxlength="48"></label>
        <label>Ícone<input value="${escapeHtml(day.icon)}" data-editor-kind="day" data-day-id="${escapeHtml(day.id)}" data-field="icon" maxlength="8"></label>
        <label>Tempo estimado<input type="number" min="10" max="180" value="${day.estimatedMinutes}" data-editor-kind="day" data-day-id="${escapeHtml(day.id)}" data-field="estimatedMinutes"><small>minutos</small></label>
        <label>Foco principal<select data-editor-kind="day" data-day-id="${escapeHtml(day.id)}" data-field="focus">${Object.entries(focusLabels).map(([value, label]) => `<option value="${value}" ${(day.focus || 'auto') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>Cor<select data-editor-kind="day" data-day-id="${escapeHtml(day.id)}" data-field="accent">${['red','green','blue','yellow'].map((accent) => `<option value="${accent}" ${day.accent === accent ? 'selected' : ''}>${{red:'Vermelho',green:'Verde',blue:'Azul',yellow:'Amarelo'}[accent]}</option>`).join('')}</select></label>
      </div>
      <div class="workout-preset-panel">
        <div class="preset-panel-head"><span><b>Presets visuais</b><small>Escolha um grupo e personalize o ícone</small></span><em>Opcional</em></div>
        <div class="workout-preset-grid">
          ${WORKOUT_PRESETS.map((preset) => `<button type="button" class="workout-preset ${day.focus === preset.focus ? 'active' : ''}" data-action="apply-workout-preset" data-day-id="${escapeHtml(day.id)}" data-preset-id="${preset.id}"><span>${preset.icon}</span><small>${preset.label}</small></button>`).join('')}
        </div>
        <div class="emoji-preset-row" aria-label="Emojis prontos">
          ${WORKOUT_EMOJI_PRESETS.map((emoji) => `<button type="button" class="emoji-preset ${day.icon === emoji ? 'active' : ''}" data-action="set-workout-emoji" data-day-id="${escapeHtml(day.id)}" data-emoji="${emoji}" aria-label="Usar emoji ${emoji}">${emoji}</button>`).join('')}
        </div>
      </div>
      <div class="editor-exercises-head"><span><b>Sequência de exercícios</b><small>${day.exercises.length} cadastrados</small></span><button data-action="add-exercise" data-day-id="${escapeHtml(day.id)}">＋ Adicionar exercício</button></div>
      <div class="editor-exercise-list">
        ${day.exercises.map((exercise, exerciseIndex) => `
          <div class="editor-exercise-row">
            <div class="editor-exercise-top">
              <span class="exercise-number">${exerciseIndex + 1}</span>
              <input list="exercise-suggestions" class="exercise-name-input" value="${escapeHtml(exercise.name)}" data-editor-kind="exercise" data-day-id="${escapeHtml(day.id)}" data-exercise-id="${escapeHtml(exercise.id)}" data-field="name" maxlength="70" aria-label="Nome do exercício ${exerciseIndex + 1}">
              <div class="editor-order-actions mini">
                <button data-action="duplicate-exercise" data-day-id="${escapeHtml(day.id)}" data-exercise-id="${escapeHtml(exercise.id)}" title="Duplicar exercício" aria-label="Duplicar exercício">⧉</button>
                <button data-action="move-exercise" data-day-id="${escapeHtml(day.id)}" data-exercise-id="${escapeHtml(exercise.id)}" data-direction="-1" ${exerciseIndex === 0 ? 'disabled' : ''}>↑</button>
                <button data-action="move-exercise" data-day-id="${escapeHtml(day.id)}" data-exercise-id="${escapeHtml(exercise.id)}" data-direction="1" ${exerciseIndex === day.exercises.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="remove-mini" data-action="remove-exercise" data-day-id="${escapeHtml(day.id)}" data-exercise-id="${escapeHtml(exercise.id)}">×</button>
              </div>
            </div>
            <div class="editor-grid exercise-fields">
              <label>Séries<input type="number" min="1" max="10" value="${exercise.sets}" data-editor-kind="exercise" data-day-id="${escapeHtml(day.id)}" data-exercise-id="${escapeHtml(exercise.id)}" data-field="sets"></label>
              <label>Reps mín.<input type="number" min="1" max="100" value="${exercise.minReps}" data-editor-kind="exercise" data-day-id="${escapeHtml(day.id)}" data-exercise-id="${escapeHtml(exercise.id)}" data-field="minReps"></label>
              <label>Reps máx.<input type="number" min="1" max="100" value="${exercise.maxReps}" data-editor-kind="exercise" data-day-id="${escapeHtml(day.id)}" data-exercise-id="${escapeHtml(exercise.id)}" data-field="maxReps"></label>
              <label>Descanso<input type="number" min="15" max="600" step="15" value="${exercise.restSeconds}" data-editor-kind="exercise" data-day-id="${escapeHtml(day.id)}" data-exercise-id="${escapeHtml(exercise.id)}" data-field="restSeconds"><small>segundos</small></label>
            </div>
          </div>
        `).join('')}
      </div>
      <button class="text-btn danger-text editor-remove-day" data-action="remove-day" data-day-id="${escapeHtml(day.id)}">Excluir este dia</button>
    </section>
  `).join('');

  return `
    <main class="app-shell editor-shell">
      <section class="page page-enter">
        ${pageHeader({ title: 'Montador de treinos', subtitle: 'Completo no PC, rápido no celular', backAction: 'discard-plan-editor' })}
        <div class="editor-intro"><span>✦</span><div><strong>Monte sua ficha do seu jeito</strong><p>No computador, use o menu lateral e duplique treinos. No celular, tudo continua em cards fáceis de tocar.</p></div><kbd>Ctrl + S</kbd></div>
        <div class="editor-desktop-toolbar">
          <div><span class="eyebrow">MONTAGEM RÁPIDA</span><strong>${Number(planDraft.weeklyGoal || planDraft.days.length || 3)}x/semana · ${planDraft.days.length} treinos · ${totalExercises} exercícios</strong></div>
          <div><button class="secondary-btn" data-action="add-day">＋ Novo treino</button><button class="primary-btn" data-action="save-plan">Salvar ficha</button></div>
        </div>
        <div class="editor-workspace">
          <aside class="editor-sidebar">
            <div class="card editor-plan-meta">
              <label>Nome da ficha<input value="${escapeHtml(planDraft.name)}" data-editor-kind="plan" data-field="name" maxlength="45"></label>
              <div class="editor-grid">
                <label>Início<input type="date" value="${planDraft.startsAt}" data-editor-kind="plan" data-field="startsAt"></label>
                <label>Meta semanal<select data-editor-kind="plan" data-field="weeklyGoal">${Array.from({ length: 7 }, (_, index) => index + 1).map((goal) => `<option value="${goal}" ${Number(planDraft.weeklyGoal || planDraft.days.length || 3) === goal ? 'selected' : ''}>${goal}x por semana</option>`).join('')}</select></label>
              </div>
              <label class="no-expiry-toggle"><input type="checkbox" data-plan-no-expiry ${planDraft.expiresAt ? '' : 'checked'}><span><b>Treino sem validade</b><small>Deixe ativo para usar a ficha até decidir trocá-la.</small></span></label>
              <label class="expiry-field ${planDraft.expiresAt ? '' : 'disabled'}">Validade<input type="date" value="${planDraft.expiresAt}" data-editor-kind="plan" data-field="expiresAt" ${planDraft.expiresAt ? '' : 'disabled'}></label>
              <div class="flexible-routine-note"><span>📆</span><p><b>Rotina flexível:</b> os treinos são “Treino 1, 2, 3...” e podem ser feitos em qualquer dia. A meta semanal define a frequência, não segunda a sexta.</p></div>
            </div>
            <nav class="editor-day-nav" aria-label="Dias da ficha">${dayNav}</nav>
            <button class="secondary-btn full editor-side-add" data-action="add-day">＋ Adicionar treino</button>
          </aside>
          <div class="editor-main">
            <div class="editor-day-list">${days}</div>
            <button class="secondary-btn full add-day-btn" data-action="add-day">＋ Adicionar outro treino</button>
          </div>
        </div>
        <datalist id="exercise-suggestions">${EXERCISE_SUGGESTIONS.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
        <div class="editor-save-bar">
          <span><b>${planDraft.days.length} treino${planDraft.days.length === 1 ? '' : 's'} · meta ${Number(planDraft.weeklyGoal || planDraft.days.length || 3)}x/semana</b><small>${totalExercises} exercícios · rotina sem dias fixos</small></span>
          <button class="primary-btn" data-action="save-plan">Salvar meus treinos</button>
        </div>
      </section>
      ${bottomNav('profile')}
    </main>
  `;
}

function socialEmpty(icon, title, text) {
  return `<div class="social-empty"><span>${icon}</span><strong>${title}</strong><p>${text}</p></div>`;
}

async function loadCollabs() {
  collabState.loading = true;
  collabState.error = '';
  render();
  try {
    collabState.dashboard = await repository.getCollabDashboard();
  } catch (error) {
    collabState.error = error?.message || 'Não foi possível carregar as collabs.';
  } finally {
    collabState.loading = false;
    if (view.name === 'collab') render();
  }
}

function renderCollab() {
  const data = collabState.dashboard || { received: [], sent: [], friends: [], received_plans: [], sent_plans: [] };
  const results = collabState.searchResults || [];
  return `
    <main class="app-shell">
      <section class="page page-enter social-page">
        ${pageHeader({ title: 'Collabs', subtitle: 'Treine, compartilhe e evolua com amigos' })}
        <div class="social-hero collab-hero"><span>🤝</span><div><b>${data.friends.length}</b><small>parceiros conectados</small></div><p>Compartilhe sua ficha e acompanhe a evolução da galera.</p></div>

        <form id="people-search-form" class="card social-search-form">
          <label>Encontrar atleta<div class="search-field"><span>@</span><input name="query" minlength="2" required placeholder="usuario ou nome"><button type="submit">Buscar</button></div></label>
        </form>
        ${results.length ? `<div class="social-results">${results.map((person) => `
          <article class="card person-card">
            <div class="social-avatar">${escapeHtml(person.display_name).slice(0,1).toUpperCase()}</div>
            <div><strong>${escapeHtml(person.display_name)}</strong><span>@${escapeHtml(person.username)}</span><small>${escapeHtml(person.bio || 'Atleta do Easy Train')}</small></div>
            ${person.relationship === 'none' ? `<button class="compact-btn" data-action="send-collab" data-user-id="${escapeHtml(person.id)}">Adicionar</button>` : `<b class="relation-badge ${escapeHtml(person.relationship)}">${person.relationship === 'friend' ? 'Collab' : person.relationship === 'sent' ? 'Enviado' : 'Recebido'}</b>`}
          </article>`).join('')}</div>` : ''}

        ${data.received.length ? `<h2 class="section-title">Solicitações</h2><div class="social-stack">${data.received.map((request) => `
          <article class="card request-card"><div class="social-avatar">${escapeHtml(request.user.display_name).slice(0,1).toUpperCase()}</div><div><strong>${escapeHtml(request.user.display_name)}</strong><span>@${escapeHtml(request.user.username)}</span></div><div class="request-actions"><button data-action="respond-collab" data-request-id="${escapeHtml(request.id)}" data-accept="false">×</button><button class="accept" data-action="respond-collab" data-request-id="${escapeHtml(request.id)}" data-accept="true">✓</button></div></article>`).join('')}</div>` : ''}

        <h2 class="section-title">Seus parceiros</h2>
        ${collabState.loading ? '<div class="social-loading">Carregando collabs...</div>' : collabState.error ? `<div class="inline-error">${escapeHtml(collabState.error)}</div>` : data.friends.length ? `<div class="friend-grid">${data.friends.map((friend) => `
          <article class="card friend-card">
            <div class="friend-head"><div class="social-avatar">${escapeHtml(friend.display_name).slice(0,1).toUpperCase()}</div><div><strong>${escapeHtml(friend.display_name)}</strong><span>@${escapeHtml(friend.username)}</span></div></div>
            <div class="friend-stats"><span><b>${friend.stats.weekly_workouts}</b><small>semana</small></span><span><b>${friend.stats.current_streak}</b><small>ofensiva</small></span><span><b>${Number(friend.stats.prs_count || 0)}</b><small>PRs</small></span></div>
            <button class="secondary-btn full" data-action="share-plan" data-user-id="${escapeHtml(friend.id)}" data-user-name="${escapeHtml(friend.display_name)}">↗ Compartilhar minha ficha</button>
          </article>`).join('')}</div>` : socialEmpty('👥','Nenhuma collab ainda','Busque o @usuário de um amigo e envie uma solicitação.')}

        <h2 class="section-title">Fichas recebidas</h2>
        ${data.received_plans.length ? `<div class="social-stack">${data.received_plans.map((share) => `
          <article class="card shared-plan-card"><span class="shared-plan-icon">📋</span><div><strong>${escapeHtml(share.title)}</strong><small>Enviada por @${escapeHtml(share.sender.username)} · ${share.plan?.days?.length || 0} dias</small></div><button class="primary-btn" data-action="import-shared-plan" data-share-id="${escapeHtml(share.id)}">Adicionar</button></article>`).join('')}</div>` : socialEmpty('📋','Nenhuma ficha recebida','Quando uma collab compartilhar um treino, ele aparecerá aqui.')}
      </section>
      ${bottomNav('collab')}
    </main>`;
}

async function loadCompetitions() {
  competitionState.loading = true;
  competitionState.error = '';
  render();
  try {
    competitionState.items = await repository.getCompetitions();
    if (!collabState.dashboard) collabState.dashboard = await repository.getCollabDashboard();
  } catch (error) {
    competitionState.error = error?.message || 'Não foi possível carregar as disputas.';
  } finally {
    competitionState.loading = false;
    if (view.name === 'competitions') render();
  }
}

const metricLabels = { workouts: 'Treinos concluídos', volume: 'Volume levantado', prs: 'Novos PRs', streak: 'Ofensiva atual' };
function metricValue(metric, value) {
  const number = Number(value || 0);
  if (metric === 'volume') return `${Math.round(number).toLocaleString('pt-BR')} kg`;
  if (metric === 'streak') return `${number} dias`;
  return String(Math.round(number));
}

function renderCompetitions() {
  const items = competitionState.items || [];
  const friends = collabState.dashboard?.friends || [];
  return `
    <main class="app-shell">
      <section class="page page-enter social-page">
        ${pageHeader({ title: 'Competições', subtitle: 'Dispute de forma saudável com seus amigos' })}
        <div class="social-hero competition-hero"><span>🏆</span><div><b>${items.filter((item)=>item.my_status==='accepted' && item.status==='active').length}</b><small>disputas ativas</small></div><p>Treinos, volume, PRs ou ofensiva. Escolha a regra e bora competir.</p></div>

        <details class="card competition-create-card">
          <summary><span>＋</span><div><strong>Criar nova disputa</strong><small>Convide suas collabs e monte o ranking</small></div><b>›</b></summary>
          <form id="competition-create-form" class="competition-form">
            <label>Nome da disputa<input name="title" required maxlength="80" placeholder="Ex.: Agosto sem desculpas"></label>
            <label>Descrição<textarea name="description" maxlength="240" placeholder="Qual é o objetivo?"></textarea></label>
            <label>Métrica<select name="metric"><option value="workouts">Treinos concluídos</option><option value="volume">Volume levantado</option><option value="prs">Novos PRs</option><option value="streak">Ofensiva atual</option></select></label>
            <div class="two-fields"><label>Começa em<input name="startDate" type="date" required value="${todayKey()}"></label><label>Termina em<input name="endDate" type="date" required value="${localDateKey(new Date(Date.now()+7*86400000))}"></label></div>
            ${friends.length ? `<fieldset><legend>Convidar collabs</legend><div class="friend-checkboxes">${friends.map((friend)=>`<label><input type="checkbox" name="inviteUser" value="${escapeHtml(friend.id)}"><span>${escapeHtml(friend.display_name)}<small>@${escapeHtml(friend.username)}</small></span></label>`).join('')}</div></fieldset>` : '<p class="form-hint">Adicione collabs para convidá-las diretamente.</p>'}
            <button class="primary-btn full" type="submit">Criar disputa</button>
          </form>
        </details>

        <form id="competition-join-form" class="card join-code-card"><div><span>🔑</span><label>Entrar com código<input name="code" required maxlength="8" placeholder="ABC123"></label></div><button type="submit" class="secondary-btn">Entrar</button></form>

        <h2 class="section-title">Suas disputas</h2>
        ${competitionState.loading ? '<div class="social-loading">Atualizando rankings...</div>' : competitionState.error ? `<div class="inline-error">${escapeHtml(competitionState.error)}</div>` : items.length ? `<div class="competition-list">${items.map((competition) => `
          <article class="card competition-card ${escapeHtml(competition.status)}">
            <div class="competition-head"><div><span class="metric-chip">${metricLabels[competition.metric]}</span><h3>${escapeHtml(competition.title)}</h3><p>${escapeHtml(competition.description || 'Quem evolui mais?')}</p></div><span class="competition-code">${escapeHtml(competition.invite_code)}</span></div>
            <div class="competition-dates"><span>${formatDate(competition.start_date,{day:'2-digit',month:'2-digit'})}</span><i></i><span>${formatDate(competition.end_date,{day:'2-digit',month:'2-digit'})}</span></div>
            ${competition.my_status === 'invited' ? `<div class="competition-invite"><b>@${escapeHtml(competition.creator.username)} convidou você</b><div><button data-action="respond-competition" data-competition-id="${escapeHtml(competition.id)}" data-accept="false">Recusar</button><button class="accept" data-action="respond-competition" data-competition-id="${escapeHtml(competition.id)}" data-accept="true">Aceitar</button></div></div>` : `<div class="leaderboard">${(competition.members || []).map((member,index)=>`<div class="leader-row ${member.id === state.student.id ? 'me' : ''}"><b>${index+1}</b><div class="social-avatar mini">${escapeHtml(member.display_name).slice(0,1).toUpperCase()}</div><span><strong>${escapeHtml(member.display_name)}</strong><small>@${escapeHtml(member.username)}</small></span><em>${metricValue(competition.metric,member.score)}</em></div>`).join('')}</div>`}
          </article>`).join('')}</div>` : socialEmpty('🏆','Nenhuma disputa ainda','Crie uma competição ou entre usando o código de um amigo.')}
      </section>
      ${bottomNav('competitions')}
    </main>`;
}

function renderProfile() {
  const streaks = calculateStreaks();
  const completed = state.sessions.filter((session) => session.completedAt).length;
  return `
    <main class="app-shell">
      <section class="page page-enter">
        ${pageHeader({ title: 'Meu perfil', subtitle: 'Conta, preferências e treinos' })}
        <div class="profile-hero">
          <div class="profile-avatar">${escapeHtml(state.student.name).slice(0, 1).toUpperCase()}</div>
          <h2>${escapeHtml(state.student.name)}</h2>
          <span>@${escapeHtml(state.student.username || 'atleta')} · Easy Train</span>
        </div>
        <div class="profile-stats"><div><b>${completed}</b><span>Treinos</span></div><div><b>${streaks.current}</b><span>Ofensiva</span></div><div><b>${state.workoutPlan.days.length}</b><span>Treinos na ficha</span></div></div>

        <div class="card profile-form">
          <label>Nome exibido<input id="profile-name" value="${escapeHtml(state.student.name)}" maxlength="80"></label>
          <label>@usuário<div class="username-input"><span>@</span><input id="profile-username" value="${escapeHtml(state.student.username || '')}" maxlength="24"></div></label>
          <label>Bio<textarea id="profile-bio" maxlength="180" placeholder="Conte um pouco sobre seu treino">${escapeHtml(state.student.bio || '')}</textarea></label>
          <label class="profile-visibility"><input id="profile-discoverable" type="checkbox" ${state.student.discoverable !== false ? 'checked' : ''}><span><b>Permitir que me encontrem</b><small>Seu nome e @usuário aparecem na busca de collabs.</small></span></label>
          <button class="primary-btn full" data-action="save-profile">Salvar perfil</button>
        </div>

        <div class="card workout-manager-card">
          <div class="workout-manager-head"><span class="workout-manager-icon">✎</span><div><span class="eyebrow">SEUS TREINOS</span><strong>Monte sua própria ficha</strong><small>Crie dias, exercícios, séries, repetições e descansos.</small></div></div>
          <div class="workout-manager-summary"><span><b>${state.workoutPlan.days.length}</b><small>treinos</small></span><span><b>${state.workoutPlan.days.reduce((sum, day) => sum + day.exercises.length, 0)}</b><small>exercícios</small></span><span><b>Online</b><small>sincronização</small></span></div>
          <button class="primary-btn full" data-action="open-plan-editor">＋ Gerenciar meus treinos</button>
        </div>

        <div class="profile-social-links">
          <button class="card profile-link-card" data-action="go-collab"><span>🤝</span><div><strong>Minhas collabs</strong><small>Parceiros e fichas compartilhadas</small></div><b>›</b></button>
          <button class="card profile-link-card" data-action="go-competitions"><span>🏆</span><div><strong>Competições</strong><small>Rankings e desafios ativos</small></div><b>›</b></button>
        </div>

        <h2 class="section-title theme-section-title">Aparência</h2>
        <div class="card theme-card theme-card-prominent">
          <div class="theme-card-copy"><span>${themeMeta().icon}</span><div><strong>Escolha o visual do Easy Train</strong><small>O padrão é Sistema. Neste momento o aparelho está usando o tema ${resolvedTheme() === 'light' ? 'claro' : 'escuro'}.</small></div><b class="theme-current-badge">${themeMeta().label}</b></div>
          ${renderThemeSelector('profile-theme-selector')}
        </div>

        <h2 class="section-title">Preferências do treino</h2>
        <div class="card preference-list">
          ${[
            ['soundEnabled', 'Sons do treino', 'Avisos de série, descanso e PR', '♪'],
            ['vibrationEnabled', 'Vibração', 'Feedback ao concluir uma série', '⌁'],
            ['keepAwakeEnabled', 'Manter tela ligada', 'Evita bloquear durante o treino', '☀'],
            ['restOverlayEnabled', 'Descanso em tela cheia', 'Abre o cronômetro após cada série', '◷'],
            ['autoCopyWeight', 'Repetir carga', 'Copia o peso para a próxima série', '↻'],
            ['funnyCoachEnabled', 'Coach sem filtro', 'Mensagens engraçadas quando um treino fica esquecido', '😏'],
          ].map(([key, title, subtitle, icon]) => `<div class="preference-row"><span class="preference-icon">${icon}</span><span><b>${title}</b><small>${subtitle}</small></span><button class="switch ${state.preferences?.[key] ? 'on' : ''}" role="switch" aria-checked="${Boolean(state.preferences?.[key])}" data-action="toggle-preference" data-preference="${key}"><i></i></button></div>`).join('')}
        </div>

        <div class="card cloud-account-card"><span>☁</span><div><strong>Conta sincronizada</strong><small>Treinos, collabs e rankings protegidos pela sua conta</small></div><b>ONLINE</b></div>
        <div class="profile-actions">
          <button class="secondary-btn full" data-action="go-history">☷ Ver histórico completo</button>
          <button class="secondary-btn full install-btn" data-action="install-app" ${isStandaloneApp() ? 'disabled' : ''}>＋ ${installActionLabel()}</button>
          <button class="danger-outline-btn full" data-action="logout">Sair da conta</button>
        </div>
      </section>
      ${bottomNav('profile')}
    </main>`;
}

function renderCompletion() {
  if (!lastSummary) return renderHome();
  const streaks = calculateStreaks();
  return `
    <main class="app-shell">
      <section class="page completion page-enter">
        <div class="confetti" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="completion-icon">✓</div>
        <span class="eyebrow">MISSÃO CUMPRIDA</span>
        <h1>Treino concluído!</h1>
        <p class="completion-subtitle">Você terminou ${escapeHtml(lastSummary.workoutTitle)}. Excelente trabalho!</p>
        ${lastSummary.newPRs ? `<div class="achievement-banner"><span>🏆</span><div><strong>${lastSummary.newPRs} novo${lastSummary.newPRs === 1 ? '' : 's'} recorde${lastSummary.newPRs === 1 ? '' : 's'}!</strong><small>Treino de respeito. Sua evolução foi registrada.</small></div></div>` : ''}
        ${Number.isFinite(lastSummary.volumeChangePercent) ? `<div class="comparison-banner ${lastSummary.volumeChangePercent >= 0 ? 'positive' : 'neutral'}"><span>${lastSummary.volumeChangePercent >= 0 ? '↗' : '↘'}</span><div><strong>${Math.abs(lastSummary.volumeChangePercent)}% ${lastSummary.volumeChangePercent >= 0 ? 'a mais' : 'a menos'} de volume</strong><small>Comparado ao último treino de ${escapeHtml(lastSummary.workoutTitle)}.</small></div></div>` : ''}
        <div class="card result-list">
          <div class="result-row"><span>⏱ Tempo total</span><b>${formatDuration(lastSummary.durationSeconds)}</b></div>
          <div class="result-row"><span>🏋️ Exercícios</span><b>${lastSummary.exerciseCount}</b></div>
          <div class="result-row"><span>☷ Séries realizadas</span><b>${lastSummary.setCount}</b></div>
          <div class="result-row"><span>📊 Volume total</span><b>${lastSummary.totalVolume.toLocaleString('pt-BR')} kg</b></div>
          <div class="result-row"><span>💪 Maior carga</span><b>${lastSummary.bestLift ? `${lastSummary.bestLift.weight} kg · ${escapeHtml(lastSummary.bestLift.name)}` : '—'}</b></div>
          <div class="result-row"><span>⭐ Novos recordes</span><b>${lastSummary.newPRs}</b></div>
        </div>
        <div class="card streak-card completion-streak">
          <span class="fire">🔥</span><div><strong>Ofensiva atual: ${streaks.current} dias</strong><div class="muted">Continue assim!</div></div>
        </div>
        <div class="card workout-rating-card">
          <div class="card-heading"><div><strong>Como foi o treino?</strong><span>Isso ajuda a acompanhar sua percepção de esforço.</span></div></div>
          <div class="rating-options">
            ${[
              [1, '😵', 'Muito pesado'],
              [2, '😮‍💨', 'Difícil'],
              [3, '🙂', 'Bom'],
              [4, '💪', 'Ótimo'],
              [5, '🔥', 'Excelente'],
            ].map(([rating, icon, label]) => `<button class="rating-btn ${lastSummary.rating === rating ? 'selected' : ''}" data-action="rate-workout" data-rating="${rating}"><span>${icon}</span><small>${label}</small></button>`).join('')}
          </div>
          <textarea data-summary-note maxlength="180" placeholder="Alguma observação sobre o treino de hoje?">${escapeHtml(lastSummary.note || '')}</textarea>
        </div>
        <div class="actions-row">
          <button class="secondary-btn" data-action="go-evolution">Ver evolução</button>
          <button class="primary-btn" data-action="go-home">⌂ Voltar ao início</button>
        </div>
      </section>
    </main>
  `;
}

function render() {
  if (cloudView.loading) { app.innerHTML = renderCloudLoading(); return; }
  if (!authSession || authMode === 'recovery') { app.innerHTML = renderAuth(); return; }
  if (!state) { app.innerHTML = renderConnectionError(); return; }
  if (!state.onboardingComplete && view.name !== 'onboarding') view = { name: 'onboarding', workoutId: null, exerciseId: null };
  const templates = {
    onboarding: () => renderOnboarding(),
    home: () => renderHome(),
    workouts: () => renderWorkoutList(),
    workout: () => renderWorkoutDay(view.workoutId),
    exercise: () => renderExercise(view.workoutId, view.exerciseId),
    evolution: () => renderEvolution(),
    history: () => renderHistory(),
    sessionDetail: () => renderSessionDetail(view.sessionId),
    streak: () => renderStreak(),
    profile: () => renderProfile(),
    collab: () => renderCollab(),
    competitions: () => renderCompetitions(),
    planEditor: () => renderPlanEditor(),
    completion: () => renderCompletion(),
  };
  app.innerHTML = (templates[view.name] || templates.home)();
  updateVisibleTimers();
}

function navigate(name, payload = {}) {
  view = {
    name,
    workoutId: payload.workoutId || null,
    exerciseId: payload.exerciseId || null,
    sessionId: payload.sessionId || null,
  };
  window.scrollTo({ top: 0, behavior: 'auto' });
  render();
  if (name === 'collab' && !collabState.loading) loadCollabs();
  if (name === 'competitions' && !competitionState.loading) loadCompetitions();
}

async function startWorkout(workoutId) {
  const workout = getWorkout(workoutId);
  if (!workout) return;
  if (!workout.exercises.length) {
    showToast('Adicione pelo menos um exercício antes de iniciar este treino.', 'warning');
    return;
  }
  if (state.activeSession && state.activeSession.workoutId !== workoutId) {
    showToast('Finalize o treino em andamento antes de iniciar outro.', 'warning');
    return;
  }
  if (!state.activeSession) state.activeSession = createSession(workout);
  navigate('workout', { workoutId });
  queuePersist();
  void requestWakeLock();
  showToast('Treino iniciado. Escolha qualquer exercício que estiver disponível!', 'success');
}

async function startExercise() {
  const session = getActiveSession(view.workoutId);
  if (isSessionPaused(session)) {
    showToast('Retome o treino antes de iniciar o exercício.', 'warning');
    return;
  }
  const exerciseState = session?.exercises[view.exerciseId];
  if (!exerciseState) return;
  exerciseState.startedAt ||= new Date().toISOString();
  render();
  queuePersist();
}

function commitSessionHistory(session) {
  const date = session.localDate || session.completedAt?.slice(0, 10) || todayKey();
  Object.entries(session.exercises).forEach(([exerciseId, exerciseState]) => {
    const bestSet = exerciseState.sets
      .filter((set) => set.done)
      .sort((a, b) => Number(b.weight) - Number(a.weight))[0];
    if (!bestSet) return;

    const history = state.exerciseHistory[exerciseId] ||= [];
    const existingIndex = history.findIndex((entry) => entry.date === date);
    const snapshotExercise = session.snapshot?.exercises?.find((exercise) => exercise.id === exerciseId);
    const record = {
      date,
      weight: Number(bestSet.weight),
      reps: Number(bestSet.reps),
      name: snapshotExercise?.name || getExerciseName(exerciseId),
    };

    if (existingIndex >= 0) {
      const previous = history[existingIndex];
      history[existingIndex] = Number(record.weight) >= Number(previous.weight) ? record : { ...previous, name: previous.name || record.name };
    } else {
      history.push(record);
    }
  });
}

async function toggleSet(index) {
  const workout = getWorkout(view.workoutId);
  const exercise = getExercise(workout, view.exerciseId);
  const session = getActiveSession(view.workoutId);
  const exerciseState = session?.exercises[view.exerciseId];
  const set = exerciseState?.sets[index];
  if (!exercise || !set || exerciseState.completedAt) return;
  if (isSessionPaused(session)) {
    showToast('O treino está pausado. Retome para registrar a série.', 'warning');
    return;
  }

  exerciseState.startedAt ||= new Date().toISOString();
  exerciseState.notes ??= '';
  exerciseState.prCelebrated ??= 0;
  if (!set.done && (!set.weight || !set.reps)) {
    showToast('Preencha o peso e as repetições antes de concluir a série.', 'warning');
    return;
  }

  const previousPR = calculatePR(state.exerciseHistory[exercise.id] || []);
  let newPR = null;
  set.done = !set.done;
  if (set.done) {
    const allSetsDone = exerciseState.sets.every((item) => item.done);
    exerciseState.restUntil = allSetsDone
      ? null
      : new Date(Date.now() + exercise.restSeconds * 1000).toISOString();
    restOverlayDismissed = false;

    if (state.preferences?.autoCopyWeight) {
      const nextSet = exerciseState.sets[index + 1];
      if (nextSet && !nextSet.weight) nextSet.weight = String(set.weight);
    }

    const weight = Number(set.weight);
    if (previousPR > 0 && weight > previousPR && weight > exerciseState.prCelebrated) {
      exerciseState.prCelebrated = weight;
      newPR = { weight, exerciseName: exercise.name };
    }

    playTone('set');
    if (state.preferences?.vibrationEnabled && navigator.vibrate) navigator.vibrate(45);
  } else {
    exerciseState.restUntil = null;
  }

  render();
  queuePersist();
  if (newPR) {
    playTone('pr');
    if (state.preferences?.vibrationEnabled && navigator.vibrate) navigator.vibrate([80, 60, 120]);
    showPRCelebration(newPR.exerciseName, newPR.weight);
  }
}

async function completeExercise() {
  const session = getActiveSession(view.workoutId);
  const exerciseState = session?.exercises[view.exerciseId];
  if (isSessionPaused(session)) {
    showToast('Retome o treino antes de concluir o exercício.', 'warning');
    return;
  }
  if (!exerciseState || !exerciseState.sets.every((set) => set.done)) {
    showToast('Conclua todas as séries primeiro.', 'warning');
    return;
  }

  exerciseState.startedAt ||= new Date().toISOString();
  exerciseState.completedAt = new Date().toISOString();
  exerciseState.restUntil = null;
  navigate('workout', { workoutId: view.workoutId });
  queuePersist();
  showToast('Exercício concluído! Escolha o próximo que estiver livre.', 'success');
}

async function copyLastLoad() {
  const history = state.exerciseHistory[view.exerciseId] || [];
  const last = history.at(-1);
  const session = getActiveSession(view.workoutId);
  const exerciseState = session?.exercises[view.exerciseId];
  if (!last || !exerciseState) return;
  if (isSessionPaused(session)) {
    showToast('Retome o treino antes de alterar as séries.', 'warning');
    return;
  }

  exerciseState.sets.forEach((set) => {
    if (!set.done) {
      set.weight = String(last.weight);
      set.reps = String(last.reps);
    }
  });
  exerciseState.startedAt ||= new Date().toISOString();
  render();
  queuePersist();
  showToast('Última carga aplicada nas séries.', 'success');
}

async function cancelWorkout(workoutId) {
  if (!getActiveSession(workoutId)) return;
  const confirmed = await askConfirm({
    title: 'Cancelar treino?',
    message: 'As séries e anotações desta sessão serão descartadas.',
    confirmText: 'Cancelar treino',
    danger: true,
  });
  if (!confirmed) return;
  state.activeSession = null;
  await releaseWakeLock();
  await persist();
  navigate('workouts');
  showToast('Treino cancelado.', 'warning');
}

function calculateNewPRs(session) {
  let count = 0;
  const sessionDate = session.localDate || session.completedAt?.slice(0, 10) || todayKey();
  Object.entries(session.exercises).forEach(([exerciseId, exerciseState]) => {
    const weights = exerciseState.sets.filter((set) => set.done).map((set) => Number(set.weight));
    const currentBest = Math.max(0, ...weights);
    const historyWithoutToday = (state.exerciseHistory[exerciseId] || []).filter(
      (entry) => entry.date !== sessionDate,
    );
    if (currentBest > calculatePR(historyWithoutToday)) count += 1;
  });
  return count;
}

async function finishWorkout(workoutId) {
  const workout = getWorkout(workoutId);
  const session = getActiveSession(workoutId);
  if (!workout || !session) return;
  if (isSessionPaused(session)) {
    showToast('Retome o treino antes de finalizar.', 'warning');
    return;
  }
  const progress = workoutProgress(workout, session);
  if (progress.percent < 100) {
    showToast('Conclua todos os exercícios antes de finalizar.', 'warning');
    return;
  }

  const previousSameWorkout = [...state.sessions]
    .filter((item) => item.completedAt && item.workoutId === workoutId)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0];
  session.completedAt = new Date().toISOString();
  session.localDate = todayKey();
  const setCount = Object.values(session.exercises)
    .flatMap((exerciseState) => exerciseState.sets)
    .filter((set) => set.done).length;
  const totalVolume = calculateSessionVolume(session);

  const liftCandidates = Object.entries(session.exercises).flatMap(([exerciseId, exerciseState]) => (
    exerciseState.sets.filter((set) => set.done).map((set) => ({
      name: getExerciseName(exerciseId),
      weight: Number(set.weight) || 0,
    }))
  ));
  const bestLift = liftCandidates.sort((a, b) => b.weight - a.weight)[0] || null;

  lastSummary = {
    workoutTitle: workout.title,
    durationSeconds: sessionElapsed(session),
    exerciseCount: workout.exercises.length,
    setCount,
    totalVolume: Math.round(totalVolume),
    newPRs: calculateNewPRs(session),
    bestLift,
    volumeChangePercent: previousSameWorkout && calculateSessionVolume(previousSameWorkout) > 0
      ? Math.round(((totalVolume - calculateSessionVolume(previousSameWorkout)) / calculateSessionVolume(previousSameWorkout)) * 100)
      : null,
    rating: null,
    note: '',
  };
  session.summary = { ...lastSummary };
  lastSummary.sessionId = session.id;

  commitSessionHistory(session);
  state.sessions.push(session);
  state.activeSession = null;
  await releaseWakeLock();
  state.student.lastWorkout = 'Hoje';
  if (!state.activityDates.includes(todayKey())) state.activityDates.push(todayKey());
  const streaks = calculateStreaks();
  state.student.currentStreak = streaks.current;
  state.student.bestStreak = streaks.best;
  await persist();
  navigate('completion');
}

async function toggleWorkoutPause() {
  const session = state.activeSession;
  if (!session) return;
  const now = new Date();
  const pausing = !session.pausedAt;
  if (pausing) {
    session.pausedAt = now.toISOString();
    Object.values(session.exercises || {}).forEach((exerciseState) => {
      if (exerciseState.startedAt && !exerciseState.completedAt) exerciseState.pausedAt = session.pausedAt;
      if (exerciseState.restUntil) {
        exerciseState.restRemainingSeconds = Math.max(0, Math.ceil((new Date(exerciseState.restUntil) - now) / 1000));
        exerciseState.restUntil = null;
      }
    });
  } else {
    const pauseDuration = Math.max(0, Math.floor((now - new Date(session.pausedAt)) / 1000));
    session.pausedSeconds = (Number(session.pausedSeconds) || 0) + pauseDuration;
    session.pausedAt = null;
    Object.values(session.exercises || {}).forEach((exerciseState) => {
      if (exerciseState.pausedAt) {
        exerciseState.pausedSeconds = (Number(exerciseState.pausedSeconds) || 0)
          + Math.max(0, Math.floor((now - new Date(exerciseState.pausedAt)) / 1000));
        exerciseState.pausedAt = null;
      }
      if (exerciseState.restRemainingSeconds > 0) {
        exerciseState.restUntil = new Date(Date.now() + exerciseState.restRemainingSeconds * 1000).toISOString();
        exerciseState.restRemainingSeconds = 0;
      }
    });
  }
  render();
  queuePersist();
  if (pausing) {
    void releaseWakeLock();
    showToast('Treino pausado. Os cronômetros foram congelados.', 'warning');
  } else {
    void requestWakeLock();
    showToast('Treino retomado. Bora continuar!', 'success');
  }
}

async function completeOnboarding() {
  state.onboardingComplete = true;
  onboardingStep = 0;
  navigate('home');
  queuePersist();
}

function replayOnboarding() {
  onboardingStep = 0;
  navigate('onboarding');
}

async function nextOnboarding() {
  if (onboardingStep < 2) {
    onboardingStep += 1;
    render();
    return;
  }
  await completeOnboarding();
}

async function rateWorkout(rating) {
  const value = Number(rating);
  if (!lastSummary || value < 1 || value > 5) return;
  lastSummary.rating = value;
  const session = state.sessions.find((item) => item.id === lastSummary.sessionId) || state.sessions.at(-1);
  if (session?.summary) session.summary.rating = value;
  render();
  queuePersist();
  showToast('Percepção do treino registrada.', 'success');
}

async function saveSummaryNote(note) {
  if (!lastSummary) return;
  lastSummary.note = note;
  const session = state.sessions.find((item) => item.id === lastSummary.sessionId) || state.sessions.at(-1);
  if (session?.summary) session.summary.note = note;
  await persist();
}

async function saveProfile() {
  const displayName = document.querySelector('#profile-name')?.value.trim();
  const username = document.querySelector('#profile-username')?.value.trim().replace(/^@/, '');
  const bio = document.querySelector('#profile-bio')?.value.trim() || '';
  const discoverable = Boolean(document.querySelector('#profile-discoverable')?.checked);
  if (!displayName || !username) { showToast('Preencha nome e @usuário.', 'warning'); return; }
  try {
    const profile = await repository.updateProfile({ displayName, username, bio, discoverable });
    state.student.name = profile.display_name;
    state.student.username = profile.username;
    state.student.bio = profile.bio || '';
    state.student.discoverable = profile.discoverable !== false;
    await persist();
    render();
    showToast('Perfil atualizado.', 'success');
  } catch (error) { showToast(error?.message || 'Não foi possível atualizar o perfil.', 'warning'); }
}

function freshSharedPlan(plan) {
  const copy = repository.sanitizePlan(plan);
  copy.days = (copy.days || []).map((day) => ({
    ...day,
    id: safeId('day'),
    exercises: (day.exercises || []).map((exercise) => ({ ...exercise, id: safeId('exercise') })),
  }));
  return copy;
}

async function importSharedPlan(shareId) {
  const share = collabState.dashboard?.received_plans?.find((item) => item.id === shareId);
  if (!share?.plan?.days?.length) return;
  const confirmed = await askConfirm({ title: 'Adicionar esta ficha?', message: `Os ${share.plan.days.length} dias serão adicionados aos seus treinos atuais.`, confirmText: 'Adicionar ficha' });
  if (!confirmed) return;
  const incoming = freshSharedPlan(share.plan);
  state.workoutPlan.days.push(...incoming.days);
  await persist();
  await repository.markShareImported(shareId);
  await loadCollabs();
  showToast('Ficha adicionada aos seus treinos!', 'success');
}

async function shareCurrentPlan(targetUserId, targetName) {
  if (!state.workoutPlan.days.length) { showToast('Monte pelo menos um treino antes de compartilhar.', 'warning'); return; }
  try {
    await repository.sharePlan(targetUserId, state.workoutPlan, state.workoutPlan.name || 'Minha ficha');
    showToast(`Ficha compartilhada com ${targetName}.`, 'success');
    await loadCollabs();
  } catch (error) { showToast(error?.message || 'Não foi possível compartilhar.', 'warning'); }
}

async function logout() {
  const confirmed = await askConfirm({ title: 'Sair da conta?', message: 'Seus dados já estão sincronizados e continuarão salvos.', confirmText: 'Sair' });
  if (!confirmed) return;
  await repository.signOut();
  authSession = null;
  state = null;
  authMode = 'login';
  authMessage = '';
  render();
}

function findDraftDay(dayId) {
  return planDraft?.days.find((day) => day.id === dayId);
}

function findDraftExercise(dayId, exerciseId) {
  return findDraftDay(dayId)?.exercises.find((exercise) => exercise.id === exerciseId);
}

function openPlanEditor() {
  planDraft = cloneData(state.workoutPlan);
  navigate('planEditor');
}

async function discardPlanEditor() {
  if (planDraft && JSON.stringify(planDraft) !== JSON.stringify(state.workoutPlan)) {
    const confirmed = await askConfirm({
      title: 'Descartar alterações?',
      message: 'As mudanças feitas na ficha ainda não foram salvas.',
      confirmText: 'Descartar',
      danger: true,
    });
    if (!confirmed) return;
  }
  planDraft = null;
  navigate('profile');
}

function defaultExpiryDate() {
  const base = planDraft?.startsAt ? new Date(`${planDraft.startsAt}T12:00:00`) : new Date();
  base.setDate(base.getDate() + 90);
  return localDateKey(base);
}

function togglePlanExpiry(enabled) {
  if (!planDraft) return;
  planDraft.expiresAt = enabled ? '' : (planDraft.expiresAt || defaultExpiryDate());
  render();
}

function applyWorkoutPreset(dayId, presetId) {
  const day = findDraftDay(dayId);
  const preset = WORKOUT_PRESETS.find((item) => item.id === presetId);
  if (!day || !preset) return;
  const genericTitle = !day.title || /^novo treino/i.test(day.title);
  day.icon = preset.icon;
  day.accent = preset.accent;
  day.focus = preset.focus;
  if (genericTitle) {
    day.title = preset.title;
    day.shortTitle = preset.label;
  }
  render();
  setTimeout(() => document.querySelector(`#editor-day-${dayId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30);
}

function setWorkoutEmoji(dayId, emoji) {
  const day = findDraftDay(dayId);
  if (!day || !WORKOUT_EMOJI_PRESETS.includes(emoji)) return;
  day.icon = emoji;
  render();
  setTimeout(() => document.querySelector(`#editor-day-${dayId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30);
}

function addDraftDay() {
  planDraft ||= cloneData(state.workoutPlan);
  const accents = ['red', 'green', 'blue', 'yellow'];
  planDraft.days.push({
    id: safeId('dia'),
    title: `Novo treino ${planDraft.days.length + 1}`,
    shortTitle: 'Novo treino',
    accent: accents[planDraft.days.length % accents.length],
    focus: 'auto',
    icon: '🏋️',
    estimatedMinutes: 60,
    exercises: [{
      id: safeId('exercicio'),
      name: 'Novo exercício',
      sets: 3,
      minReps: 8,
      maxReps: 12,
      restSeconds: 90,
      muscles: [],
      tip: '',
    }],
  });
  render();
  setTimeout(() => document.querySelector('.editor-day-card:last-of-type input')?.focus(), 0);
}

function addDraftExercise(dayId) {
  const day = findDraftDay(dayId);
  if (!day) return;
  day.exercises.push({
    id: safeId('exercicio'),
    name: 'Novo exercício',
    sets: 3,
    minReps: 8,
    maxReps: 12,
    restSeconds: 90,
    muscles: [],
    tip: '',
  });
  render();
  setTimeout(() => document.querySelector(`[data-day-id="${dayId}"] .editor-exercise-row:last-child .exercise-name-input`)?.select(), 0);
}

function duplicateDraftDay(dayId) {
  const day = findDraftDay(dayId);
  if (!day) return;
  const copy = cloneData(day);
  copy.id = safeId('dia');
  copy.title = `${day.title} — cópia`;
  copy.exercises = copy.exercises.map((exercise) => ({ ...exercise, id: safeId('exercicio') }));
  const index = planDraft.days.findIndex((item) => item.id === dayId);
  planDraft.days.splice(index + 1, 0, copy);
  render();
  setTimeout(() => document.querySelector(`#editor-day-${copy.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
}

function duplicateDraftExercise(dayId, exerciseId) {
  const day = findDraftDay(dayId);
  const exercise = findDraftExercise(dayId, exerciseId);
  if (!day || !exercise) return;
  const index = day.exercises.findIndex((item) => item.id === exerciseId);
  day.exercises.splice(index + 1, 0, { ...cloneData(exercise), id: safeId('exercicio'), name: `${exercise.name} — cópia` });
  render();
}

function jumpToEditorDay(dayId) {
  document.querySelector(`#editor-day-${dayId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function dismissCoachForToday() {
  state.preferences.coachDismissedDate = todayKey();
  render();
  queuePersist();
}

async function removeDraftDay(dayId) {
  const day = findDraftDay(dayId);
  if (!day) return;
  if (planDraft.days.length === 1) {
    showToast('A ficha precisa ter pelo menos um dia.', 'warning');
    return;
  }
  const confirmed = await askConfirm({
    title: 'Excluir este dia?',
    message: `${day.title} e seus ${day.exercises.length} exercícios serão removidos da ficha.`,
    confirmText: 'Excluir dia',
    danger: true,
  });
  if (!confirmed) return;
  planDraft.days = planDraft.days.filter((item) => item.id !== dayId);
  render();
}

function removeDraftExercise(dayId, exerciseId) {
  const day = findDraftDay(dayId);
  if (!day) return;
  if (day.exercises.length === 1) {
    showToast('Cada dia precisa ter pelo menos um exercício.', 'warning');
    return;
  }
  day.exercises = day.exercises.filter((exercise) => exercise.id !== exerciseId);
  render();
}

function moveDraftItem(collection, itemId, direction) {
  const index = collection.findIndex((item) => item.id === itemId);
  const destination = index + Number(direction);
  if (index < 0 || destination < 0 || destination >= collection.length) return;
  const [item] = collection.splice(index, 1);
  collection.splice(destination, 0, item);
  render();
}

function normalizePlanDraft() {
  planDraft.name = String(planDraft.name || '').trim();
  planDraft.weeklyGoal = Math.max(1, Math.min(7, Number(planDraft.weeklyGoal) || planDraft.days.length || 3));
  planDraft.days.forEach((day) => {
    day.title = String(day.title || '').trim();
    day.shortTitle = day.title.split(',')[0].trim() || day.title;
    day.icon = String(day.icon || '🏋️').trim() || '🏋️';
    day.focus = ['auto','legs','chest','back','shoulders','arms','core','cardio','full'].includes(day.focus) ? day.focus : 'auto';
    day.estimatedMinutes = Math.max(10, Math.min(180, Number(day.estimatedMinutes) || 60));
    day.exercises.forEach((exercise) => {
      exercise.name = String(exercise.name || '').trim();
      exercise.sets = Math.max(1, Math.min(10, Number(exercise.sets) || 3));
      exercise.minReps = Math.max(1, Math.min(100, Number(exercise.minReps) || 8));
      exercise.maxReps = Math.max(exercise.minReps, Math.min(100, Number(exercise.maxReps) || exercise.minReps));
      exercise.restSeconds = Math.max(15, Math.min(600, Number(exercise.restSeconds) || 90));
    });
  });
}

async function savePlanDraft() {
  if (!planDraft) return;
  normalizePlanDraft();
  if (!planDraft.name) {
    showToast('Digite um nome para a ficha.', 'warning');
    return;
  }
  if (!planDraft.days.length || planDraft.days.some((day) => !day.title || !day.exercises.length || day.exercises.some((exercise) => !exercise.name))) {
    showToast('Preencha todos os dias e exercícios antes de salvar.', 'warning');
    return;
  }
  if (planDraft.startsAt && planDraft.expiresAt && planDraft.startsAt > planDraft.expiresAt) {
    showToast('A validade precisa ser posterior à data de início.', 'warning');
    return;
  }
  state.workoutPlan = repository.sanitizePlan(planDraft);
  await persist();
  planDraft = null;
  workoutSearch = '';
  workoutFilter = 'all';
  navigate('workouts');
  showToast('Seus treinos foram atualizados e sincronizados.', 'success');
}

async function togglePreference(key) {
  if (!(key in state.preferences)) return;
  state.preferences[key] = !state.preferences[key];
  render();
  queuePersist();
  if (key === 'keepAwakeEnabled') {
    if (state.preferences[key]) void requestWakeLock();
    else void releaseWakeLock();
  }
  if (key === 'soundEnabled' && state.preferences[key]) playTone('set');
}

async function setThemePreference(theme) {
  const normalized = ALLOWED_THEMES.has(theme) ? theme : 'system';
  applyTheme(normalized);
  if (state) {
    state.preferences.theme = normalized;
    state.preferences.themePreferenceInitialized = true;
  }
  render();
  if (state) queuePersist();
}

async function cycleThemePreference() {
  await setThemePreference(nextThemePreference());
}

async function installApp() {
  if (isStandaloneApp()) {
    showToast('O Easy Train já está adicionado neste dispositivo.', 'success');
    return;
  }

  if (!deferredInstallPrompt) {
    showInstallGuide();
    return;
  }

  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;

  if (choice.outcome === 'accepted') {
    appInstalledThisSession = true;
    showToast('Easy Train adicionado com sucesso!', 'success');
  } else {
    showToast('Instalação cancelada. Você pode adicionar depois.', 'warning');
  }
  render();
}

function updateVisibleTimers() {
  const session = state?.activeSession;
  const totalElement = document.querySelector('#total-timer');
  if (totalElement && session) totalElement.textContent = formatDuration(sessionElapsed(session));

  if (view.name === 'exercise' && session) {
    const exerciseState = session.exercises[view.exerciseId];
    const exerciseElement = document.querySelector('#exercise-timer');
    if (exerciseElement) {
      exerciseElement.textContent = formatDuration(exerciseElapsed(exerciseState));
    }
    const restElement = document.querySelector('#rest-timer');
    const remaining = isSessionPaused(session)
      ? Number(exerciseState?.restRemainingSeconds) || 0
      : exerciseState?.restUntil
        ? Math.max(0, Math.ceil((new Date(exerciseState.restUntil) - Date.now()) / 1000))
        : 0;
    if (restElement) restElement.textContent = formatDuration(remaining);
    const overlayTimer = document.querySelector('#rest-overlay-timer');
    if (overlayTimer) overlayTimer.textContent = formatDuration(remaining);
    const ring = document.querySelector('#rest-ring');
    if (ring) {
      const total = Math.max(1, Number(ring.dataset.total));
      ring.style.strokeDashoffset = String(301.59 * (1 - Math.min(1, remaining / total)));
    }
    if (remaining === 0 && exerciseState?.restUntil) {
      exerciseState.restUntil = null;
      restOverlayDismissed = false;
      queuePersist();
      playTone('rest');
      if (state.preferences?.vibrationEnabled && navigator.vibrate) navigator.vibrate([100, 70, 100]);
      showToast('Descanso finalizado. Próxima série!', 'success');
      render();
    }
  }
}

app.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  const workoutId = target.dataset.workoutId;
  const exerciseId = target.dataset.exerciseId;

  const actions = {
    'next-onboarding': () => nextOnboarding(),
    'skip-onboarding': () => completeOnboarding(),
    'go-home': () => navigate('home'),
    'go-workouts': () => navigate('workouts'),
    'go-evolution': () => navigate('evolution'),
    'go-history': () => navigate('history'),
    'open-session-detail': () => navigate('sessionDetail', { sessionId: target.dataset.sessionId }),
    'go-streak': () => navigate('streak'),
    'go-profile': () => navigate('profile'),
    'go-collab': () => navigate('collab'),
    'go-competitions': () => navigate('competitions'),
    'auth-login-mode': async () => {
      if (authMode === 'recovery') { await repository.signOut(); authSession = null; state = null; }
      authMode = 'login'; authMessage = ''; render();
    },
    'auth-register-mode': () => { authMode = 'register'; authMessage = ''; render(); },
    'auth-reset-mode': () => { authMode = 'reset'; authMessage = ''; render(); },
    'open-plan-editor': () => openPlanEditor(),
    'discard-plan-editor': () => discardPlanEditor(),
    'open-workout': () => navigate('workout', { workoutId: workoutId || view.workoutId }),
    'start-workout': () => startWorkout(workoutId),
    'open-exercise': () => navigate('exercise', { workoutId, exerciseId }),
    'start-exercise': () => startExercise(),
    'toggle-workout-pause': () => toggleWorkoutPause(),
    'toggle-set': () => toggleSet(Number(target.dataset.setIndex)),
    'complete-exercise': () => completeExercise(),
    'copy-last-load': () => copyLastLoad(),
    'open-rest-overlay': () => { restOverlayDismissed = false; render(); },
    'minimize-rest': () => { restOverlayDismissed = true; render(); },
    'adjust-rest': async () => {
      const session = getActiveSession(view.workoutId);
      const exerciseState = session?.exercises[view.exerciseId];
      if (!exerciseState?.restUntil) return;
      const adjustment = Number(target.dataset.seconds || 0) * 1000;
      exerciseState.restUntil = new Date(Math.max(Date.now(), new Date(exerciseState.restUntil).getTime() + adjustment)).toISOString();
      render();
      queuePersist();
    },
    'skip-rest': async () => {
      const session = getActiveSession(view.workoutId);
      if (session?.exercises[view.exerciseId]) session.exercises[view.exerciseId].restUntil = null;
      restOverlayDismissed = false;
      render();
      queuePersist();
    },
    'focus-exercise-list': () => document.querySelector('#exercise-list')?.scrollIntoView({ behavior: 'auto', block: 'start' }),
    'set-workout-filter': () => { workoutFilter = target.dataset.filter || 'all'; render(); },
    'clear-workout-search': () => { workoutSearch = ''; render(); setTimeout(() => document.querySelector('#workout-search')?.focus(), 0); },
    'reset-workout-filters': () => { workoutSearch = ''; workoutFilter = 'all'; render(); },
    'add-day': () => addDraftDay(),
    'duplicate-day': () => duplicateDraftDay(target.dataset.dayId),
    'duplicate-exercise': () => duplicateDraftExercise(target.dataset.dayId, target.dataset.exerciseId),
    'apply-workout-preset': () => applyWorkoutPreset(target.dataset.dayId, target.dataset.presetId),
    'set-workout-emoji': () => setWorkoutEmoji(target.dataset.dayId, target.dataset.emoji),
    'jump-editor-day': () => jumpToEditorDay(target.dataset.dayId),
    'dismiss-coach': () => dismissCoachForToday(),
    'remove-day': () => removeDraftDay(target.dataset.dayId),
    'move-day': () => moveDraftItem(planDraft.days, target.dataset.dayId, target.dataset.direction),
    'add-exercise': () => addDraftExercise(target.dataset.dayId),
    'remove-exercise': () => removeDraftExercise(target.dataset.dayId, target.dataset.exerciseId),
    'move-exercise': () => moveDraftItem(findDraftDay(target.dataset.dayId)?.exercises || [], target.dataset.exerciseId, target.dataset.direction),
    'save-plan': () => savePlanDraft(),
    'cancel-workout': () => cancelWorkout(workoutId),
    'finish-workout': () => finishWorkout(workoutId),
    'rate-workout': () => rateWorkout(target.dataset.rating),
    'save-profile': () => saveProfile(),
    'logout': () => logout(),
    'send-collab': async () => { try { await repository.sendCollabRequest(target.dataset.userId); showToast('Solicitação enviada!', 'success'); collabState.searchResults = []; await loadCollabs(); } catch (error) { showToast(error.message, 'warning'); } },
    'respond-collab': async () => { try { await repository.respondCollabRequest(target.dataset.requestId, target.dataset.accept === 'true'); await loadCollabs(); showToast(target.dataset.accept === 'true' ? 'Collab aceita!' : 'Solicitação recusada.', 'success'); } catch (error) { showToast(error.message, 'warning'); } },
    'share-plan': () => shareCurrentPlan(target.dataset.userId, target.dataset.userName),
    'import-shared-plan': () => importSharedPlan(target.dataset.shareId),
    'respond-competition': async () => { try { await repository.respondCompetition(target.dataset.competitionId, target.dataset.accept === 'true'); await loadCompetitions(); } catch (error) { showToast(error.message, 'warning'); } },
    'toggle-preference': () => togglePreference(target.dataset.preference),
    'set-theme': () => setThemePreference(target.dataset.themeValue),
    'cycle-theme': () => cycleThemePreference(),
    'install-app': () => installApp(),
    'replay-onboarding': () => replayOnboarding(),
    'retry-cloud': () => bootstrap(),
  };

  await actions[action]?.();
});

app.addEventListener('input', (event) => {
  if (event.target.matches('#workout-search')) {
    workoutSearch = event.target.value;
    const caret = event.target.selectionStart;
    cancelAnimationFrame(workoutSearchFrame);
    workoutSearchFrame = requestAnimationFrame(() => {
      render();
      const restored = document.querySelector('#workout-search');
      restored?.focus({ preventScroll: true });
      restored?.setSelectionRange(caret, caret);
    });
    return;
  }

  if (event.target.matches('[data-plan-no-expiry]')) {
    togglePlanExpiry(event.target.checked);
    return;
  }

  const editorInput = event.target.closest('[data-editor-kind][data-field]');
  if (editorInput && planDraft) {
    const kind = editorInput.dataset.editorKind;
    const field = editorInput.dataset.field;
    const value = editorInput.type === 'number' ? Number(editorInput.value) : editorInput.type === 'checkbox' ? editorInput.checked : editorInput.value;
    if (kind === 'plan') planDraft[field] = value;
    if (kind === 'day') {
      const day = findDraftDay(editorInput.dataset.dayId);
      if (day) day[field] = value;
    }
    if (kind === 'exercise') {
      const exercise = findDraftExercise(editorInput.dataset.dayId, editorInput.dataset.exerciseId);
      if (exercise) exercise[field] = value;
    }
    return;
  }

  const summaryNote = event.target.closest('[data-summary-note]');
  if (summaryNote) {
    saveSummaryNote(summaryNote.value);
    return;
  }

  const notes = event.target.closest('[data-exercise-notes]');
  if (notes) {
    const session = getActiveSession(view.workoutId);
    const exerciseState = session?.exercises[view.exerciseId];
    if (!exerciseState) return;
    exerciseState.notes = notes.value;
    const counter = document.querySelector('#notes-count');
    if (counter) counter.textContent = String(notes.value.length);
    persist();
    return;
  }

  const input = event.target.closest('[data-set-index][data-field]');
  if (!input) return;
  const session = getActiveSession(view.workoutId);
  const set = session?.exercises[view.exerciseId]?.sets[Number(input.dataset.setIndex)];
  if (!set || isSessionPaused(session)) return;
  set[input.dataset.field] = input.value;
  persist();
});

app.addEventListener('change', (event) => {
  if (event.target.matches('#evolution-exercise')) {
    navigate('evolution', { exerciseId: event.target.value });
    return;
  }
  if (event.target.matches('#history-filter')) {
    historyFilter = event.target.value;
    render();
    return;
  }
  const editorInput = event.target.closest('[data-editor-kind][data-field]');
  if (editorInput && planDraft) {
    const kind = editorInput.dataset.editorKind;
    const field = editorInput.dataset.field;
    const value = editorInput.type === 'number' ? Number(editorInput.value) : editorInput.type === 'checkbox' ? editorInput.checked : editorInput.value;
    if (kind === 'plan') planDraft[field] = value;
    if (kind === 'day') {
      const day = findDraftDay(editorInput.dataset.dayId);
      if (day) day[field] = value;
    }
    if (kind === 'exercise') {
      const exercise = findDraftExercise(editorInput.dataset.dayId, editorInput.dataset.exerciseId);
      if (exercise) exercise[field] = value;
    }
  }
});


app.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'auth-form') {
    const data = new FormData(form);
    const mode = form.dataset.mode || 'login';
    const email = String(data.get('email') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    const button = form.querySelector('button[type="submit"]');
    const rememberLogin = mode === 'login' ? data.get('rememberLogin') === 'on' : true;
    button.disabled = true;
    try {
      if (mode === 'reset') {
        await repository.requestPasswordReset(email);
        authMode = 'login';
        authMessage = 'Caso esse e-mail esteja cadastrado, você receberá um link para criar uma nova senha.';
        render();
        return;
      }

      if (mode === 'recovery') {
        const confirmPassword = String(data.get('confirmPassword') || '');
        if (password.length < 6) throw new Error('Use uma senha com pelo menos 6 caracteres.');
        if (password !== confirmPassword) throw new Error('As senhas não são iguais.');
        await repository.updatePassword(password);
        await repository.signOut();
        authSession = null;
        authMode = 'login';
        authMessage = 'Senha atualizada. Entre novamente com a nova senha.';
        render();
        return;
      }

      if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');

      if (mode === 'register') {
        const displayName = String(data.get('displayName') || '').trim();
        const username = String(data.get('username') || '').trim().replace(/^@/, '');
        const confirmPassword = String(data.get('confirmPassword') || '');
        if (password !== confirmPassword) throw new Error('As senhas não são iguais.');
        const result = await repository.signUp({ displayName, username, email, password, remember: true });
        if (!result.session) {
          authMode = 'login';
          authMessage = 'Conta criada! Confirme o e-mail e depois entre.';
          render();
          return;
        }
      } else {
        await repository.signIn(email, password, { remember: rememberLogin });
      }

      authSession = await repository.getSession();
      state = await repository.getAppState();
      applyTheme(state.preferences?.theme || themePreference);
      authMessage = '';
      view = state.onboardingComplete ? { name: 'home' } : { name: 'onboarding' };
      render();
    } catch (error) {
      authMessage = error?.message || 'Não foi possível concluir esta ação.';
      render();
    } finally { button.disabled = false; }
    return;
  }
  if (form.id === 'people-search-form') {
    const query = String(new FormData(form).get('query') || '').trim();
    try { collabState.searchResults = await repository.searchPeople(query); render(); }
    catch (error) { showToast(error.message, 'warning'); }
    return;
  }
  if (form.id === 'competition-create-form') {
    const data = new FormData(form);
    try {
      const result = await repository.createCompetition({
        title: String(data.get('title') || '').trim(),
        description: String(data.get('description') || '').trim(),
        metric: String(data.get('metric') || 'workouts'),
        startDate: String(data.get('startDate') || ''),
        endDate: String(data.get('endDate') || ''),
        inviteUserIds: data.getAll('inviteUser'),
      });
      showToast(`Disputa criada! Código ${result.invite_code}`, 'success');
      form.reset();
      await loadCompetitions();
    } catch (error) { showToast(error.message, 'warning'); }
    return;
  }
  if (form.id === 'competition-join-form') {
    const code = String(new FormData(form).get('code') || '').trim();
    try { await repository.joinCompetition(code); form.reset(); await loadCompetitions(); showToast('Você entrou na disputa!', 'success'); }
    catch (error) { showToast(error.message, 'warning'); }
  }
});

document.addEventListener('click', (event) => {
  const choice = event.target.closest('[data-confirm-choice]')?.dataset.confirmChoice;
  if (choice) {
    closeConfirm(choice);
    return;
  }
  if (event.target.classList?.contains('confirm-overlay')) closeConfirm('cancel');
  if (event.target.closest('[data-close-install-guide]') || event.target.classList?.contains('install-guide-overlay')) {
    closeInstallGuide();
  }
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && view.name === 'planEditor') {
    event.preventDefault();
    savePlanDraft();
    return;
  }
  if (event.key !== 'Escape') return;
  if (confirmResolver) closeConfirm('cancel');
  else closeInstallGuide();
});

function bindInstallEvents() {
  if (window.__easyTrainInstallEventsBound) return;
  window.__easyTrainInstallEventsBound = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (view.name === 'home' || view.name === 'profile') render();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    appInstalledThisSession = true;
    closeInstallGuide();
    showToast('Easy Train adicionado à tela inicial!', 'success');
    if (view.name === 'home' || view.name === 'profile') render();
  });
}

async function bootstrap() {
  repository.discardPendingSaves('Sincronização reiniciada.');
  cloudView = { loading: true, error: '' };
  state = null;
  render();
  try {
    const callback = repository.consumeAuthCallback();
    if (callback.type === 'recovery') authMode = 'recovery';
    authSession = await repository.getSession();
    if (!authSession) {
      cloudView = { loading: false, error: '' };
      view = { name: 'auth', workoutId: null, exerciseId: null, sessionId: null };
    } else if (authMode === 'recovery') {
      cloudView = { loading: false, error: '' };
      view = { name: 'auth', workoutId: null, exerciseId: null, sessionId: null };
    } else {
      state = await repository.getAppState();
      applyTheme(state.preferences?.theme || themePreference);
      cloudView = { loading: false, error: '' };
      view = state.onboardingComplete ? { name: 'home', workoutId: null, exerciseId: null, sessionId: null } : { name: 'onboarding', workoutId: null, exerciseId: null, sessionId: null };
    }
  } catch (error) {
    state = null;
    cloudView = { loading: false, error: error?.message || 'Não foi possível conectar ao Easy Train.' };
  }

  if (!runtimeBound) {
    runtimeBound = true;
    window.addEventListener('beforeunload', (event) => { if (!state?.activeSession) return; event.preventDefault(); event.returnValue = ''; });
    window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
      if (themePreference === 'system') applyTheme('system', { persistLocal: false });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') repository.flush().catch(() => {});
      if (document.visibilityState === 'visible' && state?.activeSession) requestWakeLock();
    });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    timerInterval = setInterval(updateVisibleTimers, 1000);
  }
  render();
  if (state?.activeSession) requestWakeLock();
}

bindInstallEvents();
bootstrap();
