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

Local desktop and 390px mobile smoke checks covered workload filtering, rate changes, trace selection, invalid objective handling and readable metric cards. Publishing and latest workflow status should be checked on GitHub before describing this extension as live.

Next bounded milestone: a comparison harness and quality rubric using unseen tasks, or real local telemetry instrumentation. Live model access is still unavailable; continue independent work without inventing results. Model notes should be verified from official sources and reviewed weekly, with additional notes only for significant relevant releases. Keep high-level summaries linked to underlying evidence.
