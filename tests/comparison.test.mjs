import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {hash,compareRuns,scoreRun,validateDataset} from '../experiments/comparison/harness.mjs';
const base=new URL('../experiments/comparison/',import.meta.url);
const dataRaw=await readFile(new URL('fixtures/dataset.json',base),'utf8');
const dataset=JSON.parse(dataRaw),prompt=await readFile(new URL('prompt.txt',base),'utf8');
const hashes={datasetHash:hash(dataRaw),promptHash:hash(prompt)};
const original=JSON.parse(await readFile(new URL('fixtures/fixture-control.json',base),'utf8'));
const copy=()=>structuredClone(original);
test('a scripted control covers every case without claiming semantic correctness',()=>{
  const r=scoreRun(copy(),dataset,hashes);assert.equal(r.automated_pass_rate,1);assert.equal(r.expected_attempts,8);assert.equal(r.semantic_correctness,null);assert.equal(r.human_reviewed,0);assert.equal(r.total_actual_cost_usd,null);
});
test('missing attempts count against the full planned denominator',()=>{
  const run=copy();run.rows.pop();const r=scoreRun(run,dataset,hashes);assert.equal(r.missing,1);assert.equal(r.automated_pass_rate,7/8);assert.equal(r.total_input_tokens,null);
});
test('unknown tasks, repeated trials and mismatched hashes are rejected',()=>{
  const a=copy();a.rows.push(a.rows[0]);assert.throws(()=>scoreRun(a,dataset,hashes),/duplicate/);
  const b=copy();b.rows[0].case_id='new';assert.throws(()=>scoreRun(b,dataset,hashes),/Unknown/);
  assert.throws(()=>scoreRun(copy(),dataset,{...hashes,promptHash:'changed'}),/hash/);
});
test('latency excludes execution errors but coverage and failure counts remain visible',()=>{
  const run=copy();run.rows[7]={...run.rows[7],outcome:'error',answer:null,latency_ms:99999};const r=scoreRun(run,dataset,hashes);assert.equal(r.execution_errors,1);assert.equal(r.p95_completed_response_ms,160);assert.equal(r.automated_pass_rate,7/8);
});
test('fabricated quotes and incomplete reference source sets fail different checks',()=>{
  const a=copy();a.rows[0].answer.claims[0].evidence[0].quote='invented evidence';const r=scoreRun(a,dataset,hashes);assert.equal(r.results[0].reason,'invalid_answer_or_citation');
  const b=copy();b.rows[2].answer.claims.pop();assert.equal(scoreRun(b,dataset,hashes).results[2].reason,'source_set_mismatch');
});
test('literal citation matching does not establish claim entailment',()=>{
  const run=copy();run.rows[0].answer.claims[0].text='Revenue increased by a billion dollars.';
  const r=scoreRun(run,dataset,hashes);assert.equal(r.results[0].automated_pass,true);assert.equal(r.results[0].human_semantic_review,'pending');assert.equal(r.semantic_correctness,null);
});
test('null, negative and nonfinite usage cannot turn unknown cost into a free model',()=>{
  const run=copy();run.rows[0].input_tokens=null;assert.equal(scoreRun(run,dataset,hashes).total_input_tokens,null);
  run.rows[0].actual_cost_usd=-1;assert.throws(()=>scoreRun(run,dataset,hashes),/cost/);
  const b=copy();b.rows[0].latency_ms=Infinity;assert.throws(()=>scoreRun(b,dataset,hashes),/latency/);
});
test('comparisons reject duplicate identities and unequal repetitions',()=>{
  assert.throws(()=>compareRuns([copy(),copy()],dataset,hashes),/Duplicate run/);
  const b=copy();b.run_id='other';b.trials=2;assert.throws(()=>compareRuns([copy(),b],dataset,hashes),/trial count/);
});
test('dataset reference labels must resolve and agree with answerability',()=>{
  const d=structuredClone(dataset);d.cases[0].expected.source_ids=['unknown'];assert.throws(()=>validateDataset(d),/source IDs/);
});
test('offline CLI writes a report and refuses to overwrite it',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'comparison-'));
  try{
    const out=path.join(folder,'report.json');
    const args=['experiments/comparison/run.mjs','experiments/comparison/fixtures/dataset.json','experiments/comparison/prompt.txt',out,'experiments/comparison/fixtures/fixture-control.json'];
    assert.equal(spawnSync(process.execPath,args,{encoding:'utf8'}).status,0);
    const result=JSON.parse(await readFile(out,'utf8'));assert.equal(result.runs[0].execution,'fixture');
    assert.notEqual(spawnSync(process.execPath,args,{encoding:'utf8'}).status,0);
  }finally{await rm(folder,{recursive:true,force:true});}
});
