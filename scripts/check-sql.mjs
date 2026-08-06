import { readFile } from 'node:fs/promises';

const files = [
  'supabase/parts/01_SCHEMA.sql',
  'supabase/parts/02_FUNCTIONS.sql',
  'supabase/parts/03_SECURITY.sql',
];
const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')));
const install = await readFile('supabase/INSTALL_ALL.sql', 'utf8');
const normalized = (value) => value.replace(/\r\n/g, '\n').trim();
const expectedBody = contents.map((content) => normalized(content)).join('\n\n');
if (!normalized(install).endsWith(expectedBody)) {
  throw new Error('INSTALL_ALL.sql está desatualizado. Rode npm run sql:build.');
}

const allSql = `${install}\n${await readFile('supabase/MIGRATE_FROM_V2.sql', 'utf8')}\n${await readFile('supabase/VERIFY.sql', 'utf8')}`;
const forbidden = [
  /service_role/i,
  /https:\/\/[a-z0-9-]+\.supabase\.co/i,
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]{12,}/,
];
for (const pattern of forbidden) {
  if (pattern.test(allSql)) throw new Error(`SQL contém configuração/credencial específica: ${pattern}`);
}

for (const marker of [
  'create schema if not exists easy_train_private',
  'enable row level security',
  "set search_path = ''",
  'easy_train_private.calculate_session_volume',
  'e.local_date between c.start_date and c.end_date',
  'for update;',
]) {
  if (!install.toLowerCase().includes(marker.toLowerCase())) {
    throw new Error(`Proteção SQL ausente: ${marker}`);
  }
}

if (/e\.completed_at::date between c\.start_date and c\.end_date/i.test(install)) {
  throw new Error('Ranking ainda usa data UTC em vez de local_date.');
}
if (!/completed_at, local_date/.test(await readFile('supabase/MIGRATE_FROM_V2.sql', 'utf8'))) {
  throw new Error('Migração antiga não preenche local_date.');
}
console.log('✓ SQL consolidado, portátil e coerente');
