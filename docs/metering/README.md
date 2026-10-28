# Metering & Launch Console

[Open the interactive replay](https://karan00023.github.io/feedback-lens/metering/)

A browser-only product prototype for exploring the control path from AI usage to a reconciled charge and a review decision. It complements the feedback workspace and Telemetry Lab without changing their implementations.

## Demonstrate it in three minutes

1. Clean batch: six synthetic events, four completed requests, two zero-rated failures/aborts, **$9.76** at fictional baseline prices.
2. Duplicate delivery: an exact retry adds one input row but leaves the charge unchanged.
3. Conflicting usage: both occurrences of e2 are quarantined; the remaining **$5.36 is incomplete**, not savings. The gate stays HOLD.
4. Return to Clean batch, move pricing to 125%: **$12.20**, above the $10 batch threshold.
5. Increase the budget and acknowledge the simulated review. Only the replay checks pass; this is not approval to deploy.
6. Export the evidence packet and inspect exact amounts, rejected rows, rates and assumptions.

## Product questions this makes concrete

| Area | Decision visible in the product | Deliberate boundary |
| --- | --- | --- |
| Usage metering and billing | What is the billable identity? What happens on redelivery or a conflicting correction? | Deduplication is batch-only, not durable or exactly-once delivery. |
| Platform and compute costs | Who owns accepted spend, and what changes under a tariff? | No fleet provisioning, live model routing, performance or provider-cost measurement. |
| Pricing and spend controls | Does the same accepted usage cross a threshold after a price change? | Replay threshold only. No enforcement, taxes, tiers, FX, credits or cached-token pricing. |
| Launch coordination | Which integrity, budget or review conditions block a decision? | One local unauthenticated checkbox; no genuine multi-party approvals. |

## Contract and accounting

Each event has exactly seven fields: eventId, requestId, team, model, inputTokens, outputTokens, status. Identifiers are bounded ASCII letters/digits/underscore/hyphen; token counts are non-negative safe integers no larger than one billion. The import is limited to 1,000 events and the browser editor to 500 KB. Extra fields, including prompts, are rejected.

An event ID identifies a delivered record; a request ID identifies a logical billable request. Exact redeliveries collapse. Conflicting event IDs quarantine the entire group, including an original whose replay is malformed. Multiple completed records with different event IDs for one logical request are also quarantined. Failed and aborted requests are zero-rated by this explicitly chosen demonstration policy; actual vendors may bill them differently.

Fictional rates: swift $2/$8 and deep $10/$30 per million input/output tokens. Integer milli-USD-per-million rates multiplied by token counts yield exact integer nanodollars. Proposed percentage pricing rounds half up to nanodollars per accepted request. Aggregate amounts round half up once to cents for display. Team displays are independently rounded, so rounded team displays need not sum to rounded batch display; exact exported nanos do reconcile.

No event timestamps, billing periods, durable ledger, corrections, late events, usage signatures or reconciliation against an independent upstream counter exist. A malicious producer can invent unique identities. These are next system-design concerns, not implemented guarantees.

## Implementation and reproduction

- meter.mjs: shared pure reconciliation and gate engine.
- app.mjs: DOM rendering with textContent for imported values; no HTML interpolation, network calls or persistence.
- index.html: responsive, keyboard-operable replay workspace, import/export and methods.
- ../../tests/metering.test.mjs: 16 tests. Run `node --test tests/metering.test.mjs` or `npm test` from the repository root.

The exact engine and 16 tests were executed with Node on October 28, 2026 before publication; all passed. These are authored simulation tests, not production/model benchmarks. Check the pull request and GitHub Actions for whole-repository verification and deployment.

## Contribution and interview accuracy

Karan requested products that demonstrate platform, spend-management and launch reasoning. The coding agent authored this implementation, fixtures and tests. Karan's independent review, implementation and product decisions are not yet recorded.

Accurate initial wording: “I am developing an AI usage-reconciliation prototype with AI coding assistance. I can demonstrate how delivery retries, conflicting usage and pricing assumptions affect a replay ledger.” After reviewing it, explain the decisions you actually understand and change. Do not claim production billing ownership, customer adoption, measured savings, actual finance sign-off or live model evaluation from this artifact.

Created October 28, 2026. Synthetic events and hypothetical prices only.
