# Current status

Initial implementation: October 26, 2026.

The local project contains a working extractive browser demo, optional LLM adapter, tests and a development evaluation. Fifteen automated tests passed, including the local HTTP checks. Live LLM calls have not been exercised because no API key was configured in the authoring session. Provider tests use mocked transport and do not establish real model performance.

The current diagnostic report records retrieval limitations and should be regenerated with `npm run evaluate` after changes. Do not describe it as held out or production accuracy. Browser QA and public deployment verification are pending.

## Continuation instructions

Read README, ARCHITECTURE, ROADMAP, CONTRIBUTIONS and this status before changing the project. Check the current repository state and any applicable AGENTS.md. Choose one bounded milestone, implement it, run meaningful tests and update this record with measured results. Keep the demo honest about static versus live behavior. Do not publish private employer data, personal career plans, secrets or invented adoption metrics. Do not add a key to GitHub Pages.

Ongoing work was requested by Karan as his highest priority. A heartbeat attached to the career chat is scheduled every two hours. Notify him only for meaningful milestones, failures or required user action, and keep making independent progress when a dependency is missing.
