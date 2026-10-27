// Bounded process-local metadata. Never accept request bodies or arbitrary labels.
export function createRequestMetrics({capacity=200}={}){
  if(!Number.isInteger(capacity)||capacity<1||capacity>10000) throw new Error('Invalid telemetry capacity.');
  let total=0;
  const records=[];
  const percentile=(values,p)=>values.length?values.toSorted((a,b)=>a-b)[Math.ceil(values.length*p)-1]:null;
  return {
    record({mode,outcome,status,duration_ms,completion}){
      if(!Number.isFinite(duration_ms)||duration_ms<0) throw new Error('Invalid duration.');
      const finished=completion==='finished';
      const row={request_id:++total,route:'/api/answer',method:'POST',
        mode:['extractive','live'].includes(mode)?mode:'unknown',
        outcome:finished&&['answered','insufficient_evidence'].includes(outcome)?outcome:'error',
        status:finished&&Number.isInteger(status)&&status>=100&&status<=599?status:null,
        duration_ms:Number(duration_ms.toFixed(3)),completion:finished?'finished':'aborted'};
      records.push(row);
      if(records.length>capacity) records.shift();
    },
    snapshot(){
      const copy=records.map(row=>({...row}));
      const summarize=rows=>{
        const finished=rows.filter(r=>r.completion==='finished');
        const times=finished.map(r=>r.duration_ms);
        return {retained:rows.length,completed:finished.length,aborted:rows.length-finished.length,
          http_errors:finished.filter(r=>r.status>=400).length,
          answered:finished.filter(r=>r.outcome==='answered').length,
          abstained:finished.filter(r=>r.outcome==='insufficient_evidence').length,
          p50_ms:percentile(times,.5),p95_ms:percentile(times,.95)};
      };
      return {schema_version:1,scope:'Local Node HTTP response lifecycle; not model latency or answer accuracy',
        retention:{capacity,total_observed:total,retained:copy.length,evicted:total-copy.length},
        summary:summarize(copy),by_mode:Object.fromEntries(['extractive','live','unknown'].map(mode=>[mode,summarize(copy.filter(r=>r.mode===mode))])),
        token_usage:null,cost_usd:null,records:copy};
    }
  };
}
