import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {percentile,summarize,compare} from '../docs/telemetry/metrics.mjs';
const row=(duration_ms,ok=true)=>({duration_ms,ok,input_tokens:1000,output_tokens:100});
test('tail percentile uses nearest rank, handles one request and no requests',()=>{
  assert.equal(percentile(Array.from({length:100},(_,i)=>i+1),.95),95);
  assert.equal(percentile([9],.95),9);
  assert.equal(percentile([],.95),null);
  assert.throws(()=>percentile([NaN],.95));
});
test('bad requests are a union; slow failures are not counted twice',()=>{
  const s=summarize([row(3000,false),row(1000),row(3000)],{target:.9});
  assert.equal(s.bad,2);assert.equal(s.errors,1);assert.equal(s.goodRate,1-2/3);
  assert.ok(Math.abs(s.burn-(2/3)/.1)<1e-10);
});
test('cost uses tokens from all requests, denominator only successes',()=>{
  const s=summarize([row(10),row(20,false)]);
  assert.ok(Math.abs(s.cost-.0056)<1e-10);assert.equal(s.costPerSuccess,s.cost);
  assert.equal(summarize([row(10,false)]).costPerSuccess,null);
  assert.equal(summarize([]).p95,null);assert.equal(summarize([]).burn,null);
  assert.throws(()=>summarize([],{inputRate:-1}));
});
test('exact SLO latency boundary is good, errors still fail',()=>{
  assert.equal(summarize([row(2500),row(2500,false)]).bad,1);
});
test('reproducible sample demonstrates aggregate and cohort disagreement',async()=>{
  const rows=JSON.parse(await readFile(new URL('../docs/telemetry/requests.json',import.meta.url)));
  const result=compare(rows);
  assert.equal(rows.length,480);
  assert.ok(result[0].v2.p50>result[0].v1.p50);
  for(const r of result.slice(1)) assert.ok(r.v2.p50<r.v1.p50);
  for(const r of rows) assert.equal(r.duration_ms,r.queue_ms+r.retrieval_ms+r.model_ms);
});
