import {writeFile} from 'node:fs/promises';
import {compare} from '../../docs/telemetry/metrics.mjs';
// Fixed generator, no imported employer telemetry and no provider requests.
let state=731;
const random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
const rows=[];
for (const release of ['v1','v2']) {
  for(let i=0;i<240;i++) {
    const task=i<(release==='v1'?216:96)?'quick':'deep';
    const factor=release==='v2'?.8:1;
    const queue_ms=Math.round(35+random()*90);
    const retrieval_ms=Math.round((task==='deep'?210:65)+random()*90);
    const model_ms=Math.round((task==='deep'?2700:600)*factor+random()*300);
    const ok=random()>(release==='v1'?.025:.04);
    const input_tokens=task==='deep'?4400:700;
    const output_tokens=task==='deep'?750:120;
    rows.push({id:`T-${String(rows.length+1).padStart(4,'0')}`,release,task,ok,queue_ms,retrieval_ms,model_ms,duration_ms:queue_ms+retrieval_ms+model_ms,input_tokens,output_tokens});
  }
}
const assumptions={limitMs:2500,target:.95,inputRate:2,outputRate:8};
await writeFile(new URL('../../docs/telemetry/requests.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
const report={dataset:'synthetic-telemetry-v1',seed:731,requests:rows.length,assumptions,comparison:compare(rows,assumptions),limits:['Single deterministic synthetic sample; no causal inference or confidence intervals.','No provider calls, actual billing, model quality labels or real traffic.','Rates are hypothetical USD per million tokens, not vendor prices.','No retries, caching, parallel spans, network streaming or partial billing modeled.']};
await writeFile(new URL('../../docs/telemetry/results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
