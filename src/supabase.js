const config = window.__SUPABASE_CONFIG__ || {};
const supabaseUrl = String(config.url || '').replace(/\/$/, '');
const supabaseAnonKey = String(config.anonKey || '');
const SESSION_KEY = 'easy-train-auth-session-v3';
const REMEMBER_LOGIN_KEY = 'easy-train-remember-login-v1';
const REMEMBER_EMAIL_KEY = 'easy-train-remember-email-v1';
const REQUEST_TIMEOUT_MS = 20000;

export const supabaseEnabled = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)
  && /^(sb_publishable_|eyJ)[A-Za-z0-9._-]+$/.test(supabaseAnonKey);

function parseJwt(token) {
  try {
    const raw = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = raw.padEnd(Math.ceil(raw.length / 4) * 4, '=');
    return JSON.parse(decodeURIComponent(atob(padded).split('').map((character) => (
      `%${(`00${character.charCodeAt(0).toString(16)}`).slice(-2)}`
    )).join('')));
  } catch {
    return null;
  }
}

async function parseResponse(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function createRequestError(payload, fallback, status = 0) {
  const message = typeof payload === 'string'
    ? payload
    : payload?.msg || payload?.message || payload?.error_description || payload?.error || fallback;
  const error = new Error(message || fallback);
  error.status = status;
  error.code = payload?.code || '';
  error.hint = payload?.hint || '';
  return error;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('A conexão demorou demais. Tente novamente.');
    throw new Error('Não foi possível acessar o servidor. Confira sua internet.');
  } finally {
    clearTimeout(timer);
  }
}

function parseStoredSession(storage) {
  try {
    const value = JSON.parse(storage.getItem(SESSION_KEY) || 'null');
    return value?.access_token ? value : null;
  } catch {
    storage.removeItem(SESSION_KEY);
    return null;
  }
}

export function getRememberLogin() {
  return localStorage.getItem(REMEMBER_LOGIN_KEY) !== 'false';
}

export function getRememberedEmail() {
  return localStorage.getItem(REMEMBER_EMAIL_KEY) || '';
}

export function setRememberLogin(enabled, email = '') {
  const remember = Boolean(enabled);
  localStorage.setItem(REMEMBER_LOGIN_KEY, remember ? 'true' : 'false');

  const current = parseStoredSession(localStorage) || parseStoredSession(sessionStorage);
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  if (current) (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(current));

  if (remember && email) localStorage.setItem(REMEMBER_EMAIL_KEY, String(email).trim().toLowerCase());
  if (!remember) localStorage.removeItem(REMEMBER_EMAIL_KEY);
}

function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

function storeSession(session) {
  if (!session?.access_token) {
    clearStoredSession();
    return null;
  }
  const expiresAt = session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
  const normalized = { ...session, expires_at: expiresAt };
  const storage = getRememberLogin() ? localStorage : sessionStorage;
  const otherStorage = storage === localStorage ? sessionStorage : localStorage;
  otherStorage.removeItem(SESSION_KEY);
  storage.setItem(SESSION_KEY, JSON.stringify(normalized));
  return normalized;
}

function readStoredSession() {
  const preferredStorage = getRememberLogin() ? localStorage : sessionStorage;
  const fallbackStorage = preferredStorage === localStorage ? sessionStorage : localStorage;
  const preferred = parseStoredSession(preferredStorage);
  if (preferred) return preferred;

  const fallback = parseStoredSession(fallbackStorage);
  if (!fallback) return null;
  preferredStorage.setItem(SESSION_KEY, JSON.stringify(fallback));
  fallbackStorage.removeItem(SESSION_KEY);
  return fallback;
}

function assertConfigured() {
  if (!supabaseEnabled) {
    throw new Error('Supabase não configurado. Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.');
  }
}

async function authRequest(path, { method = 'POST', body, token } = {}) {
  assertConfigured();
  const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/${path}`, {
    method,
    headers: {
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await parseResponse(response);
  if (!response.ok) throw createRequestError(payload, `Erro de autenticação (${response.status}).`, response.status);
  return payload;
}

export async function signUp({ email, password, displayName, username, remember = true }) {
  setRememberLogin(remember, email);
  const redirectTo = encodeURIComponent(`${window.location.origin}/`);
  const result = await authRequest(`signup?redirect_to=${redirectTo}`, {
    body: {
      email,
      password,
      data: { display_name: displayName, full_name: displayName, username },
    },
  });
  if (result?.access_token) storeSession(result);
  return result;
}

export async function signInWithPassword(email, password, { remember = true } = {}) {
  setRememberLogin(remember, email);
  const result = await authRequest('token?grant_type=password', { body: { email, password } });
  storeSession(result);
  return result;
}

export async function refreshSession(refreshToken) {
  const result = await authRequest('token?grant_type=refresh_token', { body: { refresh_token: refreshToken } });
  storeSession(result);
  return result;
}

export async function getSession() {
  const session = readStoredSession();
  if (!session) return null;
  const payload = parseJwt(session.access_token);
  const expiresAt = Number(session.expires_at || payload?.exp || 0);
  if (expiresAt > Math.floor(Date.now() / 1000) + 60) return session;
  if (!session.refresh_token) {
    storeSession(null);
    return null;
  }
  try { return await refreshSession(session.refresh_token); }
  catch {
    storeSession(null);
    return null;
  }
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  try {
    return await authRequest('user', { method: 'GET', token: session.access_token });
  } catch {
    return null;
  }
}

export function consumeAuthCallback() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const accessToken = hash.get('access_token') || query.get('access_token');
  const refreshToken = hash.get('refresh_token') || query.get('refresh_token');
  const type = hash.get('type') || query.get('type') || '';

  if (!accessToken) return { type: '', session: null };

  const session = storeSession({
    access_token: accessToken,
    refresh_token: refreshToken || '',
    token_type: hash.get('token_type') || 'bearer',
    expires_in: Number(hash.get('expires_in') || 3600),
    expires_at: Number(hash.get('expires_at') || 0) || undefined,
  });

  window.history.replaceState({}, document.title, window.location.pathname);
  return { type, session };
}

export async function requestPasswordReset(email) {
  const redirectTo = encodeURIComponent(`${window.location.origin}/`);
  await authRequest(`recover?redirect_to=${redirectTo}`, { body: { email } });
  return true;
}

export async function updatePassword(password) {
  const session = await getSession();
  if (!session) throw new Error('O link de recuperação expirou. Solicite outro.');
  return authRequest('user', { method: 'PUT', token: session.access_token, body: { password } });
}

export async function signOut() {
  const session = readStoredSession();
  try {
    if (session?.access_token) await authRequest('logout', { method: 'POST', token: session.access_token });
  } finally {
    clearStoredSession();
  }
}

export async function supabaseRequest(path, options = {}) {
  assertConfigured();
  const session = await getSession();
  if (!session) throw new Error('Sua sessão expirou. Entre novamente.');
  const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...options.headers,
    },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  const payload = await parseResponse(response);
  if (response.status === 401) {
    storeSession(null);
    throw new Error('Sua sessão expirou. Entre novamente.');
  }
  if (!response.ok) throw createRequestError(payload, `Erro Supabase (${response.status}).`, response.status);
  return payload;
}

export async function supabaseRpc(functionName, body = {}) {
  return supabaseRequest(`rpc/${functionName}`, { method: 'POST', body });
}

export async function supabaseAnonRpc(functionName, body = {}) {
  assertConfigured();
  const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await parseResponse(response);
  if (!response.ok) throw createRequestError(payload, `Erro Supabase (${response.status}).`, response.status);
  return payload;
}
