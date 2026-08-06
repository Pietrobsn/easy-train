import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';

const scripts = [
  'server.mjs', 'build.mjs', 'service-worker.js',
  'src/app.js', 'src/repository.js', 'src/supabase.js', 'src/workouts.js',
];
for (const file of scripts) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });

const read = (file) => readFile(file, 'utf8');
const [
  app, styles, index, serviceWorker, config, repository, supabaseClient, workouts,
  schemaSql, functionsSql, securitySql, installSql, verifySql, migrationSql, headers, redirects, netlify,
  server, build, ci, license, qaReport, readme, githubSetup, deployment, roadmap, branding,
] = await Promise.all([
  read('src/app.js'), read('src/styles.css'), read('index.html'), read('service-worker.js'),
  read('config.js'), read('src/repository.js'), read('src/supabase.js'), read('src/workouts.js'),
  read('supabase/parts/01_SCHEMA.sql'), read('supabase/parts/02_FUNCTIONS.sql'),
  read('supabase/parts/03_SECURITY.sql'), read('supabase/INSTALL_ALL.sql'),
  read('supabase/VERIFY.sql'), read('supabase/MIGRATE_FROM_V2.sql'), read('_headers'), read('_redirects'), read('netlify.toml'),
  read('server.mjs'), read('build.mjs'), read('.github/workflows/ci.yml'), read('LICENSE'), read('docs/QA_REPORT.md'),
  read('README.md'), read('docs/GITHUB_SETUP.md'), read('docs/DEPLOYMENT.md'), read('docs/ROADMAP.md'), read('docs/BRANDING.md'),
]);
const manifest = JSON.parse(await read('manifest.webmanifest'));

if (!index.includes('<title>Easy Train</title>')) throw new Error('Nome Easy Train ausente do HTML.');
if (!index.includes('name="referrer"')) throw new Error('Política de referrer ausente do HTML.');
if (!index.includes('property="og:image"') || !index.includes('name="twitter:card"')) {
  throw new Error('Metadados de compartilhamento ausentes do HTML.');
}
if (manifest.name !== 'Easy Train' || manifest.short_name !== 'Easy Train') throw new Error('Manifesto inválido.');
if (!config.includes('window.__SUPABASE_CONFIG__')) throw new Error('Configuração pública do Supabase ausente.');
if (!/url:\s*['"]{2}/.test(config) || !/anonKey:\s*['"]{2}/.test(config)) {
  throw new Error('config.js deve permanecer sem projeto real no repositório público.');
}
if (/service_role\s*[:=]\s*['"][^'"]+/i.test(config + repository + supabaseClient)) {
  throw new Error('Uma credencial service_role parece estar exposta no frontend.');
}

for (const feature of [
  'renderAuth', 'renderCollab', 'renderCompetitions', 'renderPlanEditor', 'renderCoachCard',
  'getCoachInsight', 'duplicateDraftDay', 'duplicateDraftExercise', 'importSharedPlan',
  'shareCurrentPlan', 'loadCollabs', 'loadCompetitions', "'logout': () => logout()",
  'auth-reset-mode', 'profile-discoverable', 'Lembrar meu login',
  'setThemePreference', 'Instalar no Android', 'ios-share-demo',
  'WORKOUT_PRESETS', 'WORKOUT_EMOJI_PRESETS', 'Treino sem validade', 'Meta semanal',
  'Ordem livre ativada', 'focus-exercise-list', 'exercise-quick-switch',
]) {
  if (!app.includes(feature)) throw new Error(`Recurso ausente: ${feature}`);
}
for (const feature of [
  'signInWithPassword', 'supabaseSignUp', 'requestPasswordReset', 'updatePassword',
  'getRememberLogin', 'getRememberedEmail', 'sessionStorage',
  'easy_train_get_my_bootstrap', 'easy_train_get_collab_dashboard', 'easy_train_get_competitions',
]) {
  if (!(repository + supabaseClient).includes(feature)) throw new Error(`Integração ausente: ${feature}`);
}
if (!workouts.includes('days: []')) throw new Error('Novas contas devem começar sem ficha compartilhada.');
if (!repository.includes("theme: 'system'")) throw new Error('Novas contas devem começar seguindo o tema do sistema.');
if (!repository.includes('SAVE_DEBOUNCE_MS = 180')) throw new Error('Salvamento rápido em segundo plano ausente.');
if (!app.includes('renderThemeSelector') || !app.includes('cycleThemePreference')) {
  throw new Error('Seletor de tema visível ou atalho rápido ausente.');
}

const tables = [
  'profiles', 'user_states', 'user_stats', 'collab_requests', 'shared_plans',
  'competitions', 'competition_members', 'workout_events', 'action_limits',
];
for (const table of tables) {
  if (!schemaSql.includes(`easy_train_private.${table}`)) throw new Error(`Tabela ausente: ${table}`);
  if (!securitySql.includes(`alter table easy_train_private.${table} enable row level security`)) {
    throw new Error(`RLS ausente: ${table}`);
  }
}

const rpcNames = [
  'easy_train_username_available', 'easy_train_get_my_bootstrap', 'easy_train_save_my_state',
  'easy_train_update_my_profile', 'easy_train_search_people', 'easy_train_send_collab_request',
  'easy_train_respond_collab_request', 'easy_train_get_collab_dashboard', 'easy_train_share_plan',
  'easy_train_mark_share_imported', 'easy_train_create_competition', 'easy_train_join_competition',
  'easy_train_respond_competition', 'easy_train_get_competitions',
];
for (const fn of rpcNames) {
  const declaration = `create or replace function public.${fn}`;
  const start = functionsSql.indexOf(declaration);
  if (start < 0) throw new Error(`RPC ausente: ${fn}`);
  const next = functionsSql.indexOf('create or replace function public.', start + declaration.length);
  const block = functionsSql.slice(start, next < 0 ? functionsSql.length : next);
  if (!block.includes('security definer')) throw new Error(`RPC sem SECURITY DEFINER controlado: ${fn}`);
  if (!block.includes("set search_path = ''")) throw new Error(`RPC sem search_path protegido: ${fn}`);
}

for (const marker of ['CREATE TABLE', 'SECURITY DEFINER', 'ROW LEVEL SECURITY']) {
  if (!installSql.toUpperCase().includes(marker)) throw new Error(`INSTALL_ALL incompleto: ${marker}`);
}
if (!verifySql.includes('anon_has_direct_access') || !verifySql.includes(`'PASS' as status`)) throw new Error('Relatório de verificação incompleto.');
if (!migrationSql.includes('completed_at, local_date') || !migrationSql.includes('state_version = 15')) {
  throw new Error('Migração antiga incompatível com o schema atual.');
}
if (!functionsSql.includes('calculate_session_volume') || !functionsSql.includes('e.local_date between c.start_date and c.end_date')) {
  throw new Error('Eventos ou rankings ainda confiam em dados inadequados do cliente.');
}
if (functionsSql.includes('e.completed_at::date between c.start_date and c.end_date')) {
  throw new Error('Ranking usa data UTC em vez da data local.');
}
if (!securitySql.includes('revoke all on all tables in schema easy_train_private')) {
  throw new Error('Revogação de acesso direto ausente.');
}
if (!functionsSql.includes('assert_rate_limit')) throw new Error('Limite de ações no banco ausente.');
if (!functionsSql.includes('validate_state') || !functionsSql.includes('validate_plan')) {
  throw new Error('Validação do payload no banco ausente.');
}

for (const selector of [
  '.social-auth-card', '.social-bottom-nav', '.social-hero', '.friend-card', '.competition-card',
  '.leaderboard', '.profile-social-links', '.coach-nudge', '.editor-workspace',
  '.editor-sidebar', '.editor-desktop-toolbar', '.profile-visibility',
  '.theme-selector', '.remember-login-row', '.ios-share-demo', 'html[data-theme="light"]',
  '.workout-preset-grid', '.emoji-preset-row', '.no-expiry-toggle', '.flexible-routine-note',
  '.auth-theme-panel', '.theme-quick-btn', '.theme-preview',
  '.free-order-banner', '.exercise-quick-switch', '.quick-exercise',
]) {
  if (!styles.includes(selector)) throw new Error(`Estilo ausente: ${selector}`);
}

for (const header of [
  'Content-Security-Policy', 'X-Content-Type-Options', 'X-Frame-Options',
  'Referrer-Policy', 'Permissions-Policy', 'Strict-Transport-Security',
]) {
  if (!headers.includes(header)) throw new Error(`Cabeçalho Netlify ausente: ${header}`);
}
if (!redirects.includes('/index.html')) throw new Error('Fallback SPA do Netlify ausente.');
if (!netlify.includes('publish = "dist"')) throw new Error('Publicação do Netlify inválida.');
if (!server.includes('dirname(fileURLToPath(import.meta.url))') || !server.includes('extname(requestPath)')) {
  throw new Error('Servidor local sem proteção de caminho ou 404 de assets.');
}
if (!build.includes(`replaceAll('https://*.supabase.co', supabaseUrl)`)) {
  throw new Error('Build não restringe a CSP ao projeto Supabase configurado.');
}
if (!ci.includes('npm run qa') || !license.includes('MIT License') || !qaReport.includes('Aprovado para publicação no GitHub')) {
  throw new Error('Estrutura de repositório público incompleta.');
}

const requiredAssets = [
  'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png',
  'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-16.png',
  'favicon-32.png', 'favicon.ico', 'og-image.png', 'screenshot-mobile.png', 'screenshot-desktop.png', 'theme-init.js',
  'docs/assets/easy-train-social-preview.png', 'docs/assets/mobile-dashboard.png',
  'docs/assets/desktop-editor.png', 'docs/assets/social-collabs-competition.png',
];
for (const file of requiredAssets) {
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) throw new Error(`Ícone inválido: ${file}`);
}
if (manifest.display !== 'standalone') throw new Error('Manifesto PWA inválido.');
if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length < 2) {
  throw new Error('Screenshots do manifesto PWA ausentes.');
}

for (const marker of [
  'docs/assets/easy-train-social-preview.png',
  'docs/assets/mobile-dashboard.png',
  'docs/assets/desktop-editor.png',
  'docs/assets/social-collabs-competition.png',
  '```mermaid',
  'npm run qa',
]) {
  if (!readme.includes(marker)) throw new Error(`README público incompleto: ${marker}`);
}
if (!githubSetup.includes('Social preview') || !deployment.includes('SUPABASE_PUBLISHABLE_KEY')
  || !roadmap.includes('Próximas entregas') || !branding.includes('Identidade visual')) {
  throw new Error('Documentação de publicação incompleta.');
}

if (/caches\.open|cache\.put|caches\.match/.test(serviceWorker)) {
  throw new Error('Service worker não deve guardar o aplicativo ou dados offline.');
}

console.log('✓ Sintaxe JavaScript validada');
console.log('✓ Login, cadastro e recuperação de senha validados');
console.log('✓ Treinos próprios, collabs e competições encontrados');
console.log('✓ Editor responsivo para PC e mobile validado');
console.log('✓ SQL organizado, RLS e RPCs protegidas encontrados');
console.log('✓ Limites e validações de payload encontrados');
console.log('✓ Cabeçalhos de segurança do Netlify validados');
console.log('✓ PWA online e ícones validados');
console.log('✓ CI, licença e documentação pública validados');
console.log('✓ Capa, screenshots e metadados sociais validados');
