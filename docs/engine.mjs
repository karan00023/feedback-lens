// Shared by the browser demo, local server and evaluation runner.
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
const rules=[['Onboarding',/signup|onboard|account|getting started|invite link|login/i],['Billing',/billing|invoice|charged|charge|receipt|subscription|budget/i],['Search',/search|keyword|query|synonym/i],['Exports',/export|csv|downloaded|pdf/i],['Permissions',/permission|private project|access list|read-only|admin/i],['Notifications',/notification|digest|alert/i]];
export function theme(record) {return rules.find(([,re])=>re.test(record.text))?.[0]||'Other';}
export function baseline(question,records,options={}) {
  const sources=retrieve(question,records,options);
  return {status:sources.length?'answered':'insufficient_evidence',mode:'extractive',claims:sources.map(s=>({text:s.text,evidence:[{source_id:s.id,quote:s.text}]})),sources};
}
export function validateAnswer(answer,sources) {
  if(!answer||!['answered','insufficient_evidence'].includes(answer.status)||!Array.isArray(answer.claims)) throw new Error('Invalid answer structure.');
  if(answer.status==='insufficient_evidence'&&answer.claims.length) throw new Error('Abstentions must not include claims.');
  if(answer.status==='answered'&&!answer.claims.length) throw new Error('Answered responses require evidence.');
  if(answer.claims.length>6) throw new Error('Too many claims.');
  const allowed=new Map(sources.map(s=>[s.id,s.text]));
  for(const claim of answer.claims){
    if(typeof claim.text!=='string'||!claim.text.trim()||claim.text.length>2000||!Array.isArray(claim.evidence)||!claim.evidence.length) throw new Error('Every claim needs text and evidence.');
    for(const e of claim.evidence) if(typeof e.quote!=='string'||e.quote.trim().length<8||!allowed.get(e.source_id)?.includes(e.quote)) throw new Error('Citation is missing or its quote does not match the retrieved source.');
  }
  return answer;
}
