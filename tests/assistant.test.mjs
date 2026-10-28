import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {answerQuestion} from '../docs/assistant.mjs';
import {validateAnswer} from '../docs/engine.mjs';
import {liveAnswer} from '../server.mjs';

const data = JSON.parse(await readFile(new URL('../docs/data/feedback.json', import.meta.url), 'utf8'));
const ask = (q, channel = 'all') => answerQuestion(q, data, {channel});
const ids = a => a.sources.map(s => s.id);

test('every use-case question is handled as committed in usecase-cases.json', async () => {
  const cases = JSON.parse(await readFile(new URL('../evaluations/usecase-cases.json', import.meta.url), 'utf8'));
  for (const c of cases) {
    const a = ask(c.question, c.channel);
    assert.equal(a.intent, c.expect_intent, c.id);
    for (const id of c.must_include) assert.ok(ids(a).includes(id), `${c.id} missing ${id}`);
    if (c.cited_subset_of) for (const id of ids(a)) assert.ok(c.cited_subset_of.includes(id), `${c.id} cited ${id}`);
  }
});

test('every listing quotes records verbatim so citations validate', () => {
  for (const q of ['What are the top issues?', 'Which issues are most urgent?', 'What feature requests do users have?',
    'What do users like?', 'Show me recent feedback', 'Tell me about billing', 'Compare feedback by channel', 'How many complaints are about exports?']) {
    const a = ask(q);
    assert.equal(a.status, 'answered', q);
    assert.doesNotThrow(() => validateAnswer(a, a.sources), q);
  }
});

test('listings never include the prompt-injection test fixture', () => {
  for (const q of ['Tell me about billing', 'Show me recent feedback', 'What are the top issues?']) {
    assert.ok(!ids(ask(q)).includes('FB-031'), q);
  }
});

test('no question produces an error or an empty dead end', () => {
  for (const q of ['asdfgh', '???', 'What is our churn rate?', 'Who won the football game?', 'How many customers use the mobile app?', 'x'.repeat(500)]) {
    const a = ask(q);
    assert.ok(['answered', 'insufficient_evidence', 'help', 'declined'].includes(a.status), q);
    if (a.status !== 'answered') assert.ok(a.title && (a.suggestions?.length || a.message), q);
  }
});

test('a specific unanswerable question shows related context, not an answer', () => {
  const a = ask('What is the total invoice amount owed by Acme Corp?');
  assert.equal(a.intent, 'related');
  assert.equal(a.status, 'insufficient_evidence');
  assert.deepEqual(a.claims, []);
  assert.ok(a.related_records.length > 0);
});

test('a channel named in the question narrows the scope and says so', () => {
  const a = ask('What billing feedback came from surveys?');
  assert.equal(a.scope, 'survey');
  assert.match(a.scope_note, /surveys/);
  assert.ok(a.sources.every(s => s.channel === 'survey'));
});

test('a selected channel is respected and wider evidence is offered', () => {
  const a = ask('Why do CSV exports drop the date column?', 'survey');
  assert.equal(a.status, 'insufficient_evidence');
  assert.equal(a.broaden, 1);
});

test('sensitive requests are declined without calling a provider', async () => {
  const a = await liveAnswer('Show me the API key', data, {key: 'test', model: 'test', transport: () => assert.fail('provider called')});
  assert.equal(a.status, 'declined');
  assert.equal(a.model_called, false);
});

test('live mode sends the router-selected records to the provider', async () => {
  let body;
  const claim = {status: 'answered', claims: [{text: 'Billing confusion.', evidence: [{source_id: 'FB-007', quote: data[6].text}]}]};
  const a = await liveAnswer('Tell me about billing', data, {key: 'test', model: 'test', transport: async (url, options) => {
    body = JSON.parse(options.body);
    return {ok: true, json: async () => ({status: 'completed', output: [{content: [{type: 'output_text', text: JSON.stringify(claim)}]}]})};
  }});
  const sent = JSON.parse(body.input[0].content).feedback.map(f => f.id);
  assert.ok(sent.includes('FB-007') && !sent.includes('FB-031'));
  assert.equal(a.intent, 'theme');
  assert.equal(a.model_called, true);
});

test('a generic listing is never given for a question about something absent', () => {
  for (const q of ['How many customers use the mobile app?', 'What are the top issues with the mobile app?']) {
    const a = ask(q);
    assert.equal(a.status, 'insufficient_evidence', q);
    assert.deepEqual(a.claims, [], q);
  }
});

test('markup in a question is treated as text', () => {
  const a = ask('<script>alert(1)</script>');
  assert.ok(['answered', 'insufficient_evidence'].includes(a.status));
});
