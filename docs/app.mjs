import {theme,baseline} from './engine.mjs';
const $=s=>document.querySelector(s);let records=[],activeTheme='All',liveAvailable=false;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function channelRecords(){return records.filter(r=>$('#channel').value==='all'||r.channel===$('#channel').value);}
function render(){
  const scoped=channelRecords(),names=['All','Onboarding','Billing','Search','Exports','Permissions','Notifications','Other'];
  $('#theme-list').innerHTML=names.map(n=>`<button class="theme ${activeTheme===n?'selected':''}" aria-pressed="${activeTheme===n}" data-theme="${n}">${n}<span>${scoped.filter(r=>n==='All'||theme(r)===n).length}</span></button>`).join('');
  const q=$('#search').value.toLowerCase();const visible=scoped.filter(r=>(activeTheme==='All'||theme(r)===activeTheme)&&r.text.toLowerCase().includes(q));
  $('#visible-count').textContent=`${visible.length} records`;
  $('#records').innerHTML=visible.length?visible.map(r=>`<article class="record" id="${r.id}" tabindex="-1"><div class="record-meta"><strong>${r.id} / ${esc(r.channel)}</strong><time>${r.date}</time></div><p>${esc(r.text)}</p><span class="tag">${theme(r)}</span><span class="tag ${r.severity==='high'?'high':''}">${r.severity==='unrated'?'test fixture':esc(r.severity)+' severity'}</span></article>`).join(''):'<p class="empty">No matching records. Try another filter.</p>';
}
function showAnswer(a,elapsed){
  const head=`<div class="answer-header"><span>${a.mode==='live'?'LIVE LLM · QUOTES VALIDATED':'EXTRACTIVE BASELINE · NO LLM'}</span><span>${elapsed} ms</span></div>`;
  $('#answer').innerHTML=head+(a.status==='insufficient_evidence'?'<div class="answer-empty"><h3>Not enough evidence.</h3><p>The retrieved sample does not support an answer. Try a more specific feedback question, or broaden the channel filter.</p></div>':a.claims.map(c=>`<div class="claim"><p>${esc(c.text)}</p>${c.evidence.map(e=>`<button class="cite" data-source="${esc(e.source_id)}" title="${esc(e.quote)}">${esc(e.source_id)} ↗</button>`).join('')}</div>`).join(''));
  if(a.mode==='live') {const p=document.createElement('p');p.className='small';p.textContent='Exact quotes were checked against retrieved records. Semantic support still needs human review.';$('#answer').append(p);}
}
async function ask(e){e?.preventDefault();const question=$('#question').value.trim();if(!question)return;$('#ask').disabled=true;$('#ask').textContent='Reading…';$('#error').hidden=true;
  try{const start=performance.now();let answer;
    if($('#mode').value==='live'&&liveAvailable){const r=await fetch('./api/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,mode:'live',channel:$('#channel').value})});const payload=await r.json();if(!r.ok)throw Error(payload.error||'Answer unavailable.');answer=payload;}
    else answer=baseline(question,channelRecords());
    showAnswer(answer,Math.round(performance.now()-start));
  }catch(err){$('#error').textContent=err.message;$('#error').hidden=false;}finally{$('#ask').disabled=false;$('#ask').textContent='Investigate ↗';}
}
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-theme]');if(t){activeTheme=t.dataset.theme;render();}
  const ex=e.target.closest('[data-question]');if(ex){$('#question').value=ex.dataset.question;ask();}
  const c=e.target.closest('[data-source]');if(c){activeTheme='All';$('#search').value='';render();const el=document.getElementById(c.dataset.source);if(el){el.classList.add('highlight');el.scrollIntoView({block:'nearest'});el.focus({preventScroll:true});}}
});
$('#search').addEventListener('input',render);$('#channel').addEventListener('change',()=>{render();$('#answer').innerHTML='<p class="empty">Channel changed. Ask again to use the new scope.</p>';});
$('#reset').addEventListener('click',()=>{activeTheme='All';$('#search').value='';$('#channel').value='all';render();$('#answer').innerHTML='<p class="empty">Filters reset. Ask a question to investigate.</p>';});$('#question-form').addEventListener('submit',ask);
try{const response=await fetch('./data/feedback.json');if(!response.ok)throw Error('Could not load sample feedback.');records=await response.json();render();$('#record-count').textContent=records.length;}catch(e){$('#records').textContent=e.message;}
try{const response=await fetch('./data/evaluation.json');if(!response.ok)throw Error();const r=await response.json();const pct=n=>(n*100).toFixed(0)+'%';$('#eval-results').innerHTML=[['Queries',r.cases],['Recall at 5',pct(r.mean_recall_at_5)],['Mean reciprocal rank',r.mrr.toFixed(2)],['Abstention accuracy',pct(r.abstention_accuracy)]].map(([l,v])=>`<div class="eval-stat"><strong>${v}</strong><span>${l}</span></div>`).join('')+`<p class="eval-caption">${r.answerable_cases} answerable / ${r.unanswerable_cases} unanswerable · ${esc(r.dataset)} · baseline only<br>Development diagnostics, not a held-out benchmark. Report includes failures.</p>`;}catch{$('#eval-results').textContent='Evaluation report not available. Run npm run evaluate locally.';}
if(['127.0.0.1','localhost'].includes(location.hostname)){try{const s=await fetch('./api/status');if(s.ok){const status=await s.json();liveAvailable=status.live;if(liveAvailable){const option=$('#mode option[value=live]');option.disabled=false;option.textContent='Live LLM';}}}catch{}}
