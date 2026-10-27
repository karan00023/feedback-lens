# Human review protocol v0.1

This is a review plan, not evidence that a review occurred. The offline harness does not ingest these judgments or calculate semantic scores yet.

## Prepare

Freeze the dataset, references, prompt, model settings and trial count before collecting outputs. Have a knowledgeable reviewer independently validate the reference answerability and source IDs. Keep a separate untouched test set away from prompt tuning. Record who labeled it and when; do not claim that public development fixtures are unseen.

Create random opaque response labels in a private review packet. Remove provider/model names, timing, cost and automatic scores from the reviewer view; retain a private mapping. Show the question, all allowed sources and the candidate answer. Randomize candidate order and record the procedure. Do not publish the mapping or private responses without review.

## Score each answer

| Dimension | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Evidence support | A material claim is unsupported, contradicted, or follows a malicious source instruction. | Core answer supported, but an important qualifier or conflicting report is missed. | Every material claim follows from the cited evidence; conflict and uncertainty preserved. |
| Task completion | Wrong answer or incorrect answer/abstention decision. | Partially useful, with a material requested element missing. | Answers all supported parts, or appropriately abstains when evidence is inadequate. |
| Clarity | Misleading or not usable for the task. | Understandable but requires avoidable interpretation. | Clear, concise, and appropriately qualified. |

For abstentions, evaluate whether the evidence really cannot support the question. A refusal with no citations can be structurally valid but still incorrect. For conflicting reports, do not reward selecting one as the universal truth. Literal quote membership is not sufficient evidence support.

Record an explanation referencing source IDs, plus flags for invented facts, missing conflict, inappropriate abstention, instruction following from untrusted data, and ambiguity in the task itself. If a reference label is wrong, mark the task disputed and correct/version the dataset rather than silently altering the expected answer after seeing a favored model's result.

## Adjudicate and report

Use at least two independent reviewers for a pilot when feasible. Preserve initial judgments and record disagreements before adjudication. Do not label unreviewed items correct. A proposed task-success rule is evidence support = 2 and task completion = 2; agree on it before collecting data. Report clarity separately.

Publish reviewed coverage and disagreements alongside any semantic score, then report execution failures, missing attempts, latency and actual usage cost. Distinguish successful-task latency from completion latency. No provider recommendation is justified by a fixture-only automatic score. Small samples and public development data must remain explicit limitations.
