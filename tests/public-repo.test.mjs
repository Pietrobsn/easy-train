import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import net from 'node:net';

const read = (file) => readFile(file, 'utf8');

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, attempts = 40) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* servidor ainda iniciando */ }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`Servidor não iniciou em ${url}`);
}

test('repositório não contém configuração real nem segredo de servidor', async () => {
  const files = [
    'config.js', '.env.example', 'README.md', 'src/supabase.js', 'src/repository.js',
    'supabase/INSTALL_ALL.sql', 'supabase/MIGRATE_FROM_V2.sql',
  ];
  const contents = await Promise.all(files.map(read));
  const content = contents.join('\n');
  const publicConfig = contents[0];
  assert.match(publicConfig, /url:\s*['"]{2}/);
  assert.match(publicConfig, /anonKey:\s*['"]{2}/);
  assert.doesNotMatch(content, /service_role\s*[:=]\s*['"][^'"]+/i);
  assert.doesNotMatch(content, /sb_secret_[A-Za-z0-9_-]{12,}/i);
});

test('frontend contém defesas essenciais para dados compartilhados', async () => {
  const [app, repository] = await Promise.all([read('src/app.js'), read('src/repository.js')]);
  assert.match(app, /function escapeHtml/);
  assert.match(repository, /function neutralText/);
  assert.match(repository, /sanitizePlan/);
  assert.match(app, /localDate: todayKey\(\)/);
  assert.match(app, /STATE_CONFLICT/);
  assert.match(app, /workout\.exercises\.length === 0|!workout\.exercises\.length/);
  assert.doesNotMatch(app, />\$\{getExerciseName\(/);
});

test('SQL recalcula volume e usa a data local nas competições', async () => {
  const [schema, functions, migration] = await Promise.all([
    read('supabase/parts/01_SCHEMA.sql'),
    read('supabase/parts/02_FUNCTIONS.sql'),
    read('supabase/MIGRATE_FROM_V2.sql'),
  ]);
  assert.match(schema, /local_date date not null/);
  assert.match(functions, /calculate_session_volume/);
  assert.match(functions, /e\.local_date between c\.start_date and c\.end_date/);
  assert.doesNotMatch(functions, /e\.completed_at::date between c\.start_date and c\.end_date/);
  assert.match(functions, /for update;/);
  assert.match(migration, /completed_at, local_date/);
});

test('servidor local distingue rota SPA de arquivo inexistente', async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.mjs'], {
    env: { ...process.env, PORT: String(port), SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));
  const base = `http://127.0.0.1:${port}`;
  await waitForServer(base);

  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type') || '', /text\/html/);

  const spa = await fetch(`${base}/perfil`);
  assert.equal(spa.status, 200);
  assert.match(await spa.text(), /Easy Train/);

  const missingAsset = await fetch(`${base}/arquivo-inexistente.js`);
  assert.equal(missingAsset.status, 404);

  const config = await fetch(`${base}/config.js`);
  assert.equal(config.status, 200);
  assert.match(config.headers.get('cache-control') || '', /no-store/);
  assert.match(await config.text(), /anonKey: ""/);
});


test('apresentação pública contém imagens e metadados sociais', async () => {
  const [readme, index, manifestText, build] = await Promise.all([
    read('README.md'), read('index.html'), read('manifest.webmanifest'), read('build.mjs'),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.match(readme, /easy-train-social-preview\.png/);
  assert.match(readme, /desktop-editor\.png/);
  assert.match(readme, /social-collabs-competition\.png/);
  assert.match(index, /property="og:image"/);
  assert.match(index, /name="twitter:card"/);
  assert.ok(Array.isArray(manifest.screenshots));
  assert.equal(manifest.screenshots.length, 2);
  assert.match(build, /og-image\.png/);
  assert.match(build, /screenshot-mobile\.png/);
});


test('login persistente, temas e instalação guiada estão configurados', async () => {
  const [app, repository, supabase, styles, index, build, themeInit] = await Promise.all([
    read('src/app.js'), read('src/repository.js'), read('src/supabase.js'), read('src/styles.css'),
    read('index.html'), read('build.mjs'), read('theme-init.js'),
  ]);
  assert.match(app, /Lembrar meu login/);
  assert.match(app, /data-theme-value/);
  assert.match(app, /Instalar no Android/);
  assert.match(app, /BOTÃO DO MEIO/);
  assert.match(repository, /getRememberLogin/);
  assert.match(supabase, /sessionStorage/);
  assert.match(supabase, /REMEMBER_LOGIN_KEY/);
  assert.match(styles, /html\[data-theme="light"\]/);
  assert.match(styles, /\.ios-share-demo/);
  assert.match(styles, /\.auth-theme-panel/);
  assert.match(styles, /\.theme-quick-btn/);
  assert.match(app, /renderThemeSelector/);
  assert.match(app, /cycleThemePreference/);
  assert.match(repository, /theme: 'system'/);
  assert.match(repository, /themePreferenceInitialized/);
  assert.match(app, /easy-train-theme-v2/);
  assert.match(index, /theme-init\.js/);
  assert.match(build, /theme-init\.js/);
  assert.match(themeInit, /\|\| 'system'/);
  assert.match(themeInit, /prefers-color-scheme: light/);
});

test('opção lembrar login escolhe localStorage ou sessionStorage', async () => {
  class MemoryStorage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
  }

  const original = {
    window: globalThis.window,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
    fetch: globalThis.fetch,
    location: globalThis.location,
    history: globalThis.history,
  };

  const local = new MemoryStorage();
  const session = new MemoryStorage();
  globalThis.window = globalThis;
  globalThis.localStorage = local;
  globalThis.sessionStorage = session;
  globalThis.location = { origin: 'https://easytrain.test', hash: '', search: '', pathname: '/' };
  globalThis.history = { replaceState() {} };
  globalThis.window.__SUPABASE_CONFIG__ = {
    url: 'https://example-project.supabase.co',
    anonKey: 'sb_publishable_abcdefghijklmnopqrstuvwxyz',
  };
  globalThis.fetch = async () => new Response(JSON.stringify({
    access_token: 'header.payload.signature',
    refresh_token: 'refresh-token',
    expires_in: 3600,
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  try {
    const auth = await import(`../src/supabase.js?remember-test=${Date.now()}`);
    await auth.signInWithPassword('atleta@example.com', '123456', { remember: false });
    assert.equal(local.getItem('easy-train-auth-session-v3'), null);
    assert.ok(session.getItem('easy-train-auth-session-v3'));
    assert.equal(local.getItem('easy-train-remember-email-v1'), null);

    await auth.signInWithPassword('atleta@example.com', '123456', { remember: true });
    assert.ok(local.getItem('easy-train-auth-session-v3'));
    assert.equal(session.getItem('easy-train-auth-session-v3'), null);
    assert.equal(local.getItem('easy-train-remember-email-v1'), 'atleta@example.com');
  } finally {
    globalThis.window = original.window;
    globalThis.localStorage = original.localStorage;
    globalThis.sessionStorage = original.sessionStorage;
    globalThis.fetch = original.fetch;
    globalThis.location = original.location;
    globalThis.history = original.history;
  }
});


test('editor suporta presets, emojis, validade opcional e frequência flexível', async () => {
  const [app, repository, workouts, styles] = await Promise.all([
    read('src/app.js'), read('src/repository.js'), read('src/workouts.js'), read('src/styles.css'),
  ]);
  assert.match(app, /const WORKOUT_PRESETS/);
  assert.match(app, /const WORKOUT_EMOJI_PRESETS/);
  assert.match(app, /Treino sem validade/);
  assert.match(app, /Meta semanal/);
  assert.match(app, /Rotina flexível/);
  assert.match(app, /applyWorkoutPreset/);
  assert.match(repository, /weeklyGoal/);
  assert.match(repository, /'cardio'/);
  assert.match(workouts, /weeklyGoal: 3/);
  assert.match(styles, /\.workout-preset-grid/);
  assert.match(styles, /\.emoji-preset-row/);
  assert.match(styles, /\.no-expiry-toggle/);
});
