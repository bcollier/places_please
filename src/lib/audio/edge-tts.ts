/**
 * Free Microsoft neural voices through Edge "Read Aloud" (the same service the Python edge-tts
 * package and Ignatius at Home use). It must run on the phone: Microsoft refuses these requests from
 * cloud servers (Supabase gets HTTP 403). Unofficial, so callers must have fallbacks.
 *
 * Needs a WebSocket that can send custom headers (React Native's can; browsers' can't).
 */
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const M = 0xffffffffn;
const B = (n: number) => BigInt(n);

const SHA256_INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19].map(B);
const SHA256_STATE = [0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a, 0x6c006f49, 0x04bd35ab, 0xfeb0a7e4, 0x03effbd2].map(B);
const SHA256_SCHEDULE = [
  0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba, 0xa622ee8c, 0xd1dd9491, 0xc0dd25a0, 0xf9e70ab6, 0xf0c31573, 0x7058ce4e,
  0x7188e606, 0x00e5ab33, 0xd258b060, 0x72766564,
].map(B);
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
].map(B);
const ADJ = 0xc9dc06a7n;
const K_BLOCK = [...K.slice(0, 14), ADJ, ...K.slice(15)];
const SIGMA0_ADJ = 0x059c0b80n;
const SIGMA1_ADJ = 0x000b92c0n;
const CS64_COEFFICIENTS: [bigint, bigint][] = [
  [0xe82e91b1n, 0xb32700d0n], [0x44de24c6n, 0x88dff51dn], [0x3beb65bcn, 0x29514038n], [0xc89c5933n, 0xb328cbdfn],
  [0x8d1ec211n, 0xd405b4d5n], [0x314ef5d5n, 0x26e55f3cn], [0xe92491b1n, 0x607801c6n], [0xf0a5b9d5n, 0x82b2c1fbn],
  [0x06064cf3n, 0xfa51a3dan], [0xda79fa60n, 0x207cc464n], [0xbed20560n, 0x3c3c74f3n], [0x89f9c9f8n, 0xd2d14b61n],
  [0x35fa38c6n, 0xbb04a2c1n], [0xcb49e3c6n, 0xc5626167n],
];
const CS64_FACTOR = 0x82893933n;
const CS64_ADJ0 = 0xf2f90b1an;
const CS64_ADJ1 = 0x0b1a0000n;

const rol16 = (v: bigint) => {
  v &= M;
  return ((v << 16n) | (v >> 16n)) & M;
};
const sigma0 = (v: bigint) => ((v >> 7n) ^ (v << 25n) ^ (v >> 18n) ^ (v << 14n) ^ (v >> 3n)) & M;
const sigma1 = (v: bigint) => ((v >> 17n) ^ (v << 15n) ^ (v >> 19n) ^ (v << 13n) ^ (v >> 10n)) & M;
const rotSum = (x: bigint, a: bigint, b: bigint, c: bigint) => {
  const r = x * 0x100000001n;
  return (r >> a) ^ (r >> b) ^ (r >> c);
};

/** Plain SHA-256 rounds (the Python version unrolls these; the math is identical). */
function sha256Rounds(state: bigint[], words: bigint[], firstRound = 0): bigint[] {
  let [a, b, c, d, e, f, g, h] = state;
  const constants = firstRound === 14 ? K_BLOCK : K;
  for (let i = firstRound; i < 64; i++) {
    const t1 = h + rotSum(e, 6n, 11n, 25n) + (g ^ (e & (f ^ g))) + constants[i] + words[i];
    const t2 = rotSum(a, 2n, 13n, 22n) + ((a & b) | (c & (a | b)));
    h = g;
    g = f;
    f = e;
    e = (d + t1) & M;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) & M;
  }
  return [a, b, c, d, e, f, g, h];
}

function expandSchedule(words: bigint[], firstWord = 16) {
  for (let i = firstWord; i < 64; i++) {
    const x = words[i - 2];
    const y = words[i - 15];
    const s1 = (x >> 17n) ^ (x << 15n) ^ (x >> 19n) ^ (x << 13n) ^ (x >> 10n);
    const s0 = (y >> 7n) ^ (y << 25n) ^ (y >> 18n) ^ (y << 14n) ^ (y >> 3n);
    words.push((s1 + words[i - 7] + s0 + words[i - 16]) & M);
  }
}

const beInt = (bytes: Uint8Array) => bytes.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);

function sha256Init(data: Uint8Array): bigint[] {
  const words: bigint[] = [...Array(14).fill(0n), beInt(data.subarray(0, 3))];
  words.push(beInt(data.subarray(3, 7)));
  for (let i = 16; i < 30; i++) {
    let value = SHA256_SCHEDULE[i - 16];
    if (i - 2 >= 14) value += i === 16 ? sigma1(words[i - 2]) ^ SIGMA1_ADJ : sigma1(words[i - 2]);
    if (i - 7 >= 14) value += words[i - 7];
    if (i - 15 >= 14) value += i === 29 ? sigma0(words[i - 15]) ^ SIGMA0_ADJ : sigma0(words[i - 15]);
    words.push(value & M);
  }
  words.push((sigma1(words[28]) + words[23] + sigma0(words[15]) + words[14] + ADJ - K[14]) & M);
  expandSchedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((x, i) => (x + working[i]) & M);
}

function sha256Digest(data: Uint8Array): Uint8Array {
  const length = 57 + data.length;
  const zeros = (((55 - length) % 64) + 64) % 64;
  const padded = new Uint8Array(data.length - 7 + 1 + zeros + 8);
  padded.set(data.subarray(7), 0);
  padded[data.length - 7] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 0x100000000));
  view.setUint32(padded.length - 4, (length * 8) >>> 0);
  let state = sha256Init(data.subarray(0, 7));
  for (let off = 0; off < padded.length; off += 64) {
    const words: bigint[] = [];
    for (let i = 0; i < 16; i++) words.push(BigInt(view.getUint32(off + i * 4)));
    expandSchedule(words);
    const working = sha256Rounds(state, words);
    state = state.map((x, i) => (x + working[i]) & M);
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  state.forEach((w, i) => ov.setUint32(i * 4, Number(w)));
  return out;
}

function wordsLe4Even(data: Uint8Array): bigint[] {
  const len = Math.ceil(data.length / 4) * 4;
  if (len === 0) return [];
  const padded = new Uint8Array(len);
  padded.set(data);
  const view = new DataView(padded.buffer);
  const words: bigint[] = [];
  for (let i = 0; i < len; i += 4) words.push(BigInt(view.getUint32(i, true)));
  if (words.length % 2) words.push(0n);
  return words;
}

function cs64Digest(data: Uint8Array, digest: Uint8Array): [bigint, bigint] {
  const dv = new DataView(digest.buffer, digest.byteOffset);
  const keyA = BigInt(dv.getUint32(0, true)) | 1n;
  const keyB = BigInt(dv.getUint32(4, true)) | 1n;
  const factors = [(keyA * CS64_FACTOR) & M, (keyB * CS64_FACTOR) & M];
  const terms = CS64_COEFFICIENTS.map(([coef], i) => (coef * factors[i % 2]) & M);
  const offsets = CS64_COEFFICIENTS.map(([, off]) => off);
  const withZero = new Uint8Array(data.length + 1);
  withZero.set(data, 1);
  wordsLe4Even(withZero).forEach((word, i) => {
    let term = word * (i % 2 === 0 ? keyA : keyB);
    let offset = rol16(word) * (i % 2 === 0 ? 0xef0569fbn : 0xc31713dbn);
    if (i === 0) {
      term += CS64_ADJ0 * factors[0];
      offset += CS64_ADJ1;
    }
    terms.push(term & M);
    offsets.push(offset & M);
  });
  let swapAcc = 0n;
  let swapLast = 0n;
  let state = 0n;
  let acc = 0n;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i];
    const y = terms[i + 1];
    let t = rol16((offsets[i] + x) & M);
    let q = (t * 0x76f50f34n) & M;
    swapAcc += (rol16(q) * 0xc3efea97n + q) & M;
    t = rol16((offsets[i + 1] + y) & M);
    q = (t * 0x1881ce3cn) & M;
    swapLast = (rol16(q) * 0x35bd1ec9n + q) & M;
    swapAcc = (swapAcc + swapLast) & M;
    state = (state * keyA + x) & M;
    state = (rol16(state) * 0xcf98b111n) & M;
    state = (rol16(state) * 0x87085b9fn) & M;
    state = (rol16(state) * 0x12ceb96dn) & M;
    state = (rol16(state) * 0x257e1d83n) & M;
    acc += state;
    t = (state * keyB + y) & M;
    t = (rol16(t) * 0xa27416f5n) & M;
    t = (rol16(t) * 0xd38396ffn) & M;
    state = (rol16((rol16(t) * 0x7c932b89n) & M) * 0xbfa49f69n) & M;
    acc = (acc + state) & M;
  }
  return [swapLast ^ state, swapAcc ^ acc];
}

const hexUpper = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

/** Sec-MS-GEC v2 token (port of edge-tts 7.3.1 drm.py; verified against it). */
export function secMsGecV2(unixSeconds = Date.now() / 1000): string {
  let ticks = unixSeconds + 11644473600;
  ticks -= ticks % 300;
  ticks *= 1e9 / 100;
  const data = new TextEncoder().encode(`${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`);
  const digest = sha256Digest(data);
  const [w0, w1] = cs64Digest(data, digest);
  const cs = new Uint8Array(8);
  const cv = new DataView(cs.buffer);
  cv.setUint32(0, Number(w0), true);
  cv.setUint32(4, Number(w1), true);
  return `${hexUpper(cs)}-${hexUpper(digest)}`;
}


const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR = CHROMIUM_FULL_VERSION.split('.')[0];
const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

const randomHex = (bytes: number) =>
  Array.from({ length: bytes }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');

const edgeDate = () =>
  new Date().toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) (.*) GMT$/, '$1 $3 $2 $4 $5') +
  ' GMT+0000 (Coordinated Universal Time)';

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

type HeaderWebSocket = new (url: string, protocols: string[], options: { headers: Record<string, string> }) => WebSocket;

/** Returns MP3 bytes for the text, or throws. */
export function edgeSynthesize(text: string, voice: string, rate: number, timeoutMs = 6_000): Promise<Uint8Array> {
  const pct = Math.round((rate - 1) * 100);
  const prosodyRate = `${pct >= 0 ? '+' : ''}${pct}%`;
  const url =
    `${WSS_URL}&ConnectionId=${randomHex(16)}` +
    `&Sec-MS-GEC=${secMsGecV2()}&Sec-MS-GEC-Version=2-${CHROMIUM_FULL_VERSION}`;
  const ws = new (WebSocket as unknown as HeaderWebSocket)(url, [], {
    headers: {
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
      Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'User-Agent':
        `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
        `Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`,
      'Accept-Language': 'en-US,en;q=0.9',
      Cookie: `muid=${randomHex(16).toUpperCase()};`,
    },
  });
  ws.binaryType = 'arraybuffer';
  const chunks: Uint8Array[] = [];

  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      if (err) return reject(err);
      const total = chunks.reduce((n, c) => n + c.length, 0);
      if (total === 0) return reject(new Error('no audio received'));
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
      }
      resolve(out);
    };
    const timer = setTimeout(() => finish(new Error('edge tts timeout')), timeoutMs);

    ws.onopen = () => {
      ws.send(
        `X-Timestamp:${edgeDate()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},' +
          '"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n',
      );
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'>` +
        `<prosody pitch='+0Hz' rate='${prosodyRate}' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`;
      ws.send(
        `X-RequestId:${randomHex(16)}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${edgeDate()}Z\r\nPath:ssml\r\n\r\n${ssml}`,
      );
    };
    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) finish();
        return;
      }
      const bytes = new Uint8Array(event.data as ArrayBuffer);
      const headerLength = (bytes[0] << 8) | bytes[1];
      let header = '';
      for (let i = 2; i < 2 + headerLength && i < bytes.length; i++) header += String.fromCharCode(bytes[i]);
      if (header.includes('Path:audio')) chunks.push(bytes.slice(2 + headerLength));
    };
    ws.onerror = () => finish(new Error('edge tts connection failed'));
    ws.onclose = () => finish(chunks.length ? undefined : new Error('edge tts closed early'));
  });
}

/** Base64 for MP3 bytes (Hermes has btoa). */
export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
