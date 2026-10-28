# Feedback Lens

[Open the live demonstration](https://karan00023.github.io/feedback-lens/) · [Source repository](https://github.com/karan00023/feedback-lens)

A personal portfolio prototype for investigating product feedback with source-linked answers. Built for a product manager who needs to move from a support inbox to an evidence-backed question about user friction.

The browser demo works without an API key. It uses **keyword retrieval and rule-based listings that quote records verbatim**, not an LLM. The optional local server adds an OpenAI Responses API workflow with structured answers and citation validation. Live model behavior has not yet been tested with a real API key.

## Start here: four practical walkthroughs

This is Karan Kapoor's personal AI product portfolio, developed with AI coding assistance. Each walkthrough connects a product decision to a working artifact and inspectable evidence.

| Question to explore | Try it | Inspect the evidence |
| --- | --- | --- |
| Can a feedback assistant show its evidence and say when it does not know? | [Feedback Lens workspace](https://karan00023.github.io/feedback-lens/) — ask “What breaks CSV export?”, follow the citation, then try the out-of-scope and narrow-scope examples. | [Retrieval change note](evaluations/RETRIEVAL-V2.md): frozen baseline vs current, gains, one regression and remaining failures. Extractive only; no LLM runs on the hosted page. |
| Why can aggregate latency worsen when both workload cohorts improve? | [Telemetry Lab](https://karan00023.github.io/feedback-lens/telemetry/) — switch between all, quick and deep workloads. | [Methods and synthetic results](https://karan00023.github.io/feedback-lens/telemetry/report.html). The 480 requests are generated fixtures; costs are hypothetical. |
| Does a valid citation mean an answer is supported? | [Citation counterexample](https://karan00023.github.io/feedback-lens/research/citation-checks.html) — inspect two scripted claims that share a genuine quote. | [Offline evaluation harness](experiments/comparison/README.md). Structural validation and semantic review are separate; no live model ranking is claimed. |
| What should a platform record when requests finish, fail or disconnect? | [Recorded local HTTP smoke run](docs/telemetry/local-smoke.json) — inspect 18 actual loopback requests over synthetic feedback. | [Bounded instrumentation](request-metrics.mjs) and [HTTP tests](tests/request-metrics.test.mjs). These are local service measurements, not production or model-inference latency. |

[Browse the lab](https://karan00023.github.io/feedback-lens/lab/) · [Use the feedback investigation demo](https://karan00023.github.io/feedback-lens/) · [See contributions and review status](CONTRIBUTIONS.md)

## Applied AI lab extensions

[Published technical studies](https://karan00023.github.io/feedback-lens/research/) include the synthetic telemetry report and a reproducible citation-validation counterexample. They are AI-assisted technical notes, not peer-reviewed papers. Run `npm run study:citations` to reproduce the latter.


- [Portfolio lab index](https://karan00023.github.io/feedback-lens/lab/)
- [Telemetry Lab](https://karan00023.github.io/feedback-lens/telemetry/): a synthetic request replay with cohort analysis, objective compliance, assumed cost and stage inspection.
- [Technical report](experiments/telemetry/REPORT.md): methods and measured simulation results, not peer-reviewed research.
- [Offline model-comparison harness](experiments/comparison/README.md): imports matched outputs, checks coverage and citations, and keeps semantic review separate. Example outputs are scripted fixtures, not model results.
- [Model notes 001](experiments/MODEL-NOTES-001.md): official-source reviews and test hypotheses, not a provider benchmark.

Run `npm run telemetry` to reproduce the request dataset and baseline report. `npm start` serves every page locally, or use any static server over `docs/` (for example `python3 -m http.server 8768 --bind 127.0.0.1 --directory docs`).

## Run it

Requires Node.js 22 or later. There are no package dependencies to install.

```sh
npm test            # 56 unit and local HTTP tests
npm run evaluate    # scores v1, today's retriever and the full workspace; checks 24 use cases
npm start           # http://127.0.0.1:8767 — serves the whole docs/ site locally
```

`npm run test:browser` drives the workflow in Chromium at desktop and mobile widths. It needs Playwright with Chromium, which is not a project dependency. Set `BASE_URL` to run the same checks against the hosted site.

The same `docs/` directory is published by GitHub Pages; only the static, keyless experience is available there.

## Try the workflow

1. **Scope.** Choose a channel. The channel limits both the answer and the evidence library.
2. **Ask.** Ask “What breaks CSV export?” or pick an example. Enter submits; Shift+Enter adds a line.
3. **Inspect.** The answer quotes matching records word for word, highlights the words that matched and labels itself *Extractive · no LLM*.
4. **Follow a source.** “Show FB-016 in library” scrolls to and focuses the record, clearing any library filter that would hide it. “Back to answer” returns.
5. **Understand the result.** “Why this result?” lists the searched terms, terms missing from the scope, the rule applied and records that shared a term but were not cited.
6. **Explore.** “Top issues”, “Most urgent”, “Feature requests”, “What users like” and “Compare channels” answer from record metadata and keyword rules, quoting the records they used. Questions such as “Tell me about billing”, “How many complaints are about exports?” or “Show me recent feedback” work too.
7. **Limits.** “Too narrow a scope” offers to search all channels. “Out of scope” (revenue) explains what the library covers and suggests questions that will work. “Sensitive request” is declined. A specific question nothing answers (“total invoice owed by Acme”) says so, then shows related feedback labelled as context.

**What affects answers:** only the question and the channel. **What does not:** theme chips, library search and “Cited only” narrow the evidence library. The UI says so beside each control. Themes are keyword rules, not learned clusters. A question and channel are kept in the URL so an investigation can be shared.

## Optional live model mode

Set `OPENAI_API_KEY` and `OPENAI_MODEL` in your shell, then start the local server. Choose a model available to your API project that supports Responses structured output. This project does not automatically load `.env` files. Do not commit a key or put it in browser code. The server binds to loopback and is intended for local development, not public hosting. A mode selector appears only when the local server reports a configured key. The same question router chooses the records; help, declined and non-answers never call the provider.

The model receives the question and retrieved synthetic records as untrusted data. It returns claims with exact quotes and source IDs. The server rejects missing IDs, fabricated quotes, incomplete responses and refusals. **A valid quote does not prove that a generated claim is semantically supported.** Human review and semantic evaluation remain necessary. Token usage is returned when available; costs and model latency have not been measured.

**Live behavior has never been exercised with a real provider.** Tests use a mocked transport. The implementation follows the [official structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).

## What is implemented

- Filterable evidence library with 31 synthetic records across three channels.
- Six keyword-based product themes, plus an Other bucket.
- A deterministic question router (`docs/assistant.mjs`) for specific problems, overviews, urgency, feature requests, praise, themes, recency, counts, channel comparison, help and sensitive requests. No question ends in a bare error: non-answers explain why and suggest questions that work. See [the router note](evaluations/ASSISTANT.md).
- Shared browser/server lexical retrieval (v3) with a small hand-written synonym glossary and an explanation for every search answer and abstention.
- Extractive answers that quote records verbatim, with source navigation and match highlighting.
- Useful states: loading, failed load with retry, empty question, no library matches, weaker match, scope-limited abstention with a broaden option, and provider errors with retry.
- Optional server-side LLM adapter, JSON schema and exact-quote validation (unvalidated with a real provider).
- Local HTTP bounds, origin checks, a request limit and a static file server confined to `docs/`.
- A side-by-side evaluation of the frozen v1 retriever and the current one on two query sets. See [the retrieval change note](evaluations/RETRIEVAL-V2.md).
- Keyboard-operable controls, visible focus, screen-reader announcements and layouts checked at 1280px and 390px.

## Evidence and limitations

The data describes a fictional product, Orbit workspace. It is entirely synthetic. No employer or customer data is included. Severity labels are authored sample metadata, not model predictions. One record contains an intentionally malicious instruction for testing untrusted content.

All three question sets (18 development, 24 challenge, 24 use cases) were written by the project author with AI assistance. The synonym glossary and some rules were adjusted after seeing failures. They are diagnostics, **not a held-out benchmark**. See [the full report](docs/data/evaluation.json) and the change notes for [v2](evaluations/RETRIEVAL-V2.md) and [the router and v3](evaluations/ASSISTANT.md), which list regressions and remaining failures. Lexical retrieval handles only the synonyms in its glossary and does not understand polarity; it can return off-target records and can abstain when the corpus contains an answer.

No customer adoption, business savings, production reliability, autonomous multi-agent capability or live LLM accuracy is claimed. The interface is a working prototype, not a commercial deployment.

## Project record

- [Product brief and role alignment](PRODUCT.md)
- [Architecture and decisions](ARCHITECTURE.md)
- [Roadmap](ROADMAP.md)
- [Current status and continuation notes](STATUS.md)
- [Contribution record](CONTRIBUTIONS.md)

This is Karan Kapoor's personal portfolio project, developed with AI coding assistance. The contribution record distinguishes project direction from agent-written code and pending validation.

## Measured local request telemetry

The optional loopback server now exposes `GET /api/telemetry`. It retains at most 200 metadata records for local `POST /api/answer` requests after Host/Origin checks: response status, bounded mode/outcome labels, duration and finished/aborted completion. It never retains question text, source text, headers, addresses or API keys. The buffer resets with the process; eviction and retained denominators are explicit. Token usage and costs remain unknown. There is no remote collector.

Run `npm run telemetry:local` to start an ephemeral loopback server, make 18 actual sequential HTTP requests over synthetic feedback and print a report. The run uses extractive mode only, makes no provider calls and closes its server. [Inspect one recorded local smoke run](docs/telemetry/local-smoke.json) (recorded before the retrieval v2 change; the runner's expected counts still pass with v2). Its server response-lifecycle timings are actual local observations, not simulated values, model-inference latency, browser round trips, load-test results or evidence of answer accuracy. Quantiles use nearest rank over retained completed HTTP responses, including HTTP errors; aborts are separate. The response's original `latency_ms` measures a narrower answer-computation span.

GitHub Pages remains static: it serves the recorded JSON, not a live telemetry endpoint. To inspect your own local app session, start `npm start`, make requests, then open `http://127.0.0.1:8767/api/telemetry`. Do not expose this development server publicly.
