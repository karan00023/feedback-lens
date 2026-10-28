// Personal portfolio simulator. No provider calls, tax, payment processing or production enforcement.
export const RATE_CARD = Object.freeze({
  swift: { inputMilliPerMillion: 2000, outputMilliPerMillion: 8000 },
  deep: { inputMilliPerMillion: 10000, outputMilliPerMillion: 30000 }
});
export const SAMPLE = [
  {eventId:"e1",requestId:"r1",team:"Atlas",model:"swift",inputTokens:400000,outputTokens:100000,status:"completed"},
  {eventId:"e2",requestId:"r2",team:"Atlas",model:"deep",inputTokens:200000,outputTokens:80000,status:"completed"},
  {eventId:"e3",requestId:"r3",team:"Beacon",model:"swift",inputTokens:300000,outputTokens:120000,status:"completed"},
  {eventId:"e4",requestId:"r4",team:"Beacon",model:"deep",inputTokens:100000,outputTokens:40000,status:"completed"},
  {eventId:"e5",requestId:"r5",team:"Atlas",model:"swift",inputTokens:10000,outputTokens:0,status:"failed"},
  {eventId:"e6",requestId:"r6",team:"Beacon",model:"deep",inputTokens:8000,outputTokens:0,status:"aborted"}
];
const KEYS = ["eventId","requestId","team","model","inputTokens","outputTokens","status"];
const id = v => typeof v === "string" && /^[A-Za-z0-9_-]{1,48}$/.test(v);
const canonical = e => JSON.stringify(Object.keys(e).sort().map(k=>[k,e[k]]));
function validate(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return "Event must be an object";
  if (Object.keys(e).some(k=>!KEYS.includes(k)) || KEYS.some(k=>!Object.hasOwn(e,k))) return "Use exactly the seven metadata fields; no prompts or extra payload";
  if (![e.eventId,e.requestId,e.team,e.model].every(id)) return "Identifiers: 1–48 letters, digits, underscore or hyphen";
  if (!["completed","failed","aborted"].includes(e.status)) return "Unknown status";
  if (![e.inputTokens,e.outputTokens].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1e9)) return "Tokens must be whole numbers from 0 to 1 billion";
  return null;
}
export function money(nanos) {
  let n = BigInt(nanos);
  if (n < 0n) throw new Error("Negative amount");
  const cents = (n + 5000000n) / 10000000n;
  return "$" + (cents/100n) + "." + String(cents%100n).padStart(2,"0");
}
export function reconcile(events, {budgetCents=1000, multiplier=100, signoffs=false}={}) {
  if (!Array.isArray(events) || events.length>1000) throw new Error("Provide a JSON array with at most 1,000 events");
  if (!Number.isSafeInteger(budgetCents)||budgetCents<0||budgetCents>1e9) throw new Error("Budget must be whole cents from 0 to 1 billion");
  if (!Number.isSafeInteger(multiplier)||multiplier<0||multiplier>300) throw new Error("Pricing percentage must be an integer from 0 to 300");
  const groups = new Map(), rejected=[], excluded=[], lines=[];
  for (let i=0;i<events.length;i++) {
    const e=events[i], problem=validate(e);
    if(problem){rejected.push({row:i+1,eventId:typeof e?.eventId==="string"?e.eventId.slice(0,48):"unknown",reason:problem});continue;}
    if(!groups.has(e.eventId))groups.set(e.eventId,[]);
    groups.get(e.eventId).push({e,row:i+1});
  }
  // A malformed occurrence sharing a valid ID taints the whole group: never let a bad replay slip through.
  const tainted = new Set(rejected.map(x=>x.eventId));
  let duplicates=0;
  const candidates=[];
  for (const [eventId,group] of groups) {
    if(tainted.has(eventId)||new Set(group.map(x=>canonical(x.e))).size>1){
      for(const x of group)rejected.push({row:x.row,eventId,reason:"Conflicting event ID; all occurrences quarantined"});
      continue;
    }
    duplicates+=group.length-1;
    const {e,row}=group[0];
    if(e.status!=="completed"){excluded.push({eventId,reason:e.status+"; zero billed by this demo policy"});continue;}
    if(!Object.hasOwn(RATE_CARD,e.model)){rejected.push({row,eventId,reason:"No versioned rate for model"});continue;}
    candidates.push({e,row});
  }
  const requests=new Map();
  for(const x of candidates){const k=x.e.requestId;if(!requests.has(k))requests.set(k,[]);requests.get(k).push(x);}
  let total=0n, baseline=0n;
  const teams=new Map();
  for(const group of requests.values()){
    if(group.length>1){for(const x of group)rejected.push({row:x.row,eventId:x.e.eventId,reason:"Multiple completion events for one request; investigate before billing"});continue;}
    const {e}=group[0],r=RATE_CARD[e.model];
    const base=BigInt(e.inputTokens)*BigInt(r.inputMilliPerMillion)+BigInt(e.outputTokens)*BigInt(r.outputMilliPerMillion);
    const cost=(base*BigInt(multiplier)+50n)/100n;
    lines.push({...e,baselineNanos:String(base),costNanos:String(cost)});
    total+=cost;baseline+=base;teams.set(e.team,(teams.get(e.team)||0n)+cost);
  }
  const blockers=[];
  if(!lines.length)blockers.push("No billable completed requests");
  if(rejected.length)blockers.push(rejected.length+" quarantined input rows require investigation");
  if(total>BigInt(budgetCents)*10000000n)blockers.push("Replayed spend exceeds the batch budget; no traffic is actually blocked");
  if(!signoffs)blockers.push("Finance and engineering review not acknowledged in this browser session");
  return {schemaVersion:1,rateCardVersion:"fictional-v1",dataKind:"user-supplied-or-synthetic-metadata",policy:"Only completed requests billed; invoice rounding once at batch total; unknown or conflicting usage quarantined",
    inputRows:events.length,duplicates,excluded,rejected,lines,totalNanos:String(total),baselineNanos:String(baseline),
    teams:[...teams].sort(([a],[b])=>a.localeCompare(b)).map(([team,n])=>({team,costNanos:String(n)})),
    budgetCents,multiplier,signoffs,blockers,technicalGate:blockers.length?"HOLD":"REPLAY CHECKS PASS"};
}
