// Real loopback HTTP calls against synthetic feedback; no model/provider calls.
import {createServer} from '../../server.mjs';
const server=createServer();
const started=new Date().toISOString();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
try{
  for(let i=0;i<16;i++){
    const response=await fetch(base+'/api/answer',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({question:i%4===3?'Who won the football game?':'CSV export date column',mode:'extractive'})});
    if(response.status!==200) throw new Error('Unexpected smoke response.');
    await response.json();
  }
  const invalid=await fetch(base+'/api/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:''})});
  if(invalid.status!==400) throw new Error('Validation check failed.');
  await invalid.json();
  const format=await fetch(base+'/api/answer',{method:'POST',headers:{'Content-Type':'text/plain'},body:'smoke check'});
  if(format.status!==415) throw new Error('Content-type check failed.');
  await format.json();
  const snapshot=await (await fetch(base+'/api/telemetry')).json();
  if(snapshot.retention.total_observed!==18||snapshot.summary.completed!==18||snapshot.summary.http_errors!==2||snapshot.summary.answered!==12||snapshot.summary.abstained!==4) throw new Error('Telemetry counts do not match the observed smoke workflow.');
  console.log(JSON.stringify({started_at:started,finished_at:new Date().toISOString(),
    experiment:'Sequential loopback HTTP smoke run over synthetic feedback',
    environment:{node:process.version,platform:process.platform,arch:process.arch},
    planned_requests:18,provider_calls:0,limitations:[
      'One local process; sequential requests; no load or production-reliability inference.',
      'Durations use server-side response finish/close events, not client round-trip or model inference time.',
      'No warm-up exclusion, independent repeats, human quality labels, token measurements or billing.',
      'A successful HTTP answer can still be wrong; abstention is counted separately.'
    ],telemetry:snapshot},null,2));
}finally{await new Promise(resolve=>server.close(resolve));}
