import {summarize,compare} from './metrics.mjs';
const $=id=>document.getElementById(id);
const fmt=(v,d=0)=>v===null?'—':v.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
let rows=[],selected=null;
function options(){return {limitMs:Number($('limit').value),target:Number($('target').value)/100,inputRate:Number($('input-rate').value),outputRate:Number($('output-rate').value)};}
function card(release,s){return `<article class="release"><h3>${release} / ${s.n} requests</h3><div class="stats"><div><strong>${fmt(s.p50)} <small>ms</small></strong><span>p50 latency</span></div><div><strong>${fmt(s.p95)} <small>ms</small></strong><span>p95 latency</span></div><div><strong>${fmt(s.errorRate*100,1)}%</strong><span>Request error rate</span></div><div><strong>${fmt(s.goodRate*100,1)}%</strong><span>Good requests</span></div><div><strong>${fmt(s.burn,2)}×</strong><span>Sample budget burn</span></div><div><strong>$${fmt(s.costPerSuccess,4)}</strong><span>Assumed cost / success</span></div></div></article>`;}
function detail(r){
  if(!r){$('detail').textContent='No requests in this scope.';return;}
  $('detail').innerHTML=`<p class="eyebrow">REQUEST BREAKDOWN</p><h3>${r.id} / ${r.release}</h3><p>${r.task} · ${r.ok?'Succeeded':'Failed'} · ${fmt(r.duration_ms)} ms</p><div class="stages" aria-label="Sequential duration: queue ${r.queue_ms}, retrieval ${r.retrieval_ms}, model ${r.model_ms} milliseconds">${['queue','retrieval','model'].map(k=>`<span style="width:${r[k+'_ms']/r.duration_ms*100}%"></span>`).join('')}</div>${['queue','retrieval','model'].map(k=>`<div class="stage-label"><span>${k}</span><strong>${r[k+'_ms']} ms</strong></div>`).join('')}<p class="caption">Input ${fmt(r.input_tokens)} tokens / output ${fmt(r.output_tokens)} tokens. Stages are sequential, simulated durations. These are not actual provider traces or an OTLP export.</p>`;
}
function render(){
  try{
    const controls=['limit','target','input-rate','output-rate'];
    if(controls.some(id=>!$(id).value||!$(id).checkValidity()))throw new Error('Enter valid non-negative assumptions and a target below 100%. Results retain the last valid settings.');
    const opt=options(),task=$('task').value;
    const scoped=rows.filter(r=>task==='all'||r.task===task);
    const c=compare(scoped,opt)[0];
    $('error').textContent='';$('scope').textContent=`${scoped.length} requests / ${task==='all'?'all workloads':task+' tasks'}`;
    $('summary').innerHTML=card('v1',c.v1)+card('v2',c.v2);
    const max=Math.max(c.v1.p50,c.v2.p50,1);
    $('chart').innerHTML=['v1','v2'].map(v=>`<div class="bar-row"><span>${v}</span><div class="track"><div class="bar ${v}" style="width:${c[v].p50/max*100}%"></div></div><strong>${fmt(c[v].p50)} ms</strong></div>`).join('');
    $('interpretation').textContent=task==='all'?'Aggregate p50 rises from 953 to 2,543 ms while deep tasks grow from 10% to 60% of traffic. Inspect both cohorts before attributing the change to the release.':`In ${task} tasks, v2 has lower p50 latency in this synthetic sample. This does not establish model quality or a causal production improvement.`;
    const tail=scoped.filter(r=>r.release===$('release').value).sort((a,b)=>b.duration_ms-a.duration_ms).slice(0,10);
    $('traces').innerHTML=tail.map(r=>`<tr><td><button data-id="${r.id}" aria-label="Inspect request ${r.id}">${r.id}</button></td><td>${r.task}</td><td>${fmt(r.duration_ms)} ms</td><td>${r.ok?'OK':'Error'}</td></tr>`).join('');
    selected=tail.find(r=>r.id===selected?.id)||tail[0];detail(selected);
  }catch(e){$('error').textContent=e.message;}
}
$('traces').addEventListener('click',e=>{const b=e.target.closest('button[data-id]');if(b){selected=rows.find(r=>r.id===b.dataset.id);detail(selected);}});
for(const id of ['task','release','limit','target','input-rate','output-rate'])$(id).addEventListener('input',render);
try{const response=await fetch('requests.json');if(!response.ok)throw new Error();rows=await response.json();render();}catch{$('error').textContent='Could not load the synthetic request dataset. Reload to try again.';}
