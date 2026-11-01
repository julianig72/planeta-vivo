import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

export const FEED = 'https://gtfsrt.renfe.com/vehicle_positions.json';
export function createFeedCache(transport = fetch, now = Date.now) {
  let attempted = -Infinity, cached = null, failure = null, pending = null;
  return async function getFeed() {
    if (pending) return pending;
    if (now() - attempted < 20_000) {
      if (failure) throw failure;
      return cached;
    }
    attempted = now();
    pending = (async () => {
      try {
        const response = await transport(FEED, { signal: AbortSignal.timeout(12_000), headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Renfe HTTP ${response.status}`);
        const feed = await response.json();
        if (!feed.header || feed.entity !== undefined && !Array.isArray(feed.entity)) throw new Error('Formato GTFS-RT inesperado.');
        feed.entity ??= [];
        cached = { feed, receivedAt: now() }; failure = null;
        return cached;
      } catch (error) {
        failure = error instanceof Error ? error : new Error('Error de Renfe desconocido.');
        console.error('Renfe · consulta pública', failure.message, failure.cause ?? ''); throw failure;
      } finally { pending = null; }
    })();
    return pending;
  };
}

async function start() {
  const dev = process.argv.includes('--dev');
  const portAt = process.argv.indexOf('--port');
  const port = portAt >= 0 ? Number(process.argv[portAt + 1]) : dev ? 5173 : 4173;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Puerto inválido.');
  const trips = JSON.parse(await readFile(resolve('data', 'renfe-trips.json'), 'utf8'));
  const getFeed = createFeedCache();
  const vite = dev ? await (await import('vite')).createServer({ server: { middlewareMode: true }, appType: 'spa' }) : null;
  const root = resolve('dist');
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end('GET/HEAD only'); return; }
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/api/positions') {
        try {
          const snapshot = await getFeed(), matches = {};
          for (const entity of snapshot.feed.entity) {
            const id = entity?.vehicle?.trip?.tripId;
            if (typeof id === 'string' && Object.hasOwn(trips, id)) matches[id] = trips[id];
          }
          const bytes = Buffer.from(JSON.stringify({ ...snapshot, matches }));
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(req.method === 'HEAD' ? undefined : bytes);
        } catch (error) {
          res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          const code = error.cause?.code;
          res.end(JSON.stringify({ error: `${error.message}${typeof code === 'string' ? ` (${code})` : ''}` }));
        }
        return;
      }
      if (vite) { vite.middlewares(req, res); return; }
      const relative = decodeURIComponent(path === '/' ? '/index.html' : path).replace(/^\/+/, '').replaceAll('/', sep);
      const target = resolve(root, relative);
      if (!target.startsWith(root + sep)) { res.writeHead(403); res.end('Forbidden'); return; }
      try { if (!(await stat(target)).isFile()) throw new Error('Not a file'); }
      catch (error) { if (error.code !== 'ENOENT' && error.message !== 'Not a file') throw error; res.writeHead(404); res.end('Not found'); return; }
      const bytes = await readFile(target), compress = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '') && bytes.length > 1024;
      const body = compress ? gzipSync(bytes) : bytes;
      res.writeHead(200, { 'Content-Type': mime[extname(target)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache', Vary: 'Accept-Encoding', ...(compress ? { 'Content-Encoding': 'gzip' } : {}) });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      console.error('Servidor local', error);
      if (!res.headersSent) res.writeHead(500); res.end('Error del servidor local.');
    }
  });
  server.listen(port, '127.0.0.1', () => console.log(`España en movimiento · http://127.0.0.1:${port}/`));
  server.on('error', error => { console.error(error); process.exitCode = 1; });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  start().catch(error => { console.error('No se pudo iniciar el servidor', error); process.exitCode = 1; });
}
