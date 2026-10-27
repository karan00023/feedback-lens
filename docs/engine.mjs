// Shared by the browser demo, local server, tests and evaluation runner.
// Retrieval is lexical: it matches word stems weighted by rarity (IDF). It does not
// understand synonyms, so "billed" will not find "charged".

// Words that frame a question rather than describe a product problem.
const STOP_WORDS = new Set(`a an the and or to of in on for with from by as at is are was were be been
  do does did can could would should will have has had i me my we our us you your it its this that these
  those what which where why how when who users user people report reports problems problem about more
  than into same instead after before please need want give tell much all any there their them they
  feedback say says said mention mentions mentioned complaint complaints comment show came come
  interview interviews survey surveys`.split(/\s+/));

// Light suffix stripping so "charges", "charged" and "charge" share one stem.
export function stem(word) {
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  for (const suffix of ['ing', 'ed', 'es', 's']) {
    if (word.endsWith(suffix) && !word.endsWith('ss') && word.length - suffix.length >= 3) {
      word = word.slice(0, -suffix.length);
      break;
    }
  }
  return word.endsWith('e') && word.length > 3 ? word.slice(0, -1) : word;
}

export function tokens(text) {
  const words = String(text).toLowerCase().replace(/'s\b/g, '').match(/[a-z0-9]+/g) || [];
  return [...new Set(words.filter(w => w.length > 2 && !STOP_WORDS.has(w)).map(stem))];
}

export const RETRIEVAL = {
  limit: 5,
  // A record that matches two or more query terms must also carry this share of the query's weight.
  minScore: 0.14,
  // When no record matches two terms, a single-term match is accepted only above this share.
  singleTermScore: 0.4,
};

// Returns the ranked sources plus the reasoning the UI shows for an answer or an abstention.
export function explainRetrieval(question, records, {limit = RETRIEVAL.limit} = {}) {
  const terms = tokens(question);
  const empty = reason => ({terms, missing_terms: terms, match: 'none', reason, related: [], sources: []});
  if (!terms.length) return empty('The question has no searchable terms after removing common words.');
  if (!records.length) return empty('No feedback records are in the selected scope.');

  const recordTerms = records.map(r => new Set(tokens(r.text)));
  const docFrequency = t => recordTerms.filter(s => s.has(t)).length;
  const weight = new Map(terms.map(t => [t, Math.log(1 + records.length / (1 + docFrequency(t)))]));
  const totalWeight = terms.reduce((n, t) => n + weight.get(t), 0);

  const candidates = records.map((record, i) => {
    const matched = terms.filter(t => recordTerms[i].has(t));
    const score = matched.reduce((n, t) => n + weight.get(t), 0) / totalWeight;
    return {...record, score: +score.toFixed(4), matched_terms: matched};
  }).filter(r => r.matched_terms.length)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const required = Math.min(2, terms.length);
  let match = 'multi-term';
  let sources = candidates.filter(r => r.matched_terms.length >= required && r.score >= RETRIEVAL.minScore);
  if (!sources.length) {
    match = 'single-term';
    sources = candidates.filter(r => r.score >= RETRIEVAL.singleTermScore);
  }
  sources = sources.slice(0, limit);
  // Records that share a term but did not qualify; shown for transparency, never cited.
  const related = candidates.filter(r => !sources.includes(r)).slice(0, limit)
    .map(({id, score, matched_terms}) => ({id, score, matched_terms}));

  const missing = terms.filter(t => !records.some((_, i) => recordTerms[i].has(t)));
  if (!sources.length) {
    const partial = candidates.length
      ? `${candidates.length} record${candidates.length === 1 ? '' : 's'} shared a single term, but not enough of the question to count as evidence.`
      : 'No record in scope contains any of the question terms.';
    return {terms, missing_terms: missing, match: 'none', reason: partial, related, sources: []};
  }
  const reason = match === 'multi-term'
    ? `Each source contains at least ${required} of the question terms.`
    : 'No record matched two terms; these share one rare, heavily weighted term. Treat them as weaker evidence.';
  return {terms, missing_terms: missing, match, reason, related, sources};
}

export function retrieve(question, records, options) {
  return explainRetrieval(question, records, options).sources;
}

const THEME_RULES = [
  ['Onboarding', /signup|onboard|account|getting started|invite link|login/i],
  ['Billing', /billing|invoice|charged|charge|receipt|subscription|budget/i],
  ['Search', /search|keyword|query|synonym/i],
  ['Exports', /export|csv|downloaded|pdf/i],
  ['Permissions', /permission|private project|access list|read-only|admin/i],
  ['Notifications', /notification|digest|alert/i],
];
export const THEMES = THEME_RULES.map(([name]) => name).concat('Other');
export function theme(record) {
  return THEME_RULES.find(([, re]) => re.test(record.text))?.[0] || 'Other';
}

// Extractive answer: every claim is the verbatim text of a retrieved record.
export function baseline(question, records, options) {
  const {sources, ...retrieval} = explainRetrieval(question, records, options);
  return {
    status: sources.length ? 'answered' : 'insufficient_evidence',
    mode: 'extractive',
    claims: sources.map(s => ({text: s.text, evidence: [{source_id: s.id, quote: s.text}]})),
    sources,
    retrieval,
  };
}

export function validateAnswer(answer, sources) {
  if (!answer || !['answered', 'insufficient_evidence'].includes(answer.status) || !Array.isArray(answer.claims)) throw new Error('Invalid answer structure.');
  if (answer.status === 'insufficient_evidence' && answer.claims.length) throw new Error('Abstentions must not include claims.');
  if (answer.status === 'answered' && !answer.claims.length) throw new Error('Answered responses require evidence.');
  if (answer.claims.length > 6) throw new Error('Too many claims.');
  const allowed = new Map(sources.map(s => [s.id, s.text]));
  for (const claim of answer.claims) {
    if (typeof claim.text !== 'string' || !claim.text.trim() || claim.text.length > 2000 || !Array.isArray(claim.evidence) || !claim.evidence.length) throw new Error('Every claim needs text and evidence.');
    for (const e of claim.evidence) {
      if (typeof e.quote !== 'string' || e.quote.trim().length < 8 || !allowed.get(e.source_id)?.includes(e.quote)) throw new Error('Citation is missing or its quote does not match the retrieved source.');
    }
  }
  return answer;
}
