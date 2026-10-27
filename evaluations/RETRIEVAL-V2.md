# Retrieval change: lexical v1 → v2

October 27, 2026. Development diagnostics on a 31-record synthetic corpus. Not a held-out benchmark.

## Why change it

Browser testing of the hosted workspace showed three retrieval behaviors that made the main workflow misleading:

- Plural/tense variants did not match ("exports" vs "exporting", "charges" vs "charged").
- A rule requiring two matching terms rejected short, specific questions such as "What do users like about the digest?" even when one rare term clearly identified the topic.
- Question framing words such as "say", "interviews" and "surveys" counted as content, so "What do interviews say about search?" returned nothing in the interview scope.

The UI also gave no reason for an answer or an abstention.

## Method

1. Froze the original retriever unchanged in `evaluations/lexical-v1.mjs`.
2. Wrote 24 new challenge queries (paraphrases, channel-scoped questions, and questions that should abstain) in `evaluations/challenge-cases.json` and committed them, with v1 results, **before** changing the engine (commit "Freeze lexical-v1 baseline and add challenge query set before retrieval changes").
3. Changed `docs/engine.mjs` and scored both versions on both sets with `npm run evaluate`, which writes `docs/data/evaluation.json`.

## What changed in v2

- Light suffix stripping (`ing`, `ed`, `es`, `s`, trailing `e`) so word forms share a stem.
- Additional stop words for question framing: `feedback`, `say`, `mention`, `complaint`, `show`, `came`, `interview(s)`, `survey(s)` and similar.
- Evidence rule: a record is cited when it contains at least two question terms and at least 14% of the question's IDF weight (unchanged from v1). Only when **no** record qualifies, a record sharing a single term is accepted if that term carries at least 40% of the question's weight. The answer is labelled as a weaker match.
- Every result now returns an explanation: searched terms, terms absent from the scope, the rule applied, and records that shared a term but were not cited.

**Contamination note:** the framing stop words (`interview`, `survey`, `came`) and the 40% single-term threshold were chosen after seeing challenge-set failures. Challenge-set gains are therefore optimistic. A fresh, independently written set is needed before claiming generalization.

## Results

| Set | Metric | v1 | v2 |
| --- | --- | --- | --- |
| Development (18) | Recall@5 (answerable) | 63% | 73% |
| | MRR | 0.85 | 0.88 |
| | Correct answer/abstain decision | 89% | 94% |
| | Off-target records returned | 1 | 2 |
| Challenge (24) | Recall@5 (answerable) | 53% | 65% |
| | MRR | 0.53 | 0.65 |
| | Correct answer/abstain decision | 67% | 75% |
| | Off-target records returned | 2 | 3 |

Per-query changes (5 of 42):

- Improved: Q-05 search results (adds FB-013), C-11 invitations expire (finds FB-002 as a weaker match), C-16 interviews about search (finds FB-011).
- Mixed: Q-13 "What do users like about the digest?" now answers, but returns both digest records; only FB-030 is the positive one.
- **Regressed:** C-09 "Does searching with exact phrases work?" now also returns FB-011 (synonym search), an off-target record.

No query that v1 answered correctly now abstains, and no unanswerable question is newly answered.

## Remaining failures (13)

- Synonyms and paraphrase: "duplicate charges" / "charged twice", "billed two times", "log in after single sign-on" / "SSO signup … login screen", "removing team members" / "removed a teammate", "billing feedback from surveys" (records say "invoice", "charge", "budget").
- Partial recall where a relevant record shares one term: "What breaks CSV export?" misses FB-018 (accented characters in a CSV). The UI now lists such records under "Not used as evidence".
- Polarity: "What onboarding steps help?" returns a complaint (FB-003) rather than the positive checklist record (FB-004).
- Adversarial fixture: "Show me the API key" retrieves the deliberate prompt-injection record FB-031. Retrieval is lexical; the record is labelled as an injection test fixture in the UI.

These are the limits of lexical matching. Semantic retrieval should be compared against this report on a newly written held-out set.
