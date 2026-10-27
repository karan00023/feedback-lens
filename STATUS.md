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

## October 27 — actual local HTTP telemetry

Added bounded, process-local HTTP lifecycle instrumentation and a metadata export endpoint. A real sequential loopback smoke run at 16:49 UTC recorded 18 completed requests: 12 extractive answers, 4 abstentions and 2 deliberate validation/content-type errors. On Node v22.19.0 / macOS arm64, retained completed-response p50 was 0.334 ms and p95 2.717 ms. These are one local run's server response-lifecycle timings, including error responses, over synthetic feedback. They are not model latency, a load test, answer accuracy, production data or an SLO. The recorded JSON includes the exact sample and limits. No provider calls or token/cost measurements occurred.

All 34 tests passed locally, including actual HTTP finish/disconnect handling, bounded retention, export redaction and origin rejection. The smoke runner verifies expected counts and runs in CI; timings intentionally vary. GitHub Pages serves only the recorded sample, never the local endpoint. Owner review remains pending. Publication/check status must be verified before reporting completion. This supports discussion of observability for AI platform roles; it does not establish enterprise gateway or model-routing ownership.

## October 27, 2026 — core workflow completion and retrieval v2

An audit of the hosted workspace found: no explanation for answers or abstentions; a channel change that erased the answer instead of re-running it; citations that silently cleared library filters and left stale highlights; a whole-list live region that re-announced on every keystroke; whitespace questions failing silently; no loading or retry state; a 330px inner scroll area on mobile; 9–10px text; the local server returning 404 for every page except the workspace (so "AI lab" broke under `npm start`); an evaluation runner whose per-query timings changed the committed report on every run; and a dark lab theme inconsistent with the workspace.

Fixed: rebuilt the workspace around scope → ask → inspect, with explicit answer-scope versus library-filter labelling, "Why this result?" explanations, related-but-uncited records, scope-limited abstention with a broaden option, weaker-match labelling, keyboard submission, focus management, URL-shareable investigations, and loading/error/retry states. The local server now serves the whole `docs/` tree with traversal protection. The lab pages share the workspace's light palette.

Retrieval v2 was evaluated against the frozen v1 baseline on the 18 development queries and on 24 challenge queries committed before the change. Development recall@5 63% → 73%, abstention 89% → 94%; challenge recall@5 53% → 65%, abstention 67% → 75%. Off-target records rose by one on each set; one challenge query regressed and 13 still fail. Some choices were made after seeing challenge failures, so those gains are optimistic. Details: `evaluations/RETRIEVAL-V2.md`.

Tests: 44 `node --test` tests pass (10 new: stemming, evidence rule, related records, weaker match, abstention reasons, channel scope, empty scope, live-mode explanation, static-file confinement, local page serving). `npm run test:browser` passed 24/24 Chromium checks at 1280×900 and 390×844 against the local Node server. CI steps (smoke run, deterministic telemetry, comparison fixtures, citation study, and the new evaluation-report diff check) pass locally on Node v22.22.0 / Linux.

Not verified in this session: the deployed GitHub Pages site, because the authoring environment could not reach github.io. Run `BASE_URL=https://karan00023.github.io/feedback-lens/ npm run test:browser` after publication. Live LLM mode, screen-reader software, Safari/Firefox and real devices were not tested. Model Notes 001 vendor claims were not re-verified.
