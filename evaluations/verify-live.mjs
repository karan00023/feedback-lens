// Live end-to-end check: starts the real server, sends the mandatory questions over HTTP to
// /api/answer and lets the configured model answer. Needs GEMINI_API_KEY (or another
// LLM_PROVIDER) in the environment; it makes real, free-tier provider calls.
//   GEMINI_API_KEY=... npm run verify:live
// Results are written to evaluations/live-verification.json. Model output varies between
// runs, so the checks test behaviour (labels, citations, scope), not exact wording.
import {readFile, writeFile} from 'node:fs/promises';
import {createServer, aiFromEnv} from '../server.mjs';

const EXPORT_IDS = ['FB-016', 'FB-017', 'FB-018', 'FB-019', 'FB-020'];
const data = JSON.parse(await readFile(new URL('../docs/data/feedback.json', import.meta.url), 'utf8'));
const byId = new Map(data.map(r => [r.id, r]));
const cited = a => [...new Set((a.claims || []).flatMap(c => c.evidence.map(e => e.source_id)))];
const has = (text, re) => re.test(String(text || ''));

const CASES = [
  {question: 'What is the limit of an Excel report?', expect: 'General knowledge about Excel limits, separated from an unverified product export limit',
    check: a => a.mode === 'ai' && has(a.general_knowledge, /1,048,576/) && has(a.unverified, /export|orbit|product/i)},
  {question: 'What are the top three customer complaints?', expect: 'Three ranked complaints, each cited',
    check: a => a.claims.length === 3 && cited(a).every(id => byId.has(id))},
  {question: 'What do users dislike about exports?', expect: 'Export records found semantically and summarised',
    check: a => cited(a).length >= 2 && cited(a).every(id => EXPORT_IDS.includes(id))},
  {question: 'Which feedback issues are most urgent?', expect: 'Ranked by severity with citations',
    check: a => cited(a).length >= 2 && cited(a).filter(id => byId.get(id).severity === 'high').length / cited(a).length >= 0.75},
  {question: 'What features should we prioritize?', expect: 'Evidence-backed recommendations',
    check: a => a.claims.length >= 2},
  {question: 'Compare onboarding and billing complaints.', expect: 'Both themes compared with citations',
    check: a => cited(a).some(id => ['FB-001', 'FB-002', 'FB-003', 'FB-004', 'FB-005'].includes(id)) && cited(a).some(id => ['FB-006', 'FB-007', 'FB-008', 'FB-009', 'FB-010'].includes(id))},
  {question: 'How many rows does Excel support?', expect: 'General knowledge answer although no record mentions Excel',
    check: a => a.status === 'answered' && has(a.general_knowledge + a.headline, /1,048,576/)},
  {question: "What is our product's maximum export size?", expect: 'Product limit marked unverified; related feedback as context only',
    check: a => Boolean(a.unverified) || a.answer_type === 'unverified_product'},
  {question: 'What about the previous issue?', followUp: true, expect: 'Resolved from the previous turn (export size)',
    check: a => has(a.standalone_question, /export/i)},
];

if (!aiFromEnv().provider) {
  console.error('No AI provider configured. Set GEMINI_API_KEY (see README) and run again.');
  process.exit(2);
}
const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const post = async body => {
  const response = await fetch(`${base}/api/answer`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  return {status: response.status, body: await response.json()};
};

const results = [];
let history = [];
try {
  for (const c of CASES) {
    if (!c.followUp) history = [];
    const {status, body: a} = await post({question: c.question, history});
    const passed = status === 200 && a.mode === 'ai' && Boolean(c.check(a));
    results.push({
      question: c.question, expected: c.expect, passed, http_status: status,
      mode: a.mode, fallback_reason: a.ai?.status === 'fallback' ? a.ai.reason : null,
      answer_type: a.answer_type, standalone_question: a.standalone_question, headline: a.headline,
      cited: cited(a), general_knowledge: a.general_knowledge || '', unverified: a.unverified || '',
      validation_notes: a.validation?.notes || [], model: a.ai?.model, semantic: a.ai?.semantic, latency_ms: a.latency_ms,
    });
    history = [...history, {question: c.question, answer: a.headline || a.title || '', source_ids: cited(a)}];
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${c.question}  [${a.mode}${a.ai?.status === 'fallback' ? ` fallback: ${a.ai.reason?.kind}` : ''}, ${a.latency_ms} ms]`);
  }
  // Restricted scope: a support-only problem asked within surveys must not cite support records.
  const scoped = await post({question: 'What breaks CSV export?', channel: 'survey'});
  const scopedOk = scoped.status === 200 && cited(scoped.body).every(id => byId.get(id).channel === 'survey') && (cited(scoped.body).length || scoped.body.broaden > 0);
  results.push({question: 'What breaks CSV export? (survey scope)', expected: 'Only survey records cited; matches in other channels offered', passed: scopedOk, cited: cited(scoped.body), broaden: scoped.body.broaden, headline: scoped.body.headline, mode: scoped.body.mode});
  console.log(`${scopedOk ? 'PASS' : 'FAIL'}  Restricted channel: ${cited(scoped.body).join(', ') || 'no citations'}`);
} finally {
  await new Promise(resolve => server.close(resolve));
}

const passed = results.filter(r => r.passed).length;
const {provider} = aiFromEnv();
await writeFile(new URL('./live-verification.json', import.meta.url), JSON.stringify({
  run_at: new Date().toISOString(), provider: provider.name, model: provider.model, embed_model: provider.embedModel,
  note: 'Real provider calls over the local HTTP API. Model output varies run to run; checks test behaviour, not wording. Synthetic data.',
  passed, total: results.length, results,
}, null, 2) + '\n');
console.log(`\n${passed}/${results.length} live checks passed. Details: evaluations/live-verification.json`);
process.exitCode = passed === results.length ? 0 : 1;
