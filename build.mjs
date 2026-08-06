import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/src', { recursive: true });

const rootFiles = [
  'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'icon-maskable-192.png', 'icon-maskable-512.png', 'apple-touch-icon.png',
  'favicon-16.png', 'favicon-32.png', 'favicon.ico', 'og-image.png',
  'screenshot-mobile.png', 'screenshot-desktop.png', 'service-worker.js', 'theme-init.js', '_redirects',
];

for (const file of rootFiles) await cp(file, `dist/${file}`);
await cp('src', 'dist/src', { recursive: true });

const supabaseUrl = process.env.SUPABASE_URL?.trim() || '';
const supabaseAnonKey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)?.trim() || '';

if (Boolean(supabaseUrl) !== Boolean(supabaseAnonKey)) {
  throw new Error('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY juntas.');
}
if (supabaseUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) {
  throw new Error('SUPABASE_URL inválida.');
}
if (supabaseAnonKey && !/^(sb_publishable_|eyJ)[A-Za-z0-9._-]+$/.test(supabaseAnonKey)) {
  throw new Error('SUPABASE_PUBLISHABLE_KEY inválida.');
}

const generatedConfig = `// Gerado durante o build.\nwindow.__SUPABASE_CONFIG__ = {\n  url: ${JSON.stringify(supabaseUrl)},\n  anonKey: ${JSON.stringify(supabaseAnonKey)},\n};\n`;
await writeFile('dist/config.js', generatedConfig, 'utf8');

let netlifyHeaders = await readFile('_headers', 'utf8');
if (supabaseUrl) {
  const supabaseWebSocketUrl = supabaseUrl.replace(/^https:/, 'wss:');
  netlifyHeaders = netlifyHeaders
    .replaceAll('https://*.supabase.co', supabaseUrl)
    .replaceAll('wss://*.supabase.co', supabaseWebSocketUrl);
}
await writeFile('dist/_headers', netlifyHeaders, 'utf8');

if (!supabaseUrl) {
  console.warn('Build criado sem Supabase. O login exibirá uma mensagem de configuração ausente.');
} else {
  console.log('Configuração pública do Supabase gerada pelas variáveis de ambiente.');
}
console.log('Build concluído em dist/');
