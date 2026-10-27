# Offline model-comparison harness

Implemented October 27, 2026. This module compares **imported outputs** on the same dataset and prompt. It does not call providers, require credentials, charge for inference or establish a model ranking.

## Run the example

Requires Node 22 or later; no dependencies.

```sh
npm run comparison:fixtures
node experiments/comparison/run.mjs \
  experiments/comparison/fixtures/dataset.json \
  experiments/comparison/prompt.txt \
  /tmp/feedback-comparison-report.json \
  experiments/comparison/fixtures/fixture-control.json \
  experiments/comparison/fixtures/fixture-failures.json
```

Choose a new output filename for each run: the CLI refuses to overwrite an existing file, including its inputs. The tracked [fixture report](fixtures/report.json) is also reproduced by `npm run comparison:fixtures`.

The eight examples and both output runs are scripted test fixtures. Their timing, usage and responses are hand-authored. They are **not outputs from any model**. The control passes all eight automated checks; the failure fixture passes four of eight. This validates the checking machinery, not AI performance. There is deliberately no known actual cost in these examples.

## Comparison contract

Each run includes:

- `schema_version: 1`, unique `run_id`, `provider` and exact `model_id` as reported by the source system.
- `execution: fixture` for scripted examples, or `declared_live` for externally collected outputs. The latter is an importer declaration, **not independent proof of provider execution**.
- SHA-256 hashes of the exact dataset and prompt file bytes. Changed whitespace changes the hash. All compared runs must match both hashes and the planned number of trials.
- An explicit `settings` object. Record generation parameters, tool access, output-token limits, date, adapter version, provider request IDs and model revision where available. Equal prompts alone do not establish a fair comparison; check settings and supported features manually before drawing a conclusion.
- A `rows` array with `case_id`, integer `trial`, `outcome` (`ok` or `error`), elapsed `latency_ms`, `input_tokens`, `output_tokens`, `actual_cost_usd` and `answer`.

Usage values must be nonnegative; tokens must be safe integers or null. Unknown tokens or actual cost must be null, never an inferred zero. Error rows use `answer: null`; completed rows use the Feedback Lens status/claims/evidence shape. Missing rows are permitted but counted as failures in the full planned denominator. Duplicate case/trial pairs, unknown cases and incompatible manifests are rejected.

No source prompts or answer text are copied into the report; it retains case IDs, judgments and declared metadata. Keep real imported outputs and any sensitive settings in a private local workspace. The repository's public examples are entirely synthetic. Do not publish provider exports by default.

## What the report measures

| Measure | Interpretation |
| --- | --- |
| Structural citation validity | Answer shape passes and each quote literally occurs in an allowed source. |
| Status agreement | Returned answer/abstention agrees with the authored reference label. |
| Exact source-set agreement | Unique cited source IDs equal the authored reference set. |
| Automated pass | All three checks pass. Missing and execution-error attempts fail. |
| Completion p95 | Nearest-rank latency of completed responses, including invalid answers. Errors and missing attempts are excluded and reported separately. |
| Token and actual-cost totals | Available only when every planned attempt has complete usage. Declared billing values are not independently verified. |
| Semantic correctness | Always null until a separate human review process establishes it. No semantic grading is implemented here. |

A real quote can accompany a completely false claim. The test suite explicitly demonstrates this: an invented revenue claim with an authentic signup quote passes structural/source checks. Therefore **automated pass is not answer correctness, injection resistance or task success**. Read the [human-review rubric](RUBRIC.md) before using results to choose a model.

## Dataset boundaries

`comparison-dev-v1` is a small, agent-authored, public development set. It contains answerable questions, a conflicting-evidence case and two abstention cases, including an adversarial fixture. It was visible during implementation and has not been independently labeled. No held-out, statistically significant or live adversarial performance is claimed.

Before a substantive provider comparison, obtain independently reviewed labels, reserve a separate untouched test set, document its provenance and hash it before running candidates. Do not rename these fixtures a holdout. Use repeated trials, identical evidence/tool access and transparent settings; keep failure rows and report uncertainty. No bootstrap interval or significance test is implemented in this milestone.

## Design reference

The [official OpenAI evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices), accessed October 27, 2026, recommends defining the objective, dataset and metrics and comparing results iteratively. This harness implements a local, provider-neutral subset of that workflow, rather than using a hosted eval service. Human calibration remains pending.

## Contribution and next work

The coding agent authored this harness, fixtures, tests and rubric in response to Karan's portfolio brief. Owner review is pending. Next: independently review task labels and implement a private, blinded human-review packet before importing real provider runs. Provider execution and any API spending require separately available access and an approved budget.
