import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequestMetrics} from '../request-metrics.mjs';
import {createServer} from '../server.mjs';
test('bounded retention exposes eviction and cannot leak arbitrary labels or text',()=>{
  const m=createRequestMetrics({capacity:2});
  for(let i=0;i<3;i++)m.record({mode:'private prompt',outcome:'secret',status:200,duration_ms:i,completion:'finished',question:'DO NOT RETAIN',headers:{authorization:'secret'}});
  const s=m.snapshot();assert.deepEqual(s.retention,{capacity:2,total_observed:3,retained:2,evicted:1});
  assert.equal(s.records[0].request_id,2);assert.equal(s.records[0].mode,'unknown');
  assert.ok(!JSON.stringify(s).includes('secret'));assert.ok(!JSON.stringify(s).includes('DO NOT RETAIN'));
  s.records[0].mode='mutated';assert.equal(m.snapshot().records[0].mode,'unknown');
});
test('summaries separate aborts, HTTP failures and abstention; quantiles cover retained completed requests',()=>{
  const m=createRequestMetrics();
  for(const r of [{duration_ms:1,status:200,outcome:'answered'}, {duration_ms:10,status:200,outcome:'insufficient_evidence'}, {duration_ms:100,status:400,outcome:'error'}])m.record({...r,mode:'extractive',completion:'finished'});
  m.record({duration_ms:999,status:200,outcome:'answered',mode:'live',completion:'aborted'});
  const s=m.snapshot();assert.deepEqual(s.summary,{retained:4,completed:3,aborted:1,http_errors:1,answered:1,abstained:1,p50_ms:10,p95_ms:100});
  assert.equal(s.by_mode.live.p50_ms,null);assert.equal(s.records[3].status,null);assert.equal(s.records[3].outcome,'error');
  assert.equal(s.cost_usd,null);assert.equal(s.token_usage,null);
  assert.throws(()=>m.record({duration_ms:NaN}));assert.throws(()=>createRequestMetrics({capacity:0}));
});
test('actual HTTP lifecycle is recorded once with bounded metadata and local-only export',async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    await (await fetch(base+'/api/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'CSV export date column private-marker'})})).json();
    await (await fetch(base+'/api/answer',{method:'POST',headers:{'Content-Type':'text/plain'},body:'another-private-marker'})).json();
    const response=await fetch(base+'/api/telemetry');const s=await response.json();
    assert.equal(s.retention.total_observed,2);assert.equal(s.summary.http_errors,1);assert.equal(s.summary.answered,1);
    assert.ok(s.records.every(r=>Number.isFinite(r.duration_ms)&&r.duration_ms>=0));
    assert.ok(!JSON.stringify(s).includes('private-marker'));assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal((await fetch(base+'/api/telemetry',{headers:{Origin:'https://foreign.example'}})).status,403);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('client disconnect is observable as an abort rather than a completed response',{timeout:5000},async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const arrived=new Promise(resolve=>server.once('request',(req,res)=>{res.once('close',resolve);}));
    const client=http.request(base+'/api/answer',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':'1000'}});
    client.on('error',()=>{});client.write('{"question":"partial');
    // Wait until the server has received the incomplete request before disconnecting.
    await new Promise(resolve=>server.once('request',resolve));client.destroy();await arrived;
    const s=await (await fetch(base+'/api/telemetry')).json();
    assert.equal(s.retention.total_observed,1);assert.equal(s.summary.aborted,1);assert.equal(s.summary.completed,0);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
