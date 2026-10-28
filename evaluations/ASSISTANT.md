# Question router and retrieval v3

October 28, 2026. Development diagnostics on a 31-record synthetic corpus. Not a held-out benchmark. No language model is involved.

## Why

After the v2 release, many reasonable questions still got only "not enough evidence". Some examples were "What are the top issues?", "What do users want us to build?", "Tell me about billing", "Which customers got billed two times?" and "Is anything broken?". Questions outside the library ("What is our churn rate?") were refused correctly, but the response offered nothing to do next.

## What was built

**`docs/assistant.mjs`, a deterministic question router.** It works through these steps in order:

1. **Sensitive requests** (API keys, passwords, bank or account numbers) are declined. The response explains that the library holds no credentials and that FB-031 is an injection test record.
2. **Help or greetings** ("What can I ask?", "hi") explain what can be asked and offer example questions.
3. **Search** answers first when the question names something specific that records mention ("Why do large exports time out?").
4. **Listings from metadata** handle these question types:
   - Overview or complaints: per-theme counts, plus one highest-priority record per theme.
   - Urgency or priority: records with the authored high-severity label.
   - Feature requests: records phrased as asks, such as "please", "I want", "we need" or "let me".
   - Praise: a keyword rule ("helped", "easier", "saves", …). This is not sentiment analysis.
   - Recency, counts and channel comparison.
   - Theme listings ("Tell me about billing").
5. **Channel words in the question** ("from surveys", "interviews") narrow the scope when "All channels" is selected. The answer says it did this.
6. **A specific question in a known theme that nothing answers** ("total invoice amount owed by Acme") gets an explicit "no record answers this directly" message. The theme's records follow, labelled as context and not cited as an answer.
7. **Everything else** gets a description of what the library covers, the reason, related records and example questions that will work.

Facet listings are skipped when the question also names something no record mentions, so "How many customers use the mobile app?" is not answered with a count of all feedback. Listings exclude the injection-test fixture. Every listed record is quoted verbatim and passes the existing citation validator.

**Retrieval v3 (`docs/engine.mjs`)** adds a small, hand-written glossary:
- Phrase rewrites: "two times", "single sign-on", "log in", "sign up", "team member", "time out".
- Synonym groups:
  - bill / charge
  - twice / duplicate / double
  - teammate / member
  - invite / invitation
  - notification / alert
  - remove / delete
  - login / sign-in
  - slow / lag / delay / late / timeout

The glossary was written for this corpus's vocabulary, after seeing failures. That is ordinary search tuning, but it makes these query sets optimistic.

## Method

`evaluations/usecase-cases.json` (24 questions with expected handling and allowed citations) was committed before the router was written (commit "Add use-case question set before building the question router"). `npm run evaluate` scores three systems:
- the frozen v1 retriever
- the current retriever on its own
- the full workspace (the router)

The router's listings return records; non-answers count as abstentions.

## Results

| Set | Metric | v1 | Retriever v3 | Workspace |
| --- | --- | --- | --- | --- |
| Development (18) | Recall@5 | 63% | 83% | 83% |
| | MRR | 0.85 | 0.96 | 1.00 |
| | Answer/abstain decision | 89% | 100% | 100% |
| | Off-target records | 1 | 3 | 2 |
| Challenge (24) | Recall@5 | 53% | 85% | 88% |
| | MRR | 0.53 | 0.88 | 0.88 |
| | Answer/abstain decision | 67% | 92% | 96% |
| | Off-target records | 2 | 3 | 2 |
| Use cases (24) | Handled as specified | — | — | 24 / 24 |

The use cases passed only after two rule adjustments, made after the first run:
- The praise rule matched "clear" and "save", wrongly including two complaints (FB-003, FB-014). It was narrowed.
- "high severity" was added as a phrase.

**Regressions and weaknesses:**
- Q-11 "email notifications" now also returns FB-030, which mentions alert emails positively. The `notification ~ alert` synonym causes this.
- C-09 still returns an extra search record (unchanged from v2).
- C-06 "too many notifications" is shown as related context rather than answered.
- C-10 returns a complaint (FB-003) for "What onboarding steps help?", because polarity is not understood.
- CSV accented-characters (FB-018) is still missed for "What breaks CSV export?".
- The rules are English keyword patterns. Questions in other languages get the out-of-library response.

All 24 use-case questions, the remaining failures and per-query results are in `docs/data/evaluation.json`.
