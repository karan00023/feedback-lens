// Controls on what feedback may leave the server for an external model provider.
//
// 1. Only records marked `synthetic: true` are sent by default. Real customer feedback is
//    sent only when the operator sets ALLOW_REAL_FEEDBACK_TO_PROVIDER=true after checking
//    the provider's data-use terms.
// 2. Every record is redacted before it is sent: emails, phone numbers, card-like and long
//    account-like numbers, URLs with query strings and bearer-style secrets.
// 3. Only the records selected for a question are sent, never the whole library, except for
//    the small aggregate questions (top issues, urgency) over this 31-record sample.

const PATTERNS = [
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]'],
  [/\b(?:sk|pk|rk|ghp|gho|xox[abp]|AIza)[-_A-Za-z0-9]{12,}\b/g, '[secret]'],
  [/\b(?:\d[ -]?){13,19}\b/g, '[number]'],
  [/(?:\+?\d{1,3}[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g, '[phone]'],
  [/https?:\/\/\S+\?\S+/g, '[url]'],
];

export function redact(text) {
  let out = String(text);
  for (const [re, replacement] of PATTERNS) out = out.replace(re, replacement);
  return out;
}

export function shareable(records, env = process.env) {
  const allowReal = env.ALLOW_REAL_FEEDBACK_TO_PROVIDER === 'true';
  const allowed = records.filter(r => r.synthetic === true || allowReal);
  return {allowed, withheld: records.length - allowed.length};
}
