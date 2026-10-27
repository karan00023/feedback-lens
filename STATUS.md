# Current status

Initial implementation: October 26, 2026.

The local project contains a working extractive browser demo, optional LLM adapter, tests and a development evaluation. Fifteen automated tests passed, including the local HTTP checks. Live LLM calls have not been exercised because no API key was configured in the authoring session. Provider tests use mocked transport and do not establish real model performance.

The current diagnostic report records retrieval limitations and should be regenerated with `npm run evaluate` after changes. Do not describe it as held out or production accuracy. Desktop (1280px) and mobile (390px) browser checks passed for cited answers, source navigation, combined channel/text filtering and out-of-scope abstention. Citation navigation was adjusted to avoid an intermediate smooth-scroll position. The hosted demonstration was opened and its CSV answer workflow verified.

Source: https://github.com/karan00023/feedback-lens

Live static demo: https://karan00023.github.io/feedback-lens/

The initial Verify prototype workflow and GitHub Pages deployment both completed successfully. See GitHub Actions for subsequent commit status. This is an initial browser smoke check, not comprehensive accessibility or device certification.

## Continuation instructions

Read README, ARCHITECTURE, ROADMAP, CONTRIBUTIONS and this status before changing the project. Check the current repository state and any applicable AGENTS.md. Choose one bounded milestone, implement it, run meaningful tests and update this record with measured results. Keep the demo honest about static versus live behavior. Do not publish private employer data, personal career plans, secrets or invented adoption metrics. Do not add a key to GitHub Pages.

Ongoing work was requested by Karan as his highest priority. A heartbeat attached to the career chat is scheduled every two hours. Notify him only for meaningful milestones, failures or required user action, and keep making independent progress when a dependency is missing.

## October 27, 2026 — telemetry and model notes

Added the Applied AI lab index, Telemetry Lab, an accompanying non-peer-reviewed technical report and Model Notes 001. All 20 automated tests passed locally. The sample has 480 deterministic synthetic requests; aggregate p50 is 953 / 2,543 ms (v1 / v2) while quick and deep cohort medians both improve. All costs are hypothetical. No real provider comparison or real telemetry is claimed.

Local desktop and 390px mobile smoke checks covered workload filtering, rate changes, trace selection, invalid objective handling and readable metric cards. The extension was published in commit 04b92dc8a5d2a8b35afbc476788e2113fd60ef8d. GitHub Verify prototype and Pages deployment both passed. The public Telemetry Lab loaded the full dataset and its quick-workload filter returned the expected 947 / 815 ms cohort medians. The report, lab index and model notes are included in the same deployment.

Next bounded milestone: a comparison harness and quality rubric using unseen tasks, or real local telemetry instrumentation. Live model access is still unavailable; continue independent work without inventing results. Model notes should be verified from official sources and reviewed weekly, with additional notes only for significant relevant releases. Keep high-level summaries linked to underlying evidence.


## October 27, 2026 — offline comparison milestone

Implemented a provider-neutral offline comparison CLI with dataset/prompt hashes, trial/coverage checks, literal citation validation, reference-label comparisons and separate pending semantic review. Eight authored development cases and two explicitly scripted runs exercise the contract. They are not a provider benchmark or untouched test set. Added a draft human-review rubric.

All 30 tests passed locally, including an end-to-end CLI test and a deliberate demonstration that an unsupported claim with a genuine quote can pass automatic citation checks. No paid or live provider calls were made. Missing results count against the planned denominator; unknown cost and incomplete token totals remain null.

Next: independently review dataset labels, prepare a private blinded review packet and retain a truly untouched set before collecting provider results. Model Notes 001 is dated October 27; a duplicate weekly source review is not due. Publication and workflow status for this source milestone should be checked on GitHub.

## October 27 — published study preparation

Added a technical-studies index and a citation-validation counterexample using the real offline harness. Two scripted claims share one valid quote; both pass automatic checks, while only the signup claim follows from the source. This is a constructed diagnostic, not model performance or independent human evaluation. The authoring agent wrote the code and article; owner review remains pending. Publication and CI must be checked before reporting the new note live.
