import http from 'node:http';
import {createRequestMetrics} from './request-metrics.mjs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {answerQuestion} from './docs/assistant.mjs';
import {createProvider, providerConfig} from './ai/provider.mjs';
import {createEmbeddingIndex} from './ai/retrieval.mjs';
import {answerWithAI} from './ai/pipeline.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(await readFile(path.join(root, 'docs/data/feedback.json'), 'utf8'));
const CHANNELS = ['all', 'support', 'interview', 'survey'];
const list = value => String(value || '').split(',').map(s => s.trim()).filter(Boolean);

/** Builds the AI dependencies from environment variables; null pieces mean "not available". */
export function aiFromEnv(env = process.env) {
  const config = providerConfig(env);
  if (!config) return {provider: null, index: null};
  const provider = createProvider(config);
  const index = config.embedModel ? createEmbeddingIndex(provider, {cacheFile: path.join(root, '.cache/embeddings.json')}) : null;
  return {provider, index};
}

const docsRoot = path.join(root, 'docs');
const TYPES = {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.mjs': 'text/javascript', '.json': 'application/json'};
// Serves only files inside docs/ with an allowlisted extension; "/dir/" maps to its index.html.
export function staticFile(pathname) {
  let decoded; try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const relative = decoded.endsWith('/') ? decoded + 'index.html' : decoded;
  const file = path.resolve(docsRoot, '.' + relative);
  if (!file.startsWith(docsRoot + path.sep) || !TYPES[path.extname(file)]) return null;
  return file;
}

// Conversation turns from the browser are bounded and reduced to plain strings and IDs.
function readHistory(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 12) throw new RangeError('Invalid conversation history.');
  return value.slice(-6).map(t => ({
    question: typeof t?.question === 'string' ? t.question.slice(0, 500) : '',
    answer: typeof t?.answer === 'string' ? t.answer.slice(0, 600) : '',
    source_ids: Array.isArray(t?.source_ids) ? t.source_ids.filter(id => typeof id === 'string').slice(0, 8) : [],
  }));
}

/**
 * Local by default: only loopback Host headers are served. For a hosted deployment set
 * PUBLIC_HOSTS (accepted Host headers) and, for a separately hosted page such as GitHub
 * Pages, ALLOWED_ORIGINS (origins allowed to call the API).
 */
export function createServer({records = data, telemetryCapacity = 200, provider, index, env = process.env} = {}) {
  if (provider === undefined) ({provider, index} = aiFromEnv(env));
  const metrics = createRequestMetrics({capacity: telemetryCapacity});
  const publicHosts = new Set(list(env.PUBLIC_HOSTS));
  const allowedOrigins = new Set(list(env.ALLOWED_ORIGINS));
  const perMinute = Number(env.RATE_LIMIT_PER_MINUTE || 20);
  let windowStart = Date.now();
  const calls = new Map();

  return http.createServer(async (req, res) => {
    const headers = {'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"};
    const host = req.headers.host || '';
    const origin = req.headers.origin;
    const local = /^(localhost|127\.0\.0\.1):\d+$/.test(host);
    const sameOrigin = origin && (origin === `http://${host}` || origin === `https://${host}`);
    if (origin && allowedOrigins.has(origin)) {
      Object.assign(headers, {'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600'});
    }
    const send = (status, body) => { res.writeHead(status, {...headers, 'Content-Type': 'application/json'}); res.end(JSON.stringify(body)); };
    if (!local && !publicHosts.has(host)) return send(403, {error: 'Unknown host.'});
    if (origin && !sameOrigin && !allowedOrigins.has(origin)) return send(403, {error: 'Cross-origin requests are not allowed.'});
    const url = new URL(req.url, `http://${host}`);
    if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) { res.writeHead(204, headers); return res.end(); }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      const ai = provider ? {available: true, provider: provider.name, model: provider.model, embed_model: index ? provider.embedModel : null} : {available: false};
      return send(200, {ai, live: ai.available, corpus: 'synthetic-v1'});
    }
    if (req.method === 'GET' && url.pathname === '/api/telemetry') {
      if (!local) return send(404, {error: 'Not found.'});
      return send(200, metrics.snapshot());
    }
    if (req.method === 'POST' && url.pathname === '/api/answer') {
      const requestStart = performance.now();
      let metricMode = 'unknown', metricOutcome = 'error', observed = false;
      const observe = completion => {
        if (observed) return; observed = true;
        metrics.record({mode: metricMode, outcome: metricOutcome, status: res.statusCode, duration_ms: performance.now() - requestStart, completion});
      };
      res.once('finish', () => observe('finished'));
      res.once('close', () => observe('aborted'));
      if (Date.now() - windowStart > 60000) { windowStart = Date.now(); calls.clear(); }
      const client = local ? 'local' : String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      calls.set(client, (calls.get(client) || 0) + 1);
      if (calls.get(client) > perMinute) return send(429, {error: 'Too many requests. Try again in a minute.'});
      if (!String(req.headers['content-type']).startsWith('application/json')) return send(415, {error: 'JSON required.'});
      let body = '', size = 0;
      try {
        for await (const part of req) { size += part.length; if (size > 24000) { send(413, {error: 'Request too large.'}); return; } body += part; }
        const parsed = JSON.parse(body);
        const {question, channel = 'all'} = parsed;
        // "live" is the original name of the model-backed mode and is kept as an alias.
        const mode = parsed.mode === 'live' ? 'ai' : parsed.mode || (provider ? 'ai' : 'extractive');
        if (typeof question !== 'string' || !question.trim() || question.length > 500) return send(400, {error: 'Enter a question up to 500 characters.'});
        if (!['extractive', 'ai'].includes(mode) || !CHANNELS.includes(channel)) return send(400, {error: 'Invalid filter or mode.'});
        const history = readHistory(parsed.history);
        metricMode = mode === 'ai' ? 'live' : 'extractive';
        const start = performance.now();
        const answer = mode === 'ai'
          ? await answerWithAI(question, records, {channel, history, provider, index, env})
          : answerQuestion(question, records, {channel});
        metricOutcome = answer.status === 'answered' ? 'answered' : 'insufficient_evidence';
        return send(200, {...answer, latency_ms: Math.round(performance.now() - start)});
      } catch (e) {
        if (e instanceof SyntaxError) return send(400, {error: 'Invalid JSON request.'});
        if (e instanceof RangeError) return send(400, {error: e.message});
        return send(502, {error: 'Answer unavailable. Try again shortly.'});
      }
    }
    if (req.method !== 'GET') return send(405, {error: 'Method not allowed.'});
    const file = staticFile(url.pathname); if (!file) return send(404, {error: 'Not found.'});
    try { const content = await readFile(file); res.writeHead(200, {...headers, 'Content-Type': TYPES[path.extname(file)]}); res.end(content); } catch { return send(404, {error: 'File unavailable.'}); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8767);
  const host = process.env.HOST || '127.0.0.1';
  const server = createServer();
  server.listen(port, host, () => {
    const config = providerConfig();
    console.log(`Feedback Lens: http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`);
    console.log(config ? `AI: ${config.provider} · ${config.model}${config.embedModel ? ` · embeddings ${config.embedModel}` : ''}` : 'AI: not configured (keyword answers only). Set GEMINI_API_KEY to enable.');
  });
}
