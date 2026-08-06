import { readFile, writeFile } from 'node:fs/promises';

const parts = [
  'supabase/parts/01_SCHEMA.sql',
  'supabase/parts/02_FUNCTIONS.sql',
  'supabase/parts/03_SECURITY.sql',
];

const contents = await Promise.all(parts.map((file) => readFile(file, 'utf8')));
const header = `-- =========================================================\n-- EASY TRAIN — INSTALAÇÃO COMPLETA (ARQUIVO GERADO)\n-- Não edite este arquivo diretamente. Edite supabase/parts/*.sql\n-- e execute: npm run sql:build\n-- Depois rode supabase/VERIFY.sql no SQL Editor do Supabase.\n-- =========================================================\n\n`;
const output = `${header}${contents.map((content) => content.trim()).join('\n\n')}\n`;
await writeFile('supabase/INSTALL_ALL.sql', output);
console.log('✓ supabase/INSTALL_ALL.sql regenerado');
