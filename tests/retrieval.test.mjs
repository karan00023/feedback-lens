import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {baseline, explainRetrieval, stem, tokens} from '../docs/engine.mjs';
import {createServer, liveAnswer, staticFile} from '../server.mjs';

const data = JSON.parse(await readFile(new URL('../docs/data/feedback.json', import.meta.url), 'utf8'));
const scoped = channel => data.filter(r => r.channel === channel);

test('word endings share a stem so "charges", "charged" and "charge" match', () => {
  assert.equal(stem('charges'), stem('charged'));
  assert.equal(stem('charged'), stem('charge'));
  assert.equal(stem('exporting'), stem('exports'));
  assert.deepEqual(tokens('What do interviews say about search?'), ['search']);
});

test('a strong match cites records containing at least two question terms', () => {
  const answer = baseline('What breaks CSV export?', data);
  assert.equal(answer.status, 'answered');
  assert.equal(answer.retrieval.match, 'multi-term');
  assert.deepEqual(answer.sources.map(s => s.id), ['FB-016']);
  assert.ok(answer.sources[0].matched_terms.length >= 2);
});

test('records sharing one term are listed as related but never cited', () => {
  const answer = baseline('What breaks CSV export?', data);
  const related = answer.retrieval.related.map(r => r.id);
  assert.ok(related.includes('FB-018'));
  assert.ok(answer.claims.every(c => !related.includes(c.evidence[0].source_id)));
});

test('a single rare term is accepted only as a labelled weaker match', () => {
  const answer = baseline('Why do invitations expire?', data);
  assert.equal(answer.retrieval.match, 'single-term');
  assert.deepEqual(answer.sources.map(s => s.id), ['FB-002']);
});

test('out-of-scope questions abstain with a reason and unmatched terms', () => {
  const answer = baseline('How much revenue did we make last quarter?', data);
  assert.equal(answer.status, 'insufficient_evidence');
  assert.deepEqual(answer.claims, []);
  assert.match(answer.retrieval.reason, /single term/);
  assert.ok(answer.retrieval.missing_terms.includes(stem('revenue')));
});

test('channel scope changes the answer, not just the list', () => {
  const question = 'Why do CSV exports drop the date column?';
  assert.equal(baseline(question, scoped('survey')).status, 'insufficient_evidence');
  assert.deepEqual(baseline(question, data).sources.map(s => s.id), ['FB-016']);
});

test('an empty scope abstains with an explicit reason', () => {
  const result = explainRetrieval('CSV export', []);
  assert.equal(result.sources.length, 0);
  assert.match(result.reason, /No feedback records/);
});

test('live answers carry the same retrieval explanation as the baseline', async () => {
  const answer = await liveAnswer('Who won the football game?', data, {key: 'test', model: 'test', transport: () => assert.fail('no provider call expected')});
  assert.equal(answer.status, 'insufficient_evidence');
  assert.equal(answer.retrieval.match, 'none');
});

test('static files resolve only inside docs/ with allowlisted extensions', () => {
  assert.match(staticFile('/lab/'), /docs[\\/]lab[\\/]index\.html$/);
  assert.match(staticFile('/research/citation-checks.html'), /citation-checks\.html$/);
  for (const bad of ['/../server.mjs', '/%2e%2e/server.mjs', '/..%2fpackage.json', '/%E0%A4%A', '/data/../../.env']) {
    assert.equal(staticFile(bad), null, bad);
  }
});

test('the local server serves every portfolio page so navigation works', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const page of ['/', '/lab/', '/telemetry/', '/telemetry/report.html', '/research/', '/models/']) {
      const response = await fetch(url + page);
      assert.equal(response.status, 200, page);
      assert.match(response.headers.get('content-type'), /text\/html/);
    }
    assert.equal((await fetch(url + '/package.json')).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
