// Scores the current retriever and the frozen lexical-v1 baseline on two query sets.
// Output is deterministic (no timings) so the committed report only changes when results change.
import {readFile, writeFile} from 'node:fs/promises';
import {baseline} from '../docs/engine.mjs';
import {answerQuestion} from '../docs/assistant.mjs';
import {retrieve as retrieveV1} from './lexical-v1.mjs';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const records = await read('../docs/data/feedback.json');
const sets = {
  development: await read('./cases.json'),
  challenge: await read('./challenge-cases.json'),
};

// baseline: frozen v1 retriever. current: today's retriever alone.
// assistant: the full question router the workspace uses (it may choose a listing handler).
const systems = {
  baseline: (question, scoped) => retrieveV1(question, scoped).map(r => r.id),
  current: (question, scoped) => baseline(question, scoped).sources.map(r => r.id),
  assistant: (question, scoped, channel) => {
    const answer = answerQuestion(question, records, {channel});
    return answer.status === 'answered' ? answer.sources.map(r => r.id) : [];
  },
};

function score(testCase, ids) {
  const relevant = testCase.relevant_ids;
  const first = ids.findIndex(id => relevant.includes(id));
  const abstained = ids.length === 0;
  return {
    retrieved_ids: ids,
    abstained,
    recall_at_5: relevant.length ? relevant.filter(id => ids.includes(id)).length / relevant.length : null,
    reciprocal_rank: relevant.length ? (first < 0 ? 0 : 1 / (first + 1)) : null,
    // Off-target records returned for an answerable question, or anything returned for an unanswerable one.
    irrelevant_retrieved: ids.filter(id => !relevant.includes(id)).length,
    abstention_correct: Boolean(testCase.expect_abstain) === abstained,
  };
}

const mean = xs => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(4) : null;
function summarize(rows) {
  const answerable = rows.filter(r => !r.expect_abstain);
  return {
    cases: rows.length,
    answerable_cases: answerable.length,
    unanswerable_cases: rows.length - answerable.length,
    mean_recall_at_5: mean(answerable.map(r => r.recall_at_5)),
    mrr: mean(answerable.map(r => r.reciprocal_rank)),
    abstention_accuracy: mean(rows.map(r => Number(r.abstention_correct))),
    irrelevant_retrieved: rows.reduce((n, r) => n + r.irrelevant_retrieved, 0),
  };
}

// Compare per query: recall first, then precision, then abstention.
function change(before, after) {
  const key = r => [r.abstention_correct ? 1 : 0, r.recall_at_5 ?? 0, -r.irrelevant_retrieved, r.reciprocal_rank ?? 0];
  const [a, b] = [key(before), key(after)];
  const recallDelta = b[1] - a[1], abstainDelta = b[0] - a[0], noiseDelta = b[2] - a[2], rrDelta = b[3] - a[3];
  const signals = [abstainDelta, recallDelta, noiseDelta, rrDelta];
  if (signals.every(d => d === 0)) return 'unchanged';
  if (signals.every(d => d >= 0)) return 'improved';
  if (signals.every(d => d <= 0)) return 'regressed';
  return 'mixed';
}

const outcomes = [];
const summary = {};
for (const [setName, cases] of Object.entries(sets)) {
  summary[setName] = {};
  const perSystem = {};
  for (const [name, run] of Object.entries(systems)) {
    perSystem[name] = cases.map(c => {
      const channel = c.channel || 'all';
      const scoped = channel === 'all' ? records : records.filter(r => r.channel === channel);
      return {...c, ...score(c, run(c.question, scoped, channel))};
    });
    summary[setName][name] = summarize(perSystem[name]);
  }
  cases.forEach((c, i) => {
    const strip = ({retrieved_ids, abstained, recall_at_5, reciprocal_rank, irrelevant_retrieved, abstention_correct}) =>
      ({retrieved_ids, abstained, recall_at_5, reciprocal_rank, irrelevant_retrieved, abstention_correct});
    const before = perSystem.baseline[i], after = perSystem.current[i];
    outcomes.push({
      set: setName, id: c.id, question: c.question, channel: c.channel || 'all',
      relevant_ids: c.relevant_ids, expect_abstain: c.expect_abstain,
      baseline: strip(before), current: strip(after), assistant: strip(perSystem.assistant[i]),
      change: change(before, after),
    });
  });
}

// Use cases: does the assistant pick the expected handling, and cite only appropriate records?
const usecaseCases = await read('./usecase-cases.json');
const usecases = usecaseCases.map(c => {
  const answer = answerQuestion(c.question, records, {channel: c.channel});
  const ids = answer.sources.map(s => s.id);
  const status = answer.status === 'declined' ? 'insufficient_evidence' : answer.status;
  const problems = [];
  if (answer.intent !== c.expect_intent) problems.push(`handled as ${answer.intent}`);
  if (status !== c.expect_status) problems.push(`status ${answer.status}`);
  if (c.cited_subset_of) for (const id of ids) if (!c.cited_subset_of.includes(id)) problems.push(`unexpected ${id}`);
  for (const id of c.must_include) if (!ids.includes(id)) problems.push(`missing ${id}`);
  if (ids.length < c.min_cited) problems.push(`only ${ids.length} cited`);
  return {id: c.id, question: c.question, channel: c.channel, expect_intent: c.expect_intent,
    intent: answer.intent, status: answer.status, cited_ids: ids, passed: !problems.length, problems};
});
summary.usecases = {cases: usecases.length, passed: usecases.filter(u => u.passed).length};

const report = {
  dataset: 'synthetic-v1',
  corpus_records: records.length,
  systems: {
    baseline: 'lexical-v1: original token-overlap retriever (frozen in evaluations/lexical-v1.mjs)',
    current: 'Current docs/engine.mjs retriever on its own',
    assistant: 'docs/assistant.mjs question router used by the workspace (search plus listing handlers)',
  },
  evaluation_type: 'Development diagnostics; neither set is an independent held-out benchmark',
  sets: {
    development: 'evaluations/cases.json — 18 queries visible while the original baseline was built',
    challenge: 'evaluations/challenge-cases.json — 24 paraphrased, channel-scoped and unanswerable queries written and committed before retrieval changes, by the same AI-assisted author',
    usecases: 'evaluations/usecase-cases.json — 24 questions with expected handling, committed before the router was built',
  },
  summary,
  limitations: [
    'Small author-written synthetic corpus; no external validity.',
    'Both query sets were written by the project author with AI assistance, not independent annotators.',
    'Retrieval metrics do not measure whether an answer is semantically correct or useful.',
    'Abstention is decided by retrieval only: questions sharing vocabulary with the corpus can still return records.',
    'Live LLM accuracy, latency and cost have not been measured.',
  ],
  outcomes,
  usecases,
};

await writeFile(new URL('../docs/data/evaluation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');

const pct = n => n === null ? 'n/a' : (n * 100).toFixed(0) + '%';
for (const [setName, s] of Object.entries(summary)) {
  if (setName === 'usecases') continue;
  console.log(`\n${setName} (${s.current.cases} queries)`);
  for (const [name, m] of Object.entries(s)) {
    console.log(`  ${name.padEnd(8)} recall@5 ${pct(m.mean_recall_at_5)}  MRR ${m.mrr?.toFixed(2)}  abstention ${pct(m.abstention_accuracy)}  off-target records ${m.irrelevant_retrieved}`);
  }
}
const changed = outcomes.filter(o => o.change !== 'unchanged');
console.log(`\nPer-query changes: ${changed.length}`);
for (const o of changed) console.log(`  ${o.change.padEnd(9)} ${o.set}/${o.id} ${o.question} | v1 [${o.baseline.retrieved_ids}] -> now [${o.current.retrieved_ids}] | expected [${o.relevant_ids}]`);
const failing = outcomes.filter(o => !o.current.abstention_correct || (!o.expect_abstain && o.current.recall_at_5 < 1));
console.log(`\nRemaining current failures: ${failing.length}`);
for (const o of failing) console.log(`  ${o.set}/${o.id} ${o.question} | got [${o.current.retrieved_ids}] expected [${o.relevant_ids}]`);

console.log(`\nUse cases: ${summary.usecases.passed}/${summary.usecases.cases} handled as expected`);
for (const u of usecases.filter(u => !u.passed)) console.log(`  ${u.id} ${u.question} | ${u.problems.join('; ')}`);
