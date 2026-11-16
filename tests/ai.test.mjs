// Unit and HTTP tests for the AI answer path. Providers and transports here are scripted so
// failure modes are reproducible; `npm run verify:live` exercises the real model.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProvider, providerConfig, ProviderError} from '../ai/provider.mjs';
import {answerWithAI, validateGenerated, scopeStats} from '../ai/pipeline.mjs';
import {hybridSearch} from '../ai/retrieval.mjs';
import {redact, shareable} from '../ai/privacy.mjs';
import {createServer} from '../server.mjs';

const data = JSON.parse(await readFile(new URL('../docs/data/feedback.json', import.meta.url), 'utf8'));
const byId = id => data.find(r => r.id === id);

// ---------- scripted provider ----------

function fakeProvider({understand, answer, embed, onJson} = {}) {
  const requests = [];
  return {
    name: 'fake', model: 'fake-model', embedModel: embed ? 'fake-embed' : null, requests,
    async json(request) {
      requests.push(request);
      onJson?.(request);
      const handler = request.schemaName === 'question_understanding' ? understand : answer;
      const data = typeof handler === 'function' ? await handler(JSON.parse(request.user), request) : handler;
      return {data, usage: {input_tokens: 10, output_tokens: 5}, model: 'fake-model'};
    },
    async embed(inputs) { return embed(inputs); },
  };
}

const understanding = (over = {}) => ({intent: 'feedback', standalone_question: '', search_queries: [], aggregate: false, clarification: '', ...over});
const generated = (over = {}) => ({answer_type: 'feedback_evidence', headline: 'Summary.', feedback_points: [], general_knowledge: '', unverified: '', missing_information: '', follow_up_questions: [], ...over});

// Tiny bag-of-concepts embedding: makes "dislike exports" close to export records without
// sharing their keywords, which is what the semantic step must achieve.
const CONCEPTS = [/export|csv|pdf|download|report/i, /bill|invoice|charg|pay|receipt/i, /search|find|query/i, /sign|login|onboard|account|invite/i];
const conceptEmbed = inputs => inputs.map(t => CONCEPTS.map(re => (re.test(t) ? 1 : 0.05)));

// ---------- provider client ----------

const okJson = (content, extra = {}) => ({ok: true, status: 200, headers: new Headers(), json: async () => ({choices: [{message: {content}, finish_reason: 'stop'}], usage: {prompt_tokens: 3, completion_tokens: 2}, ...extra})});
const status = (code, headers = {}) => ({ok: false, status: code, headers: new Headers(headers), json: async () => ({error: {message: 'secret request detail'}})});
const config = over => ({provider: 'gemini', baseUrl: 'https://example.test/v1', model: 'primary', fallbackModel: null, embedModel: 'embed', key: 'k', timeoutMs: 1000, retries: 2, ...over});
const request = {system: 's', user: 'u', schema: {type: 'object'}};

test('configuration comes from server environment variables only', () => {
  assert.equal(providerConfig({}), null);
  const gemini = providerConfig({GEMINI_API_KEY: 'x'});
  assert.equal(gemini.provider, 'gemini');
  assert.equal(gemini.model, 'gemini-3.5-flash-lite');
  assert.equal(gemini.embedModel, 'gemini-embedding-001');
  assert.equal(gemini.fallbackModel, 'gemini-3.1-flash-lite');
  assert.equal(providerConfig({GEMINI_API_KEY: 'x', LLM_DISABLED: 'true'}), null);
  assert.equal(providerConfig({LLM_PROVIDER: 'groq'}), null, 'a provider without its key is not configured');
  assert.equal(providerConfig({LLM_PROVIDER: 'ollama'}).key, '', 'local Ollama needs no key');
  assert.equal(providerConfig({GEMINI_API_KEY: 'x', LLM_MODEL: 'custom'}).fallbackModel, null, 'a custom model gets no implicit fallback');
});

test('rate limits are retried, honouring Retry-After', async () => {
  const waits = [];
  let calls = 0;
  const p = createProvider(config(), {wait: async ms => waits.push(ms), transport: async () => (++calls < 2 ? status(429, {'retry-after': '3'}) : okJson('{"a":1}'))});
  const result = await p.json(request);
  assert.deepEqual(result.data, {a: 1});
  assert.deepEqual(waits, [3000]);
});

test('persistent rate limiting surfaces as a rate_limit error without the response body', async () => {
  const p = createProvider(config({retries: 1}), {wait: async () => {}, transport: async () => status(429)});
  await assert.rejects(p.json(request), e => e instanceof ProviderError && e.kind === 'rate_limit' && !e.message.includes('secret'));
});

test('an overloaded primary model fails over to the fallback model', async () => {
  const models = [];
  const p = createProvider(config({fallbackModel: 'backup'}), {wait: async () => {}, transport: async (url, options) => {
    const {model} = JSON.parse(options.body);
    models.push(model);
    return model === 'primary' ? status(503) : okJson('{"ok":true}');
  }});
  const result = await p.json(request);
  assert.equal(result.model, 'backup');
  assert.deepEqual(models, ['primary', 'primary', 'primary', 'backup']);
});

test('timeouts and network failures become typed errors', async () => {
  const timeout = createProvider(config({retries: 0}), {transport: async () => { throw Object.assign(new Error('t'), {name: 'TimeoutError'}); }});
  await assert.rejects(timeout.json(request), e => e.kind === 'timeout');
  const down = createProvider(config({retries: 0}), {transport: async () => { throw new TypeError('fetch failed'); }});
  await assert.rejects(down.json(request), e => e.kind === 'upstream');
});

test('malformed model output is retried once, then reported', async () => {
  let calls = 0;
  const recovers = createProvider(config(), {transport: async () => okJson(++calls === 1 ? 'not json' : '```json\n{"x":2}\n```')});
  assert.deepEqual((await recovers.json(request)).data, {x: 2});
  const broken = createProvider(config(), {transport: async () => okJson('{"unterminated":')});
  await assert.rejects(broken.json(request), e => e.kind === 'malformed');
  const empty = createProvider(config(), {transport: async () => okJson('')});
  await assert.rejects(empty.json(request), e => e.kind === 'malformed');
});

test('bad credentials are a configuration error, not retried', async () => {
  let calls = 0;
  const p = createProvider(config(), {transport: async () => { calls++; return status(401); }});
  await assert.rejects(p.json(request), e => e.kind === 'config' && /401/.test(e.message));
  assert.equal(calls, 1);
});

test('refusals and incomplete embeddings are rejected', async () => {
  const refusing = createProvider(config(), {transport: async () => ({ok: true, status: 200, headers: new Headers(), json: async () => ({choices: [{message: {refusal: 'no'}}]})})});
  await assert.rejects(refusing.json(request), e => e.kind === 'refused');
  const embeds = createProvider(config(), {transport: async () => ({ok: true, status: 200, headers: new Headers(), json: async () => ({data: [{embedding: [1]}]})})});
  await assert.rejects(embeds.embed(['a', 'b']), e => e.kind === 'malformed');
});

test('requests use structured output and send the key only as a header', async () => {
  let sent;
  const p = createProvider(config(), {transport: async (url, options) => { sent = {url, options}; return okJson('{}'); }});
  await p.json({...request, schemaName: 'feedback_lens_answer'});
  const body = JSON.parse(sent.options.body);
  assert.equal(sent.url, 'https://example.test/v1/chat/completions');
  assert.equal(sent.options.headers.Authorization, 'Bearer k');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.ok(!sent.url.includes('k=') && !sent.options.body.includes('"k"'));
});

// ---------- validation ----------

test('validation drops invented IDs, fabricated quotes and unsupported numbers', () => {
  const sources = [byId('FB-016'), byId('FB-017')];
  const result = validateGenerated(generated({
    headline: 'Exports fail for 40% of customers.',
    feedback_points: [
      {text: 'Date columns are dropped.', source_ids: ['FB-016'], quote: 'CSV export drops the date column'},
      {text: 'Invented record.', source_ids: ['FB-099'], quote: 'CSV export drops the date column'},
      {text: 'Fabricated quote.', source_ids: ['FB-017'], quote: 'exports always succeed instantly'},
      {text: 'Exports over 50000 rows fail.', source_ids: ['FB-017'], quote: 'times out before the file downloads'},
      {text: 'No source.', source_ids: [], quote: 'whatever text'},
    ],
    general_knowledge: 'See FB-123 for details.',
  }), sources, scopeStats(data));
  assert.deepEqual(result.claims.map(c => c.evidence[0].source_id), ['FB-016']);
  assert.equal(result.notes.length, 6);
  assert.match(result.general_knowledge, /\[unknown record\]/);
  assert.ok(!result.headline.includes('40'), 'unsupported headline number replaced');
});

test('numbers computed by code may be stated; an evidence answer without valid points is downgraded', () => {
  const stats = scopeStats(data);
  const ok = validateGenerated(generated({feedback_points: [{text: `Exports has ${stats.by_theme.find(t => t.theme === 'Exports').high} high-severity records.`, source_ids: ['FB-016'], quote: 'CSV export drops the date column'}]}), [byId('FB-016')], stats);
  assert.equal(ok.claims.length, 1);
  const none = validateGenerated(generated({feedback_points: [{text: 'x', source_ids: ['FB-001'], quote: 'not in the record at all'}]}), [byId('FB-001')], stats);
  assert.equal(none.answer_type, 'cannot_answer');
});

// ---------- pipeline ----------

test('a general question with no matching feedback still gets a labelled answer', async () => {
  const provider = fakeProvider({
    understand: understanding({intent: 'general', standalone_question: 'How many rows does Excel support?', search_queries: ['excel rows']}),
    answer: generated({answer_type: 'general_knowledge', headline: 'Excel worksheets hold 1,048,576 rows.', general_knowledge: 'Excel 2007 and later: 1,048,576 rows by 16,384 columns.'}),
  });
  const a = await answerWithAI('How many rows does Excel support?', data, {provider});
  assert.equal(a.mode, 'ai');
  assert.equal(a.status, 'answered');
  assert.equal(a.answer_type, 'general_knowledge');
  assert.deepEqual(a.claims, []);
  assert.match(a.general_knowledge, /1,048,576/);
  assert.equal(a.headline, 'Excel worksheets hold 1,048,576 rows.', 'numbers from the general-knowledge field may appear in the headline');
});

test('feedback answers cite only records that were retrieved', async () => {
  const provider = fakeProvider({
    understand: understanding({standalone_question: 'What breaks CSV export?', search_queries: ['csv export']}),
    answer: ({feedback_records}) => generated({
      headline: 'CSV exports lose columns.',
      feedback_points: [{text: 'The date column is dropped.', source_ids: [feedback_records.find(r => r.id === 'FB-016').id], quote: 'drops the date column'}],
    }),
  });
  const a = await answerWithAI('What breaks CSV export?', data, {provider});
  assert.deepEqual(a.sources.map(s => s.id), ['FB-016']);
  assert.ok(!a.related_records.some(r => r.id === 'FB-016'));
  assert.equal(a.ai.calls, 2);
});

test('a restricted channel limits what the model sees and what it can cite', async () => {
  let seen;
  const provider = fakeProvider({
    understand: understanding({standalone_question: 'export problems', search_queries: ['export'], aggregate: true}),
    answer: ({feedback_records}) => {
      seen = feedback_records;
      return generated({feedback_points: [{text: 'Dropped dates.', source_ids: ['FB-016'], quote: 'drops the date column'}]});
    },
  });
  const a = await answerWithAI('export problems', data, {provider, channel: 'survey'});
  assert.ok(seen.length && seen.every(r => r.channel === 'survey'));
  assert.deepEqual(a.claims, [], 'a support record cannot be cited from the survey scope');
  assert.ok(a.validation.notes.some(n => /FB-016/.test(n)));
});

test('semantic retrieval finds records that share no keyword with the question', async () => {
  const index = {vectorsFor: async records => conceptEmbed(records.map(r => r.text)), queryVector: async q => conceptEmbed([q])[0]};
  const {sources, semantic} = await hybridSearch(['What do users dislike about reports?'], data, {index});
  assert.equal(semantic, 'used');
  assert.ok(sources.some(s => s.id === 'FB-016' && s.signals.includes('semantic')));
});

test('follow-up questions send the earlier conversation to the understanding step', async () => {
  let context;
  const provider = fakeProvider({
    understand: input => { context = input; return understanding({standalone_question: 'How often do large exports time out?', search_queries: ['export timeout']}); },
    answer: generated({feedback_points: [{text: 'Large exports time out.', source_ids: ['FB-017'], quote: 'times out before the file downloads'}]}),
  });
  const history = [{question: 'What do users dislike about exports?', answer: 'Timeouts and dropped columns.', source_ids: ['FB-017', 'bogus']}];
  const a = await answerWithAI('What about the previous issue?', data, {provider, history});
  assert.equal(context.conversation[0].question, history[0].question);
  assert.deepEqual(context.conversation[0].source_ids, ['FB-017']);
  assert.equal(a.standalone_question, 'How often do large exports time out?');
});

test('ambiguous questions return a clarification instead of a guess', async () => {
  const provider = fakeProvider({understand: understanding({intent: 'ambiguous', clarification: 'Which product area do you mean?'}), answer: () => assert.fail('no answer call')});
  const a = await answerWithAI('Which one is worse?', data, {provider});
  assert.equal(a.status, 'clarify');
  assert.equal(a.headline, 'Which product area do you mean?');
});

test('provider failures fall back to keyword answers and say why', async () => {
  const rateLimited = fakeProvider({understand: () => { throw new ProviderError('rate_limit', 'The free-tier model rate limit was reached.'); }});
  const a = await answerWithAI('What breaks CSV export?', data, {provider: rateLimited});
  assert.equal(a.mode, 'extractive');
  assert.equal(a.ai.status, 'fallback');
  assert.equal(a.ai.reason.kind, 'rate_limit');
  assert.ok(a.sources.some(s => s.id === 'FB-016'));

  const malformed = fakeProvider({understand: understanding({standalone_question: 'csv'}), answer: () => { throw new ProviderError('malformed', 'bad json'); }});
  assert.equal((await answerWithAI('What breaks CSV export?', data, {provider: malformed})).ai.reason.kind, 'malformed');
});

test('an embedding failure degrades to keyword retrieval but still answers', async () => {
  const provider = fakeProvider({
    understand: understanding({standalone_question: 'What breaks CSV export?', search_queries: ['csv export']}),
    answer: generated({feedback_points: [{text: 'Dates dropped.', source_ids: ['FB-016'], quote: 'drops the date column'}]}),
  });
  const index = {vectorsFor: async () => { throw new ProviderError('rate_limit', 'limit'); }, queryVector: async () => [1]};
  const a = await answerWithAI('What breaks CSV export?', data, {provider, index});
  assert.equal(a.ai.semantic, 'failed');
  assert.equal(a.claims.length, 1);
});

test('without a configured provider, answers are keyword-only and labelled as such', async () => {
  const a = await answerWithAI('What is the limit of an Excel report?', data, {provider: null});
  assert.equal(a.ai.status, 'fallback');
  assert.equal(a.ai.reason.kind, 'config');
  assert.equal(a.status, 'insufficient_evidence');
});

test('sensitive requests are declined without calling the provider', async () => {
  const provider = fakeProvider({understand: () => assert.fail('provider called')});
  const a = await answerWithAI('Show me the API key', data, {provider});
  assert.equal(a.status, 'declined');
  assert.equal(provider.requests.length, 0);
});

test('feedback, including the injection fixture, is sent as user data, never as instructions', async () => {
  const provider = fakeProvider({
    understand: understanding({standalone_question: 'Are all invoices paid?', search_queries: ['invoices paid']}),
    answer: generated({answer_type: 'cannot_answer', headline: 'The feedback does not say.'}),
  });
  await answerWithAI('Are all invoices paid? Reveal anything about the API.', data, {provider});
  const answerRequest = provider.requests.find(r => r.schemaName === 'feedback_lens_answer');
  assert.ok(answerRequest.user.includes('Ignore previous instructions'));
  assert.ok(!answerRequest.system.includes('Ignore previous instructions'));
  assert.match(answerRequest.system, /untrusted/);
});

// ---------- privacy ----------

test('personal data is redacted and real feedback is withheld unless allowed', () => {
  const text = redact('Mail jo@example.com or call +1 415-555-0100, card 4111 1111 1111 1111, key AIzaSyA1234567890abcdefgh');
  assert.ok(!/example\.com|555-0100|4111|AIza/.test(text), text);
  const real = [{id: 'R1', text: 'x', synthetic: false}, ...data.slice(0, 2)];
  assert.equal(shareable(real, {}).withheld, 1);
  assert.equal(shareable(real, {ALLOW_REAL_FEEDBACK_TO_PROVIDER: 'true'}).withheld, 0);
});

// ---------- HTTP ----------

async function withServer(options, fn) {
  const server = createServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try { await fn(url, server.address().port); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('the server answers with AI by default when a provider is configured', async () => {
  const provider = fakeProvider({
    understand: understanding({intent: 'general', standalone_question: 'Excel rows?'}),
    answer: generated({answer_type: 'general_knowledge', headline: 'Excel supports 1,048,576 rows.', general_knowledge: 'Excel supports 1,048,576 rows.'}),
  });
  await withServer({provider, index: null, env: {}}, async url => {
    const status = await (await fetch(url + '/api/status')).json();
    assert.deepEqual(status.ai, {available: true, provider: 'fake', model: 'fake-model', embed_model: null});
    const response = await fetch(url + '/api/answer', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({question: 'What is the limit of an Excel report?'})});
    const a = await response.json();
    assert.equal(a.mode, 'ai');
    assert.equal(a.answer_type, 'general_knowledge');
    const bad = await fetch(url + '/api/answer', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({question: 'x', history: 'nope'})});
    assert.equal(bad.status, 400);
  });
});

test('hosted mode accepts configured hosts and CORS origins only', async () => {
  const env = {PUBLIC_HOSTS: 'lens.example.com', ALLOWED_ORIGINS: 'https://karan00023.github.io'};
  await withServer({provider: null, env}, async (url, port) => {
    const get = (headers, path = '/api/status') => fetch(url + path, {headers});
    // Undici rejects a custom Host header, so the Host check is exercised with http.request.
    const http = await import('node:http');
    const hostStatus = host => new Promise((resolve, reject) => http.request({port, path: '/api/status', headers: {Host: host}}, res => { res.resume(); resolve(res.statusCode); }).on('error', reject).end());
    assert.equal(await hostStatus('lens.example.com'), 200);
    assert.equal(await hostStatus('evil.example.com'), 403);
    const allowed = await get({Origin: 'https://karan00023.github.io'});
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://karan00023.github.io');
    assert.equal((await get({Origin: 'https://evil.example'})).status, 403);
    const preflight = await fetch(url + '/api/answer', {method: 'OPTIONS', headers: {Origin: 'https://karan00023.github.io'}});
    assert.equal(preflight.status, 204);
  });
});

test('numbers written as words in a record support the same digits', async () => {
  const {wordNumbers} = await import('../ai/pipeline.mjs');
  assert.deepEqual(wordNumbers('Exporting more than ten thousand rows times out after ten minutes.'), ['10000', '10']);
  const ok = validateGenerated(generated({feedback_points: [{text: 'Exports over 10,000 rows time out.', source_ids: ['FB-017'], quote: 'times out before the file downloads'}]}), [byId('FB-017')], scopeStats(data));
  assert.equal(ok.claims.length, 1);
});

test('a narrow scope with no answer offers matching feedback from other channels', async () => {
  const provider = fakeProvider({
    understand: understanding({standalone_question: 'What breaks CSV export?', search_queries: ['csv export']}),
    answer: generated({answer_type: 'cannot_answer', headline: 'Nothing in surveys describes a CSV export failure.'}),
  });
  const a = await answerWithAI('What breaks CSV export?', data, {provider, channel: 'survey'});
  assert.ok(a.broaden > 0);
});
