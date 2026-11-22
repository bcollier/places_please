/**
 * Local voice helper for the WEB version of the app (development only).
 *
 * Browsers can't open the WebSocket that Microsoft's free Edge "Read Aloud" voices need (it requires
 * custom headers), and Microsoft refuses those requests from cloud servers. This tiny server runs on
 * your own computer, fetches each line with the same code the iPhone app uses
 * (src/lib/audio/edge-tts.ts), and hands the MP3 to the browser.
 *
 *   npm run voices      (keep it running next to `npx expo start`)
 *
 * Listens on 127.0.0.1 only.
 */
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
(globalThis as unknown as { WebSocket: unknown }).WebSocket = require('ws');
const { edgeSynthesize, bytesToBase64 } = await import('../src/lib/audio/edge-tts.ts');

const PORT = Number(process.env.VOICE_HELPER_PORT ?? 8790);
const VOICE = /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]+Neural$/;

function cors(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = req.headers.origin ?? '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return void res.writeHead(204).end();
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
  if (req.method !== 'POST' || req.url !== '/tts') return send(res, 404, { error: 'not found' });

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) return send(res, 413, { error: 'too large' });
  }
  let body: { text?: unknown; voice?: unknown; rate?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return send(res, 400, { error: 'bad json' });
  }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2500) : '';
  const voice = typeof body.voice === 'string' ? body.voice : '';
  const rate = Math.max(0.5, Math.min(1.5, Number(body.rate) || 1));
  if (!text || !VOICE.test(voice)) return send(res, 400, { error: 'bad request' });

  const started = Date.now();
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const mp3 = await edgeSynthesize(text, voice, rate, 6_000);
      console.log(`voice ${voice} ${text.length} chars ${Date.now() - started} ms`);
      return send(res, 200, { audio: bytesToBase64(mp3) });
    } catch (err) {
      if (attempt === 2) {
        console.warn(`voice ${voice} failed: ${String(err)}`);
        return send(res, 502, { error: 'voice unavailable' });
      }
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Places, Please voice helper on http://127.0.0.1:${PORT} (Ctrl+C to stop)`);
});
