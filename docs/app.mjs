import {THEMES, theme, baseline, tokens} from './engine.mjs';

const $ = selector => document.querySelector(selector);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const plural = (n, word) => `${n} ${n === 1 ? word : word === 'query' ? 'queries' : word + 's'}`;
const CHANNEL_NAMES = {all: 'all channels', support: 'support tickets', interview: 'interviews', survey: 'surveys'};
const MAX_QUESTION = 500;

const state = {
  records: [],
  loaded: false,
  activeTheme: 'All',
  citedIds: new Set(),
  lastQuestion: '',
  liveAvailable: false,
  highlighted: null,
};

function announce(message) {
  // Clear first so repeating the same message is still read out.
  $('#announcer').textContent = '';
  requestAnimationFrame(() => { $('#announcer').textContent = message; });
}

// ---------- Scope and library ----------

const channel = () => $('#channel').value;
const scopedRecords = () => state.records.filter(r => channel() === 'all' || r.channel === channel());

function libraryRecords() {
  const query = $('#search').value.trim().toLowerCase();
  const citedOnly = $('#cited-only').checked;
  return scopedRecords().filter(r =>
    (state.activeTheme === 'All' || theme(r) === state.activeTheme) &&
    (!query || r.text.toLowerCase().includes(query) || r.id.toLowerCase().includes(query)) &&
    (!citedOnly || state.citedIds.has(r.id)));
}

function libraryFiltered() {
  return state.activeTheme !== 'All' || $('#search').value.trim() !== '' || $('#cited-only').checked;
}

function renderLibrary() {
  if (!state.loaded) return;
  const scoped = scopedRecords();
  $('#theme-list').innerHTML = ['All', ...THEMES].map(name => {
    const count = scoped.filter(r => name === 'All' || theme(r) === name).length;
    const selected = state.activeTheme === name;
    return `<button type="button" class="theme${selected ? ' selected' : ''}" aria-pressed="${selected}" data-theme="${name}">${name}<span>${count}</span></button>`;
  }).join('');

  const visible = libraryRecords();
  $('#visible-count').textContent = `Showing ${visible.length} of ${scoped.length} in ${CHANNEL_NAMES[channel()]}`;
  $('#cited-only').disabled = state.citedIds.size === 0;
  $('#reset').hidden = !libraryFiltered();

  $('#records').innerHTML = visible.length ? visible.map(r => {
    const cited = state.citedIds.has(r.id);
    const highlighted = state.highlighted === r.id;
    return `<article class="record${cited ? ' cited' : ''}${highlighted ? ' highlight' : ''}" id="${esc(r.id)}" tabindex="-1" aria-label="${esc(r.id)}">
      <div class="record-meta"><strong>${esc(r.id)} · ${esc(r.channel)}</strong><time datetime="${esc(r.date)}">${esc(r.date)}</time></div>
      <p>${esc(r.text)}</p>
      <div class="tags">
        <span class="tag">${theme(r)}</span>
        <span class="tag${r.severity === 'high' ? ' high' : ''}">${r.severity === 'unrated' ? 'injection test fixture' : esc(r.severity) + ' severity'}</span>
        ${cited ? '<span class="tag cited-tag">Cited in answer</span>' : ''}
        ${highlighted ? '<button type="button" class="text-button back-to-answer" data-back>↑ Back to answer</button>' : ''}
      </div>
    </article>`;
  }).join('') : `<div class="empty"><p>No records match these library filters.</p>${libraryFiltered() ? '<button type="button" class="text-button" data-reset-library>Clear library filters</button>' : ''}</div>`;
}

function resetLibrary() {
  state.activeTheme = 'All';
  $('#search').value = '';
  $('#cited-only').checked = false;
}

// ---------- Answers ----------

// Wraps the words that matched the question so readers can see why a record was retrieved.
function highlight(text, matchedTerms = []) {
  const terms = new Set(matchedTerms);
  return text.split(/([A-Za-z0-9']+)/).map((part, i) => {
    if (i % 2 === 0) return esc(part);
    return terms.has(tokens(part)[0]) ? `<mark>${esc(part)}</mark>` : esc(part);
  }).join('');
}

function evidenceSummary(sources) {
  const byChannel = {};
  for (const s of sources) byChannel[s.channel] = (byChannel[s.channel] || 0) + 1;
  const channels = Object.entries(byChannel).map(([c, n]) => `${n} ${c}`).join(', ');
  const high = sources.filter(s => s.severity === 'high').length;
  return `${plural(sources.length, 'record')} matched (${channels})${high ? `; ${high} marked high severity` : ''}.`;
}

// Shows the question's own words instead of internal stems such as "revenu".
function termList(terms, question) {
  const words = new Map();
  for (const word of question.match(/[A-Za-z0-9']+/g) || []) {
    const t = tokens(word)[0];
    if (t && !words.has(t)) words.set(t, word.toLowerCase());
  }
  return terms.length ? terms.map(t => `<code>${esc(words.get(t) || t)}</code>`).join(' ') : '<em>none</em>';
}

function relatedList(retrieval, question) {
  if (!retrieval.related?.length) return '';
  return `<dt>Not used as evidence</dt><dd>${retrieval.related.map(r =>
    `<button type="button" class="text-button" data-source="${esc(r.id)}">${esc(r.id)}</button> <span class="small">shares ${termList(r.matched_terms, question)}</span>`).join('<br>')}</dd>`;
}

function whyDetails(retrieval, question, open) {
  if (!retrieval) return '';
  return `<details class="why"${open ? ' open' : ''}>
    <summary>Why this result?</summary>
    <dl>
      <dt>Searched terms</dt><dd>${termList(retrieval.terms, question)} <span class="small">(common words removed; word endings ignored)</span></dd>
      <dt>Not found in scope</dt><dd>${termList(retrieval.missing_terms, question)}</dd>
      <dt>Rule applied</dt><dd>${esc(retrieval.reason)}</dd>
      ${relatedList(retrieval, question)}
    </dl>
    <p class="small">Retrieval is keyword-based. Synonyms such as “billed” and “charged” do not match, so a missing answer can mean the wording differs, not that the feedback does not exist.</p>
  </details>`;
}

function renderAnswer(answer, question) {
  const scope = CHANNEL_NAMES[channel()];
  const live = answer.mode === 'live';
  const badge = live
    ? `<span class="badge live">Live LLM${answer.model ? ' · ' + esc(answer.model) : ''} · quotes validated</span>`
    : '<span class="badge">Extractive baseline · no LLM</span>';
  const header = `<div class="answer-header">${badge}<span class="small">Scope: ${esc(scope)}</span></div>
    <p class="answer-question">“${esc(question)}”</p>`;

  if (answer.status === 'insufficient_evidence') {
    let broaden = '';
    if (channel() !== 'all' && !live) {
      const wider = baseline(question, state.records);
      if (wider.status === 'answered') {
        broaden = `<p>${plural(wider.sources.length, 'matching record')} ${wider.sources.length === 1 ? 'exists' : 'exist'} outside ${esc(scope)}.</p>
          <button type="button" class="secondary" data-broaden>Search all channels instead</button>`;
      }
    }
    $('#answer').innerHTML = `${header}
      <div class="abstain" role="note">
        <h4>Not enough evidence in ${esc(scope)}.</h4>
        <p>Feedback Lens will not guess. ${esc(answer.retrieval?.reason || 'No retrieved record supports an answer.')}</p>
        ${broaden}
      </div>${whyDetails(answer.retrieval, question, true)}`;
    return;
  }

  const weak = answer.retrieval?.match === 'single-term';
  const sourceById = new Map(answer.sources.map(s => [s.id, s]));
  const claims = answer.claims.map(claim => {
    const cites = claim.evidence.map(e => {
      const source = sourceById.get(e.source_id);
      return `<button type="button" class="cite" data-source="${esc(e.source_id)}">Show ${esc(e.source_id)} in library</button>
        <span class="small">${source ? esc(source.channel) + ' · ' + esc(source.date) : ''}</span>`;
    }).join(' ');
    const body = live
      ? `<p>${esc(claim.text)}</p>${claim.evidence.map(e => `<blockquote>${esc(e.quote)}</blockquote>`).join('')}`
      : `<blockquote>${highlight(claim.text, sourceById.get(claim.evidence[0].source_id)?.matched_terms)}</blockquote>`;
    return `<li class="claim">${body}<div class="cite-row">${cites}</div></li>`;
  }).join('');

  $('#answer').innerHTML = `${header}
    <h4 class="answer-title">${evidenceSummary(answer.sources)}</h4>
    ${weak ? '<p class="weak-note">Weaker match: each record shares only one term with the question. Read the quotes before relying on them.</p>' : ''}
    <p class="small">${live
      ? 'Claims are model-written. Each quote was checked to appear exactly in a retrieved record; whether the claim follows from it still needs human review.'
      : 'These are the matching records quoted word for word, strongest match first. Highlighted words matched your question. Nothing is summarized or inferred.'}</p>
    <ol class="claims">${claims}</ol>
    ${answer.retrieval?.related?.length ? `<p class="small">${plural(answer.retrieval.related.length, 'other record')} share${answer.retrieval.related.length === 1 ? 's' : ''} a term with the question but did not meet the evidence rule. They are listed under “Why this result?”, not cited.</p>` : ''}
    ${live && answer.usage ? `<p class="small">Tokens: ${answer.usage.input_tokens} in / ${answer.usage.output_tokens} out.</p>` : ''}
    ${whyDetails(answer.retrieval, question, false)}`;
}

function showQuestionError(message) {
  $('#question-error').textContent = message;
  $('#question-error').hidden = !message;
  $('#question').setAttribute('aria-invalid', message ? 'true' : 'false');
}

async function getAnswer(question) {
  if ($('#mode').value === 'live' && state.liveAvailable) {
    const response = await fetch('./api/answer', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({question, mode: 'live', channel: channel()}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `The local server returned ${response.status}.`);
    return payload;
  }
  return baseline(question, scopedRecords());
}

async function ask({focus = true} = {}) {
  const question = $('#question').value.trim();
  if (!state.loaded) return;
  if (!question) {
    showQuestionError('Enter a question about the feedback, for example “What breaks CSV export?”');
    $('#question').focus();
    return;
  }
  showQuestionError('');
  const button = $('#ask');
  button.disabled = true;
  button.textContent = 'Searching…';
  $('#answer').setAttribute('aria-busy', 'true');
  try {
    const answer = await getAnswer(question);
    state.lastQuestion = question;
    state.citedIds = new Set(answer.status === 'answered' ? answer.claims.flatMap(c => c.evidence.map(e => e.source_id)) : []);
    state.highlighted = null;
    if (!state.citedIds.size) $('#cited-only').checked = false;
    renderAnswer(answer, question);
    renderLibrary();
    updateUrl();
    announce(answer.status === 'answered'
      ? `${plural(answer.sources.length, 'matching record')} found in ${CHANNEL_NAMES[channel()]}.`
      : `Not enough evidence in ${CHANNEL_NAMES[channel()]}.`);
    if (focus) $('#answer').focus({preventScroll: true});
  } catch (error) {
    $('#answer').innerHTML = `<div class="answer-error" role="alert"><h4>The answer could not be produced.</h4>
      <p>${esc(error.message)}</p><button type="button" class="secondary" data-retry>Try again</button>
      ${state.liveAvailable ? '<p class="small">You can switch to the extractive baseline, which runs without the provider.</p>' : ''}</div>`;
  } finally {
    $('#answer').removeAttribute('aria-busy');
    button.disabled = false;
    button.textContent = 'Investigate ↗';
  }
}

function revealRecord(id) {
  if (!state.records.some(r => r.id === id)) return;
  let message = `Showing ${id}.`;
  if (!libraryRecords().some(r => r.id === id)) {
    resetLibrary();
    message = `Library filters cleared to show ${id}.`;
  }
  state.highlighted = id;
  renderLibrary();
  const element = document.getElementById(id);
  element.scrollIntoView({block: 'center'});
  element.focus({preventScroll: true});
  announce(message);
}

function updateUrl() {
  const params = new URLSearchParams();
  if (state.lastQuestion) params.set('q', state.lastQuestion);
  if (channel() !== 'all') params.set('channel', channel());
  const search = params.toString();
  history.replaceState(null, '', search ? `?${search}#workspace` : location.pathname);
}

// ---------- Events ----------

document.addEventListener('click', event => {
  const target = event.target;
  const themeButton = target.closest('[data-theme]');
  if (themeButton) {
    state.activeTheme = themeButton.dataset.theme;
    renderLibrary();
    return;
  }
  const example = target.closest('[data-question]');
  if (example) {
    $('#question').value = example.dataset.question;
    $('#channel').value = example.dataset.channel || 'all';
    updateCharCount();
    resetLibrary();
    ask();
    return;
  }
  const cite = target.closest('[data-source]');
  if (cite) return revealRecord(cite.dataset.source);
  if (target.closest('[data-back]')) {
    $('#answer').scrollIntoView({block: 'start'});
    $('#answer').focus({preventScroll: true});
    return;
  }
  if (target.closest('[data-broaden]')) {
    $('#channel').value = 'all';
    renderLibrary();
    ask();
    return;
  }
  if (target.closest('[data-retry]')) return ask();
  if (target.closest('[data-reset-library]') || target.closest('#reset')) {
    resetLibrary();
    renderLibrary();
    announce('Library filters cleared.');
    $('#search').focus();
  }
});

function updateCharCount() {
  $('#char-count').textContent = `${$('#question').value.length} / ${MAX_QUESTION}`;
}

$('#question').addEventListener('input', () => {
  updateCharCount();
  if (!$('#question-error').hidden && $('#question').value.trim()) showQuestionError('');
});
// Enter submits; Shift+Enter keeps a newline.
$('#question').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    ask();
  }
});
$('#question-form').addEventListener('submit', event => { event.preventDefault(); ask(); });
$('#search').addEventListener('input', renderLibrary);
$('#cited-only').addEventListener('change', renderLibrary);
$('#channel').addEventListener('change', () => {
  renderLibrary();
  if (state.lastQuestion) {
    $('#question').value = state.lastQuestion;
    updateCharCount();
    ask({focus: false});
  } else {
    updateUrl();
    announce(`Scope set to ${CHANNEL_NAMES[channel()]}.`);
  }
});

// ---------- Startup ----------

async function loadRecords() {
  $('#records').setAttribute('aria-busy', 'true');
  $('#records').innerHTML = '<p class="empty">Loading feedback…</p>';
  try {
    const response = await fetch('./data/feedback.json');
    if (!response.ok) throw new Error(`The feedback file returned ${response.status}.`);
    state.records = await response.json();
    state.loaded = true;
    $('#record-count').textContent = state.records.length;
    $('#ask').disabled = false;
    $('#ask').textContent = 'Investigate ↗';
    renderLibrary();
  } catch (error) {
    $('#ask').textContent = 'Feedback unavailable';
    $('#records').innerHTML = `<div class="answer-error" role="alert"><h4>The feedback library did not load.</h4>
      <p>${esc(error.message || 'Network error.')} Questions are disabled until it loads.</p>
      <button type="button" class="secondary" id="retry-load">Retry</button></div>`;
    $('#retry-load').addEventListener('click', loadRecords);
  } finally {
    $('#records').removeAttribute('aria-busy');
  }
}

const pct = n => n === null ? 'n/a' : `${Math.round(n * 100)}%`;
async function loadEvaluation() {
  const target = $('#eval-results');
  try {
    const response = await fetch('./data/evaluation.json');
    if (!response.ok) throw new Error();
    const report = await response.json();
    const metrics = [
      ['Recall at 5', 'mean_recall_at_5', pct],
      ['Mean reciprocal rank', 'mrr', n => n.toFixed(2)],
      ['Correct answer/abstain decision', 'abstention_accuracy', pct],
      ['Off-target records returned', 'irrelevant_retrieved', n => String(n)],
    ];
    const tables = Object.entries(report.summary).map(([set, s]) => `
      <table>
        <caption>${set === 'development' ? 'Development set' : 'Challenge set'} · ${s.current.cases} queries (${s.current.answerable_cases} answerable, ${s.current.unanswerable_cases} should abstain)</caption>
        <thead><tr><th scope="col">Metric</th><th scope="col">Original baseline</th><th scope="col">Current</th></tr></thead>
        <tbody>${metrics.map(([label, key, f]) => `<tr><th scope="row">${label}</th><td>${f(s.baseline[key])}</td><td>${f(s.current[key])}</td></tr>`).join('')}</tbody>
      </table>`).join('');
    const changed = report.outcomes.filter(o => o.change !== 'unchanged');
    const failures = report.outcomes.filter(o => !o.current.abstention_correct || (!o.expect_abstain && o.current.recall_at_5 < 1));
    const row = o => `<strong>${esc(o.id)}</strong> ${esc(o.question)}${o.channel !== 'all' ? ` <span class="small">(${esc(o.channel)})</span>` : ''}<br>
      <span class="small">expected ${o.relevant_ids.length ? esc(o.relevant_ids.join(', ')) : 'abstain'} · original ${esc(o.baseline.retrieved_ids.join(', ') || 'abstained')} · current ${esc(o.current.retrieved_ids.join(', ') || 'abstained')}</span>`;
    target.innerHTML = `${tables}
      <details><summary>${plural(changed.length, 'query')} changed between versions</summary>
        <ul class="outcomes">${changed.map(o => `<li><span class="change ${o.change}">${o.change}</span> ${row(o)}</li>`).join('')}</ul></details>
      <details><summary>${plural(failures.length, 'query')} still fail</summary><ul class="outcomes">${failures.map(o => `<li>${row(o)}</li>`).join('')}</ul></details>
      <p class="small">Neither set is held out: both were written by the project author with AI assistance, and some retriever changes were made after seeing challenge-set failures. Higher numbers here are diagnostic, not proof of better answers.</p>`;
  } catch {
    target.innerHTML = '<p class="empty">The evaluation report could not be loaded. Run <code>npm run evaluate</code> locally to regenerate it.</p>';
  } finally {
    target.removeAttribute('aria-busy');
  }
}

async function detectLiveMode() {
  if (!['127.0.0.1', 'localhost'].includes(location.hostname)) return;
  try {
    const response = await fetch('./api/status');
    if (!response.ok) return;
    const status = await response.json();
    state.liveAvailable = Boolean(status.live);
  } catch { /* Static hosting: no local API. */ }
  if (state.liveAvailable) {
    $('#mode-wrap').hidden = false;
    $('#mode-static').hidden = true;
  }
}

updateCharCount();
await Promise.all([loadRecords(), loadEvaluation(), detectLiveMode()]);

// Restore a shared investigation, e.g. ?q=What+breaks+CSV+export%3F&channel=support
const params = new URLSearchParams(location.search);
if (params.has('channel') && CHANNEL_NAMES[params.get('channel')]) {
  $('#channel').value = params.get('channel');
  renderLibrary();
}
if (params.get('q') && state.loaded) {
  $('#question').value = params.get('q').slice(0, MAX_QUESTION);
  updateCharCount();
  ask({focus: false});
}
