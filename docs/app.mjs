import {THEMES, theme, tokens} from './engine.mjs';
import {answerQuestion} from './assistant.mjs';

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
  // AI answers need the Feedback Lens server: same origin (npm start / hosted) or a URL in
  // <meta name="feedback-lens-api">. The static GitHub Pages copy has no server.
  apiBase: document.querySelector('meta[name="feedback-lens-api"]')?.content?.trim() || './',
  ai: null,            // /api/status ai block when a server is reachable
  aiChecked: false,
  history: [],         // earlier turns of the current conversation
  highlighted: null,
};
const aiAvailable = () => Boolean(state.ai?.available);

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
    <p class="small">Retrieval is keyword-based with a small hand-written synonym list. A missing answer can mean the wording differs, not that the feedback does not exist.</p>
  </details>`;
}

const HANDLERS = {
  search: 'Keyword search',
  overview: 'Overview from metadata',
  severity: 'Urgency · authored severity',
  requests: 'Feature requests · keyword rule',
  praise: 'Positive feedback · keyword rule',
  recent: 'Most recent',
  count: 'Count by theme',
  compare: 'Channel comparison',
  theme: 'Theme listing',
  related: 'Related context',
  out_of_scope: 'Not in the feedback',
  sensitive: 'Declined',
  help: 'Help',
};

function suggestionButtons(suggestions = []) {
  if (!suggestions.length) return '';
  return `<div class="suggestions"><p class="small">You could ask:</p>${suggestions.map(q =>
    `<button type="button" data-question="${esc(q)}" data-channel="${esc(channel())}">${esc(q)}</button>`).join('')}</div>`;
}

function sourceButton(record) {
  return `<button type="button" class="cite" data-source="${esc(record.id)}">Show ${esc(record.id)} in library</button>
    <span class="small">${esc(record.channel)} · ${esc(record.date)}</span>`;
}

function summaryTable(answer) {
  if (answer.summary) {
    return `<table class="mini"><thead><tr><th scope="col">Theme</th><th scope="col">Records</th><th scope="col">High severity</th></tr></thead>
      <tbody>${answer.summary.map(t => `<tr><th scope="row">${esc(t.theme)}</th><td>${t.count}</td><td>${t.high}</td></tr>`).join('')}</tbody></table>`;
  }
  if (answer.channels) {
    return `<table class="mini"><thead><tr><th scope="col">Channel</th><th scope="col">Records</th><th scope="col">High severity</th></tr></thead>
      <tbody>${answer.channels.map(c => `<tr><th scope="row">${esc(CHANNEL_NAMES[c.channel])}</th><td>${c.count}</td><td>${c.high}</td></tr>`).join('')}</tbody></table>`;
  }
  return '';
}

const KIND_LABELS = {
  feedback_evidence: 'Answered from your feedback',
  partial_evidence: 'Partly answered by your feedback',
  general_knowledge: 'General knowledge',
  unverified_product: 'Product fact not verified',
  clarification: 'Needs clarification',
  cannot_answer: 'Cannot be answered reliably',
};

function aiFootnote(answer) {
  const ai = answer.ai || {};
  const parts = [];
  parts.push(ai.semantic === 'used' ? 'Retrieval: semantic + keyword' : ai.semantic === 'failed' ? 'Retrieval: keyword only (semantic search failed)' : 'Retrieval: keyword only (no embedding model)');
  if (ai.records_sent !== undefined) parts.push(`${plural(ai.records_sent, 'record')} given to the model`);
  if (ai.usage) parts.push(`${ai.usage.input_tokens} in / ${ai.usage.output_tokens} out tokens`);
  if (answer.latency_ms !== undefined) parts.push(`${(answer.latency_ms / 1000).toFixed(1)} s`);
  return parts.join(' · ');
}

function renderAiAnswer(answer, question) {
  const scope = CHANNEL_NAMES[answer.scope || channel()];
  const kinds = [];
  if (answer.claims.length) kinds.push('<span class="kind kind-feedback">From your feedback</span>');
  if (answer.general_knowledge) kinds.push('<span class="kind kind-general">General knowledge</span>');
  if (answer.unverified) kinds.push('<span class="kind kind-unverified">Not verified</span>');
  const sourceById = new Map([...answer.sources, ...(answer.related_records || [])].map(s => [s.id, s]));
  const claims = answer.claims.map(claim => {
    const cites = claim.evidence.map(e => sourceById.get(e.source_id)
      ? sourceButton(sourceById.get(e.source_id))
      : `<button type="button" class="cite" data-source="${esc(e.source_id)}">Show ${esc(e.source_id)} in library</button>`).join(' ');
    return `<li class="claim"><p>${esc(claim.text)}</p><blockquote>${esc(claim.evidence[0].quote)}</blockquote><div class="cite-row">${cites}</div></li>`;
  }).join('');
  const related = (answer.related_records || []).map(r =>
    `<li class="claim related"><blockquote>${esc(r.text)}</blockquote><div class="cite-row">${sourceButton(r)}</div></li>`).join('');
  const resolved = answer.standalone_question && answer.standalone_question.trim().toLowerCase() !== question.trim().toLowerCase()
    ? `<p class="small resolved">Understood as: “${esc(answer.standalone_question)}”</p>` : '';
  const notes = answer.validation?.notes?.length
    ? `<details class="why"><summary>${plural(answer.validation.notes.length, 'check')} changed this answer</summary><ul>${answer.validation.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : '';

  $('#answer').innerHTML = `<div class="answer-header"><span><span class="badge live">AI answer · ${esc(answer.ai?.model || '')}</span> <span class="handler">${esc(KIND_LABELS[answer.answer_type] || '')}</span></span><span class="small">Scope: ${esc(scope)}</span></div>
    <p class="answer-question">“${esc(question)}”</p>${resolved}
    ${answer.scope_note ? `<p class="scope-note">${esc(answer.scope_note)}</p>` : ''}
    <div class="kinds">${kinds.join('')}</div>
    <h4 class="answer-title headline">${esc(answer.headline)}</h4>
    ${claims ? `<section class="answer-part"><h5>From your feedback</h5>
      <p class="small">Each point cites the records it relies on. The quote was checked to appear word for word in the cited record; whether the point follows from it is the model's reading — check the source.</p>
      <ol class="claims">${claims}</ol></section>` : ''}
    ${answer.general_knowledge ? `<section class="answer-part general"><h5>General knowledge <span class="small">· not from your feedback</span></h5>
      <p>${esc(answer.general_knowledge)}</p><p class="small">Written by the model from general knowledge. It is not checked against a source in this library.</p></section>` : ''}
    ${answer.unverified ? `<div class="abstain" role="note"><h4>Not verified</h4><p>${esc(answer.unverified)}</p></div>` : ''}
    ${answer.broaden ? `<div class="abstain" role="note"><p>${plural(answer.broaden, 'matching record')} ${answer.broaden === 1 ? 'exists' : 'exist'} outside ${esc(scope)}.</p>
      <button type="button" class="secondary" data-broaden>Search all channels instead</button></div>` : ''}
    ${answer.missing_information ? `<p class="missing"><strong>Missing information:</strong> ${esc(answer.missing_information)}</p>` : ''}
    ${related ? `<details class="related-block"><summary>${plural(answer.related_records.length, 'other record')} the model saw but did not cite</summary><ol class="claims">${related}</ol></details>` : ''}
    ${answer.follow_ups?.length ? `<div class="suggestions"><p class="small">Follow up:</p>${answer.follow_ups.map(q =>
      `<button type="button" data-followup="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}
    ${notes}
    <p class="small footnote">${esc(aiFootnote(answer))}</p>`;
}

function fallbackBanner(answer) {
  if (answer.ai?.status !== 'fallback') return '';
  return `<div class="degraded" role="note"><strong>AI answer unavailable.</strong> ${esc(answer.ai.reason?.message || '')} Showing keyword results instead.
    <button type="button" class="text-button" data-retry>Try the AI again</button></div>`;
}

function renderAnswer(answer, question) {
  if (answer.mode === 'ai') return renderAiAnswer(answer, question);
  const scopeKey = answer.scope || channel();
  const scope = CHANNEL_NAMES[scopeKey];
  const badge = '<span class="badge">Keyword search · no AI</span>';
  const handler = HANDLERS[answer.intent] ? `<span class="handler">${HANDLERS[answer.intent]}</span>` : '';
  const header = `${fallbackBanner(answer)}<div class="answer-header"><span>${badge} ${handler}</span><span class="small">Scope: ${esc(scope)}</span></div>
    <p class="answer-question">“${esc(question)}”</p>
    ${answer.scope_note ? `<p class="scope-note">${esc(answer.scope_note)}</p>` : ''}`;

  if (answer.status === 'help' || answer.status === 'declined') {
    $('#answer').innerHTML = `${header}
      <div class="${answer.status === 'help' ? 'info' : 'abstain'}" role="note"><h4>${esc(answer.title)}</h4><p>${esc(answer.message)}</p></div>
      ${suggestionButtons(answer.suggestions)}`;
    return;
  }

  if (answer.status === 'insufficient_evidence') {
    let broadenCount = answer.broaden || 0;
    const broaden = broadenCount && scopeKey !== 'all'
      ? `<p>${plural(broadenCount, 'matching record')} ${broadenCount === 1 ? 'exists' : 'exist'} outside ${esc(scope)}.</p>
         <button type="button" class="secondary" data-broaden>Search all channels instead</button>` : '';
    const related = (answer.related_records || []).map(r =>
      `<li class="claim related"><blockquote>${esc(r.text)}</blockquote><div class="cite-row">${sourceButton(r)}</div></li>`).join('');
    $('#answer').innerHTML = `${header}
      <div class="abstain" role="note">
        <h4>${esc(answer.title || `Not enough evidence in ${scope}.`)}</h4>
        <p>${esc(answer.message || `Feedback Lens will not guess. ${answer.retrieval?.reason || ''}`)}</p>
        ${answer.intent === 'out_of_scope' && !aiAvailable() ? `<p>${state.aiChecked ? 'If this is a general question (for example about Excel or industry practice), the AI answer mode can answer it with a clearly labelled general-knowledge answer. It needs the Feedback Lens server, which is not connected to this page.' : ''}</p>` : ''}
        ${broaden}
      </div>
      ${related ? `<h4 class="answer-title">Related feedback (context, not an answer)</h4><ol class="claims">${related}</ol>` : ''}
      ${suggestionButtons(answer.suggestions)}
      ${whyDetails(answer.retrieval, question, !related)}`;
    return;
  }

  const isSearch = !answer.intent || answer.intent === 'search';
  const weak = isSearch && answer.retrieval?.match === 'single-term';
  const sourceById = new Map(answer.sources.map(s => [s.id, s]));
  const claims = answer.claims.map(claim => {
    const cites = claim.evidence.map(e => sourceById.get(e.source_id)
      ? sourceButton(sourceById.get(e.source_id))
      : `<button type="button" class="cite" data-source="${esc(e.source_id)}">Show ${esc(e.source_id)} in library</button>`).join(' ');
    const source = sourceById.get(claim.evidence[0].source_id);
    const body = `<blockquote>${isSearch ? highlight(claim.text, source?.matched_words) : esc(claim.text)}</blockquote>
         ${!isSearch && source ? `<span class="tag${source.severity === 'high' ? ' high' : ''}">${esc(source.severity)} severity</span> <span class="tag">${theme(source)}</span>` : ''}`;
    return `<li class="claim">${body}<div class="cite-row">${cites}</div></li>`;
  }).join('');

  const explanation = isSearch
    ? 'These are the matching records quoted word for word, strongest match first. Highlighted words matched your question. Nothing is summarized or inferred.'
    : `${esc(answer.rule)} Records are quoted word for word; nothing is generated.`;

  $('#answer').innerHTML = `${header}
    <h4 class="answer-title">${isSearch ? evidenceSummary(answer.sources) : esc(answer.title)}</h4>
    ${summaryTable(answer)}
    ${weak ? '<p class="weak-note">Weaker match: each record shares only one term with the question. Read the quotes before relying on them.</p>' : ''}
    <p class="small">${explanation}</p>
    <ol class="claims">${claims}</ol>
    ${answer.more ? `<p class="small">${plural(answer.more, 'more record')} not shown. Use the library filters to see them all.</p>` : ''}
    ${isSearch && answer.retrieval?.related?.length ? `<p class="small">${plural(answer.retrieval.related.length, 'other record')} share${answer.retrieval.related.length === 1 ? 's' : ''} a term with the question but did not meet the evidence rule. They are listed under “Why this result?”, not cited.</p>` : ''}
    ${isSearch ? whyDetails(answer.retrieval, question, false) : ''}`;
}

function showQuestionError(message) {
  $('#question-error').textContent = message;
  $('#question-error').hidden = !message;
  $('#question').setAttribute('aria-invalid', message ? 'true' : 'false');
}

const apiUrl = path => new URL(path, new URL(state.apiBase, location.href));

async function getAnswer(question) {
  if (aiAvailable() && $('#mode').value === 'ai') {
    let response;
    try {
      response = await fetch(apiUrl('api/answer'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({question, mode: 'ai', channel: channel(), history: state.history}),
      });
    } catch {
      throw new Error('The Feedback Lens server could not be reached. Check your connection, or switch to the keyword baseline.');
    }
    const payload = await response.json().catch(() => ({}));
    if (response.status === 429) throw new Error('Too many questions in a minute. Wait a moment and try again.');
    if (!response.ok) throw new Error(payload.error || `The server returned ${response.status}.`);
    return payload;
  }
  return answerQuestion(question, state.records, {channel: channel()});
}

function renderThread() {
  const list = $('#thread-list');
  $('#thread').hidden = state.history.length < 2;
  // The latest turn is the answer shown below; list the earlier ones.
  list.innerHTML = state.history.slice(0, -1).map(t =>
    `<li><span class="thread-q">${esc(t.question)}</span>${t.answer ? `<span class="thread-a">${esc(t.answer)}</span>` : ''}</li>`).join('');
}

function newConversation() {
  state.history = [];
  renderThread();
}

async function ask({focus = true, question = $('#question').value.trim()} = {}) {
  if (!state.loaded) return;
  if (!question) {
    showQuestionError('Enter a question, for example “What do users dislike about exports?”');
    $('#question').focus();
    return;
  }
  showQuestionError('');
  const button = $('#ask');
  const usingAi = aiAvailable() && $('#mode').value === 'ai';
  button.disabled = true;
  button.textContent = usingAi ? 'Thinking…' : 'Searching…';
  $('#answer').setAttribute('aria-busy', 'true');
  if (usingAi) {
    $('#answer').innerHTML = '<div class="answer-loading" role="status"><span class="spinner" aria-hidden="true"></span> Reading the feedback and preparing an answer… This usually takes a few seconds.</div>';
  }
  try {
    const answer = await getAnswer(question);
    state.lastQuestion = question;
    state.citedIds = new Set(answer.claims?.length ? answer.claims.flatMap(c => c.evidence.map(e => e.source_id)) : []);
    state.highlighted = null;
    if (!state.citedIds.size) $('#cited-only').checked = false;
    if (usingAi) {
      state.history = [...state.history, {
        question,
        answer: (answer.headline || answer.title || '').slice(0, 600),
        source_ids: [...state.citedIds].slice(0, 8),
      }].slice(-6);
    }
    renderThread();
    renderAnswer(answer, question);
    renderLibrary();
    updateUrl();
    const scopeName = CHANNEL_NAMES[answer.scope || channel()];
    announce(answer.headline || answer.title || (answer.status === 'answered'
      ? `${plural(answer.sources.length, 'matching record')} found in ${scopeName}.`
      : `Not enough evidence in ${scopeName}.`));
    if (focus) $('#answer').focus({preventScroll: true});
  } catch (error) {
    $('#answer').innerHTML = `<div class="answer-error" role="alert"><h4>The answer could not be produced.</h4>
      <p>${esc(error.message)}</p><button type="button" class="secondary" data-retry>Try again</button>
      ${aiAvailable() ? '<p class="small">You can also switch the answer mode to the keyword baseline, which does not need the AI service.</p>' : ''}</div>`;
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
    newConversation();
    ask();
    return;
  }
  const followUp = target.closest('[data-followup]');
  if (followUp) {
    $('#question').value = followUp.dataset.followup;
    updateCharCount();
    ask();
    return;
  }
  if (target.closest('[data-new-conversation]')) {
    newConversation();
    $('#question').value = '';
    updateCharCount();
    $('#question').focus();
    announce('Started a new conversation.');
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
  if (target.closest('[data-retry]')) {
    // Retrying replaces the last turn rather than adding a duplicate.
    if (state.history.at(-1)?.question === state.lastQuestion) state.history = state.history.slice(0, -1);
    return ask({question: state.lastQuestion || $('#question').value.trim()});
  }
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
    // Re-answer the same turn in the new scope.
    if (state.history.at(-1)?.question === state.lastQuestion) state.history = state.history.slice(0, -1);
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
    const tables = Object.entries(report.summary).filter(([set]) => set !== 'usecases').map(([set, s]) => `
      <table>
        <caption>${set === 'development' ? 'Development set' : 'Challenge set'} · ${s.current.cases} queries (${s.current.answerable_cases} answerable, ${s.current.unanswerable_cases} should abstain)</caption>
        <thead><tr><th scope="col">Metric</th><th scope="col">Original v1</th><th scope="col">Retriever now</th><th scope="col">Workspace</th></tr></thead>
        <tbody>${metrics.map(([label, key, f]) => `<tr><th scope="row">${label}</th><td>${f(s.baseline[key])}</td><td>${f(s.current[key])}</td><td>${f(s.assistant[key])}</td></tr>`).join('')}</tbody>
      </table>`).join('');
    const changed = report.outcomes.filter(o => o.change !== 'unchanged');
    // Remaining failures are judged on what the workspace returns.
    const failures = report.outcomes.filter(o => !o.assistant.abstention_correct || (!o.expect_abstain && o.assistant.recall_at_5 < 1));
    const row = o => `<strong>${esc(o.id)}</strong> ${esc(o.question)}${o.channel !== 'all' ? ` <span class="small">(${esc(o.channel)})</span>` : ''}<br>
      <span class="small">expected ${o.relevant_ids.length ? esc(o.relevant_ids.join(', ')) : 'abstain'} · original ${esc(o.baseline.retrieved_ids.join(', ') || 'abstained')} · retriever ${esc(o.current.retrieved_ids.join(', ') || 'abstained')} · workspace ${esc(o.assistant.retrieved_ids.join(', ') || 'abstained')}</span>`;
    const uc = report.summary.usecases;
    const usecaseFails = report.usecases.filter(u => !u.passed);
    target.innerHTML = `${tables}
      <p class="usecase-line"><strong>${uc.passed} of ${uc.cases}</strong> use-case questions (overviews, urgency, requests, praise, themes, counts, help, sensitive and out-of-scope) were handled as specified before the router was built.${usecaseFails.length ? ' Failures: ' + usecaseFails.map(u => esc(u.id)).join(', ') + '.' : ''}</p>
      <details><summary>${plural(changed.length, 'query')} changed between versions</summary>
        <ul class="outcomes">${changed.map(o => `<li><span class="change ${o.change}">${o.change}</span> ${row(o)}</li>`).join('')}</ul></details>
      <details><summary>${plural(failures.length, 'query')} still fail</summary><ul class="outcomes">${failures.map(o => `<li>${row(o)}</li>`).join('')}</ul></details>
      <p class="small">“Workspace” is what you get above: search plus rule-based listings. None of these sets is held out: all were written with AI assistance by the project author, and the synonym list and some rules were adjusted after seeing failures. Treat the numbers as diagnostics, not proof of better answers.</p>`;
  } catch {
    target.innerHTML = '<p class="empty">The evaluation report could not be loaded. Run <code>npm run evaluate</code> locally to regenerate it.</p>';
  } finally {
    target.removeAttribute('aria-busy');
  }
}

async function detectAi() {
  try {
    const response = await fetch(apiUrl('api/status'));
    if (response.ok) state.ai = (await response.json()).ai || null;
  } catch { /* Static hosting: no Feedback Lens server. */ }
  state.aiChecked = true;
  const pill = $('#mode-static');
  if (aiAvailable()) {
    $('#mode-wrap').hidden = false;
    pill.textContent = `AI on · ${state.ai.model}${state.ai.embed_model ? ' + semantic search' : ''}`;
    pill.classList.add('on');
    $('#ai-note').textContent = `AI answers are on (${state.ai.provider}, ${state.ai.model}). Feedback claims cite records; general knowledge is labelled separately.`;
  } else if (state.ai) {
    pill.textContent = 'Keyword search · AI not configured on the server';
    $('#ai-note').textContent = 'The server is running without an AI key, so answers use keyword search. Set GEMINI_API_KEY on the server to enable AI answers.';
  } else {
    pill.textContent = 'Keyword search · AI not connected';
    $('#ai-note').textContent = 'This static copy has no AI server, so answers use keyword search and quote records verbatim. Run the Feedback Lens server (npm start with GEMINI_API_KEY) for AI answers.';
  }
}

updateCharCount();
await Promise.all([loadRecords(), loadEvaluation(), detectAi()]);

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
