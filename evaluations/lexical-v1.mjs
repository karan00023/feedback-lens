// Frozen copy of the original lexical retriever (commit e6699f9), kept unchanged
// so every evaluation run can compare the current engine against this baseline.
const stop = new Set('a an the and or to of in on for with from by as at is are was were be been do does did can could would should will have has had i me my we our us you your it its this that these those what which where why how when who users user people report reports problems problem about more than into same instead after before please need want give tell much all'.split(' '));
export function tokens(text) {
  return [...new Set((String(text).toLowerCase().match(/[a-z0-9]+/g)||[]).filter(t=>t.length>2&&!stop.has(t)).map(t=>t.endsWith('ies')?t.slice(0,-3)+'y':t.endsWith('s')&&!t.endsWith('ss')?t.slice(0,-1):t))];
}
export function retrieve(question, records, {limit=5, threshold=.14}={}) {
  const query=tokens(question);
  if(!query.length) return [];
  const sets=records.map(r=>new Set(tokens(r.text)));
  const weights=new Map(query.map(t=>[t,Math.log(1+records.length/(1+sets.filter(s=>s.has(t)).length))]));
  const total=query.reduce((n,t)=>n+weights.get(t),0);
  return records.map((r,i)=>({...r,score:query.reduce((n,t)=>n+(sets[i].has(t)?weights.get(t):0),0)/total}))
    .filter(r=>r.score>=threshold&&query.filter(t=>new Set(tokens(r.text)).has(t)).length>=Math.min(2,query.length)).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,limit);
}
