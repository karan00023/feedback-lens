# Roadmap

## Priority 1 — Reliable first demonstration

- [x] Synthetic feedback library and authored metadata.
- [x] Filterable browser workspace and source navigation.
- [x] Shared lexical retrieval and extractive baseline.
- [x] Optional server-side LLM adapter and citation validation.
- [x] Automated core and local HTTP tests.
- [x] Reproducible development evaluation with failures.
- [x] Verify initial desktop and mobile browser interactions.
- [x] Publish source and GitHub Pages demonstration; verify URLs.

## Priority 1b — Coherent core workflow

- [x] Explain answer scope versus library-only filters in the UI.
- [x] Explain why each answer or abstention happened.
- [x] Useful loading, failed-load, empty, weaker-match and abstention states.
- [x] Local server serves every portfolio page; consistent light theme across pages.
- [x] Automated browser workflow checks at desktop and mobile widths.
- [x] Answer common question types (overview, urgency, requests, praise, themes, recency, counts, channel comparison, help, sensitive) without dead ends.
- [ ] Verify the published site from a network that can reach GitHub Pages after each release.

## Priority 2 — Measure the AI improvement

- [ ] Configure a server-side model/key locally and run live tests.
- [x] Draft response-quality rubric and human review guidelines; independent annotation remains pending.
- [x] Write and commit a challenge query set before retrieval tuning (same author; not independent).
- [ ] Create an independently written held-out query set.
- [x] Compare lexical v1 and v2 side by side, reporting gains and regressions.
- [ ] Compare lexical and semantic retrieval on a held-out set.
- [ ] Run injection, misleading evidence, conflict and abstention cases against the live model.
- [ ] Measure latency, tokens and actual API cost using verified pricing.
- [ ] Implement contextual follow-up questions and inspect how scope changes affect evidence.

## Priority 3 — Product evidence

- [ ] Karan reviews the implementation and records his decisions and contributions.
- [ ] Conduct a small consenting reviewer pilot with a documented task protocol.
- [ ] Record a three-minute demo explaining one useful answer and one failure.
- [ ] Write a case study with actual evaluation and pilot findings.
- [ ] Add the verified project to the portfolio, resume and LinkedIn Featured section with announcements off.

## Priority 4 — Platform extension

- [ ] Design import contracts and a permission model before accepting real customer data.
- [ ] Add learned topic clustering with a comparison to the keyword taxonomy.
- [ ] Add a reusable widget or plugin contract and document integration choices.
- [ ] Consider public live hosting only after access, cost and retention controls exist.

## Applied AI lab — staged extension

- [x] Initial synthetic telemetry analysis app, reproducible dataset and calculation tests.
- [x] Technical report with methods, simulation findings and limitations.
- [x] First official-source model review and test hypotheses.
- [x] Offline matched-workload comparison harness, versioned development fixtures and draft quality rubric.
- [ ] Independently reviewed, untouched task set and a blinded human-review packet.
- [x] Real local-app HTTP lifecycle instrumentation and bounded metadata export; no raw prompts. A local smoke run is recorded; no live model or production results.
- [ ] Live provider evaluation after approved server-side access and a budget are available.
- [ ] Owner walkthrough and reviewer pilot, followed by an evidence-backed case study.

Prioritize finishing and validating these before adding unrelated demo sites. Publish on actual completion dates. Aim for one substantial case study every one to two weeks, adjusted to evidence and review readiness. Never fabricate a history of work to make the portfolio look older.
