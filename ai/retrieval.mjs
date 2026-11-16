// Hybrid retrieval: embedding similarity fused with the existing lexical retriever.
// Embeddings make "what do users dislike about exports" find "CSV export drops the date
// column" without a shared keyword; the lexical side keeps exact identifiers (CSV, SSO)
// strong. Channel scope is applied before ranking, so restricted records never compete.
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {explainRetrieval} from '../docs/engine.mjs';
import {redact} from './privacy.mjs';

const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 24);

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Record embeddings are computed once per text and cached in memory and, when cacheFile is
 * set, on disk (keyed by model and a hash of the redacted text, never the text itself).
 */
export function createEmbeddingIndex(provider, {cacheFile = null} = {}) {
  const cache = new Map();
  let loaded = false;
  const key = text => `${provider.embedModel}:${hash(text)}`;

  async function load() {
    if (loaded || !cacheFile) return;
    loaded = true;
    try { for (const [k, v] of Object.entries(JSON.parse(await readFile(cacheFile, 'utf8')))) cache.set(k, v); } catch { /* no cache yet */ }
  }
  async function save() {
    if (!cacheFile) return;
    await mkdir(path.dirname(cacheFile), {recursive: true});
    await writeFile(cacheFile, JSON.stringify(Object.fromEntries(cache)));
  }

  return {
    async vectorsFor(records) {
      await load();
      const texts = records.map(r => redact(r.text));
      const missing = [...new Set(texts.filter(t => !cache.has(key(t))))];
      if (missing.length) {
        for (let i = 0; i < missing.length; i += 64) {
          const batch = missing.slice(i, i + 64);
          const vectors = await provider.embed(batch);
          batch.forEach((t, j) => cache.set(key(t), vectors[j]));
        }
        await save().catch(() => {});
      }
      return texts.map(t => cache.get(key(t)));
    },
    async queryVector(query) {
      return (await provider.embed([query]))[0];
    },
  };
}

/**
 * Ranks records for the given queries. Returns sources with a score and the signals that
 * selected them. `index` may be null (no embedding model): lexical results are used alone.
 */
export async function hybridSearch(queries, records, {index = null, limit = 8, minSimilarity = 0.55, margin = 0.1} = {}) {
  const k = 60; // reciprocal-rank-fusion constant
  const fused = new Map();
  const signals = new Map();
  const add = (id, rank, signal) => {
    fused.set(id, (fused.get(id) || 0) + 1 / (k + rank));
    signals.set(id, [...new Set([...(signals.get(id) || []), signal])]);
  };

  for (const q of queries) {
    explainRetrieval(q, records, {limit}).sources.forEach((r, i) => add(r.id, i, 'keyword'));
  }

  let semantic = 'unavailable';
  let similarity = new Map();
  if (index && records.length) {
    const vectors = await index.vectorsFor(records);
    for (const q of queries) {
      const qv = await index.queryVector(q);
      const ranked = records.map((r, i) => ({id: r.id, s: cosine(qv, vectors[i])})).sort((a, b) => b.s - a.s);
      ranked.forEach(({id, s}) => similarity.set(id, Math.max(similarity.get(id) ?? -1, s)));
      // Gemini similarities are compressed (~0.45-0.75), so keep matches close to the best one.
      const floor = Math.max(minSimilarity, (ranked[0]?.s ?? 1) - margin);
      ranked.filter(r => r.s >= floor).slice(0, limit).forEach((r, i) => add(r.id, i, 'semantic'));
    }
    semantic = 'used';
  }

  const byId = new Map(records.map(r => [r.id, r]));
  const sources = [...fused.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id, score]) => ({...byId.get(id), score: +score.toFixed(4), similarity: similarity.has(id) ? +similarity.get(id).toFixed(3) : null, signals: signals.get(id)}));
  return {sources, semantic};
}
