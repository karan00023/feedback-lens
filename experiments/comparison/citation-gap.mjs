import {readFile,writeFile} from 'node:fs/promises';
import {hash,scoreRun} from './harness.mjs';
const original=JSON.parse(await readFile(new URL('fixtures/dataset.json',import.meta.url),'utf8'));
const dataset={version:'citation-gap-dev-v1',cases:[original.cases[0]]};
const prompt=await readFile(new URL('prompt.txt',import.meta.url),'utf8');
const hashes={datasetHash:hash(JSON.stringify(dataset)),promptHash:hash(prompt)};
const c=dataset.cases[0],s=c.sources[0];
const claims=[{id:'supported-control',text:s.text,authored_support_label:true},{id:'unsupported-counterexample',text:'Revenue increased by a billion dollars.',authored_support_label:false}];
const results=claims.map(example=>{
  const run={schema_version:1,run_id:example.id,provider:'scripted-fixture',model_id:'no-model',execution:'fixture',dataset_sha256:hashes.datasetHash,prompt_sha256:hashes.promptHash,trials:1,settings:{note:'Scripted counterexample; no inference or measured latency.'},rows:[{case_id:c.id,trial:1,outcome:'ok',latency_ms:0,input_tokens:null,output_tokens:null,actual_cost_usd:null,answer:{status:'answered',claims:[{text:example.text,evidence:[{source_id:s.id,quote:s.text}]}]}}]};
  const score=scoreRun(run,dataset,hashes);
  return {...example,automatic_check_pass:score.results[0].automated_pass,semantic_correctness_reported_by_harness:score.semantic_correctness};
});
if(!results.every(r=>r.automatic_check_pass)||results[1].authored_support_label!==false)throw new Error('Counterexample did not reproduce.');
const result={study:'citation-gap-dev-v1',execution:'scripted-fixture',question:c.question,source:s,results,limitations:['Two deliberately authored examples, not model outputs or a benchmark.','Support labels are authored for this diagnostic, not an independent human review.','No general unsupported-answer rate or provider comparison follows from this demonstration.']};
await writeFile(new URL('../../docs/research/citation-gap-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log('Reproduced: both answers pass automatic checks; the second claim is unsupported by the cited signup evidence. No model called.');
