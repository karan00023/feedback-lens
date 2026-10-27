import {createHash} from 'node:crypto';
import {validateAnswer} from '../../docs/engine.mjs';
import {percentile} from '../../docs/telemetry/metrics.mjs';

export const hash=text=>createHash('sha256').update(text).digest('hex');
const fail=message=>{throw new Error(message);};
const nonnegative=v=>Number.isFinite(v)&&v>=0;
const text=v=>typeof v==='string'&&v.trim().length>0;

export function validateDataset(dataset){
  if(!text(dataset.version)||!Array.isArray(dataset.cases)||!dataset.cases.length) fail('Dataset requires a version and cases.');
  const ids=new Set();
  for(const c of dataset.cases){
    if(!text(c.id)||ids.has(c.id)||!text(c.question)||!Array.isArray(c.sources)||!c.expected)fail('Invalid or duplicate dataset case.');
    ids.add(c.id);
    const sources=new Set();
    for(const s of c.sources){if(!text(s.id)||!text(s.text)||sources.has(s.id))fail('Invalid or duplicate source.');sources.add(s.id);}
    if(!['answered','insufficient_evidence'].includes(c.expected.status)||!Array.isArray(c.expected.source_ids))fail('Invalid expected answer.');
    if(new Set(c.expected.source_ids).size!==c.expected.source_ids.length||c.expected.source_ids.some(id=>!sources.has(id)))fail('Invalid expected source IDs.');
    if((c.expected.status==='answered')!==!!c.expected.source_ids.length)fail('Expected status and sources disagree.');
  }
  return dataset;
}

export function validateRun(run,dataset,{datasetHash,promptHash}){
  if(run.schema_version!==1||!text(run.run_id)||!text(run.provider)||!text(run.model_id)||!['fixture','declared_live'].includes(run.execution))fail('Invalid run identity or execution label.');
  if(run.dataset_sha256!==datasetHash||run.prompt_sha256!==promptHash)fail('Dataset or prompt hash mismatch.');
  if(!Number.isInteger(run.trials)||run.trials<1||run.trials>100)fail('Trials must be between 1 and 100.');
  if(!run.settings||typeof run.settings!=='object'||Array.isArray(run.settings)||!Array.isArray(run.rows))fail('Settings and rows are required.');
  const ids=new Set(dataset.cases.map(c=>c.id)),seen=new Set();
  for(const r of run.rows){
    const key=`${r.case_id}:${r.trial}`;
    if(!ids.has(r.case_id)||!Number.isInteger(r.trial)||r.trial<1||r.trial>run.trials||seen.has(key))fail('Unknown case, invalid trial or duplicate result.');
    seen.add(key);
    if(!['ok','error'].includes(r.outcome)||!nonnegative(r.latency_ms))fail('Invalid outcome or latency.');
    for(const field of ['input_tokens','output_tokens'])if(r[field]!==null&&(!Number.isSafeInteger(r[field])||r[field]<0))fail('Token usage must be a non-negative integer or null.');
    if(r.actual_cost_usd!==null&&!nonnegative(r.actual_cost_usd))fail('Actual cost must be non-negative or null.');
    if(r.outcome==='error'&&r.answer!==null)fail('Error rows must not include an answer.');
  }
  return run;
}

export function scoreRun(run,dataset,hashes){
  validateDataset(dataset);validateRun(run,dataset,hashes);
  const byKey=new Map(run.rows.map(r=>[`${r.case_id}:${r.trial}`,r]));
  const results=[];
  for(const c of dataset.cases)for(let trial=1;trial<=run.trials;trial++){
    const row=byKey.get(`${c.id}:${trial}`);
    let reason=null,valid=false,statusCorrect=false,sourceSetExact=false;
    if(!row)reason='missing';
    else if(row.outcome==='error')reason='execution_error';
    else{
      try{validateAnswer(row.answer,c.sources);valid=true;}catch{reason='invalid_answer_or_citation';}
      if(valid){
        statusCorrect=row.answer.status===c.expected.status;
        const actual=new Set(row.answer.claims.flatMap(x=>x.evidence.map(e=>e.source_id)));
        sourceSetExact=actual.size===c.expected.source_ids.length&&c.expected.source_ids.every(id=>actual.has(id));
        if(!statusCorrect)reason='status_mismatch';else if(!sourceSetExact)reason='source_set_mismatch';
      }
    }
    results.push({case_id:c.id,trial,structural_citation_valid:valid,status_correct:statusCorrect,source_set_exact:sourceSetExact,automated_pass:valid&&statusCorrect&&sourceSetExact,reason,human_semantic_review:'pending'});
  }
  const attempts=results.length,completed=run.rows.filter(r=>r.outcome==='ok');
  const tokenComplete=run.rows.length===attempts&&run.rows.every(r=>r.input_tokens!==null&&r.output_tokens!==null);
  const costComplete=run.rows.length===attempts&&run.rows.every(r=>r.actual_cost_usd!==null);
  return {
    run_id:run.run_id,provider:run.provider,model_id:run.model_id,execution:run.execution,settings:run.settings,
    expected_attempts:attempts,received:run.rows.length,missing:attempts-run.rows.length,execution_errors:run.rows.filter(r=>r.outcome==='error').length,
    structural_citation_valid_rate:results.filter(r=>r.structural_citation_valid).length/attempts,
    status_agreement_rate:results.filter(r=>r.status_correct).length/attempts,
    exact_source_set_rate:results.filter(r=>r.source_set_exact).length/attempts,
    automated_pass_rate:results.filter(r=>r.automated_pass).length/attempts,
    p95_completed_response_ms:percentile(completed.map(r=>r.latency_ms),.95),
    token_usage_complete:tokenComplete,total_input_tokens:tokenComplete?run.rows.reduce((n,r)=>n+r.input_tokens,0):null,total_output_tokens:tokenComplete?run.rows.reduce((n,r)=>n+r.output_tokens,0):null,
    actual_cost_complete:costComplete,total_actual_cost_usd:costComplete?run.rows.reduce((n,r)=>n+r.actual_cost_usd,0):null,
    semantic_correctness:null,human_reviewed:0,results
  };
}

export function compareRuns(runs,dataset,hashes){
  if(!Array.isArray(runs)||!runs.length)fail('At least one run is required.');
  const ids=new Set();
  for(const r of runs){if(ids.has(r.run_id))fail('Duplicate run IDs.');ids.add(r.run_id);if(r.trials!==runs[0].trials)fail('Runs require the same trial count.');}
  return {schema_version:1,dataset_version:dataset.version,...hashes,trials:runs[0].trials,
    warnings:['Automatic checks measure structure, literal citations, reference source sets and abstention, not claim entailment or overall quality.','Completion latency excludes missing and execution-error rows but includes structurally invalid completed answers. Read failure and coverage counts alongside it.','Cost and token totals stay null when any expected attempt lacks usage. Values supplied by an importer are not independently verified billing.','Fixture timing and outputs are scripted. declared_live is an unverified importer declaration, not proof that a provider was called.','Dataset cases are authored development fixtures visible to the coding agent. No held-out performance is claimed.'],
    runs:runs.map(r=>scoreRun(r,dataset,hashes))};
}
