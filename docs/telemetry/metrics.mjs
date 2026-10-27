export function percentile(values, p) {
  if (!Array.isArray(values) || values.some(v => !Number.isFinite(v)) || !(p > 0 && p <= 1)) throw new Error('Invalid percentile input');
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  return sorted[Math.ceil(sorted.length*p)-1];
}
export function summarize(rows, {limitMs=2500, target=.95, inputRate=2, outputRate=8}={}) {
  if (!(target>0 && target<1) || !Number.isFinite(limitMs) || limitMs<0 || !Number.isFinite(inputRate) || inputRate<0 || !Number.isFinite(outputRate) || outputRate<0) throw new Error('Invalid assumptions');
  if (rows.some(r => !Number.isFinite(r.duration_ms) || r.duration_ms<0 || !Number.isFinite(r.input_tokens) || r.input_tokens<0 || !Number.isFinite(r.output_tokens) || r.output_tokens<0 || typeof r.ok!=='boolean')) throw new Error('Invalid request');
  const n=rows.length;
  const errors=rows.filter(r=>!r.ok).length;
  const bad=rows.filter(r=>!r.ok || r.duration_ms>limitMs).length;
  const cost=rows.reduce((s,r)=>s+(r.input_tokens*inputRate+r.output_tokens*outputRate)/1e6,0);
  return {n, errors, bad, p50:percentile(rows.map(r=>r.duration_ms),.5),p95:percentile(rows.map(r=>r.duration_ms),.95),errorRate:n?errors/n:null,goodRate:n?1-bad/n:null,burn:n?(bad/n)/(1-target):null,cost, costPerSuccess:n>errors?cost/(n-errors):null};
}
export function compare(rows, options) {
  return ['all','quick','deep'].map(task=>({task,...Object.fromEntries(['v1','v2'].map(release=>[release,summarize(rows.filter(r=>r.release===release && (task==='all'||r.task===task)),options)]))}));
}
