import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function publicConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const anonKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  return `// Gerado pelo servidor local.\nwindow.__SUPABASE_CONFIG__ = {\n  url: ${JSON.stringify(url)},\n  anonKey: ${JSON.stringify(anonKey)},\n};\n`;
}

const commonHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const requestPath = decodeURIComponent(requestUrl.pathname);

    if (requestPath === '/config.js') {
      response.writeHead(200, {
        ...commonHeaders,
        'Content-Type': mime['.js'],
        'Cache-Control': 'no-store, max-age=0',
      });
      response.end(publicConfig());
      return;
    }

    const normalizedPath = normalize(requestPath).replace(/^[/\\]+/, '');
    const filePath = resolve(root, normalizedPath || 'index.html');
    const resolvedInsideRoot = filePath === root || filePath.startsWith(`${root}/`);
    if (!resolvedInsideRoot) {
      response.writeHead(400, { ...commonHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Caminho inválido.');
      return;
    }

    let finalPath = filePath;
    try {
      if ((await stat(finalPath)).isDirectory()) finalPath = join(finalPath, 'index.html');
    } catch {
      if (extname(requestPath)) {
        response.writeHead(404, { ...commonHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Arquivo não encontrado.');
        return;
      }
      finalPath = join(root, 'index.html');
    }

    const file = await readFile(finalPath);
    response.writeHead(200, {
      ...commonHeaders,
      'Content-Type': mime[extname(finalPath)] || 'application/octet-stream',
      'Cache-Control': extname(finalPath) === '.html' ? 'no-store, max-age=0' : 'no-cache',
    });
    response.end(file);
  } catch (error) {
    response.writeHead(500, { ...commonHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(`Erro ao carregar o aplicativo: ${error.message}`);
  }
}).listen(port, () => {
  const configured = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY));
  console.log(`Easy Train rodando em http://localhost:${port}`);
  if (!configured) console.warn('Supabase não configurado. Copie .env.example para .env antes de testar login e sincronização.');
});
