# Feedback Lens

[Open the live demonstration](https://karan00023.github.io/feedback-lens/) · [Source repository](https://github.com/karan00023/feedback-lens)

A personal portfolio prototype for investigating product feedback with source-linked answers. Built for a product manager who needs to move from a support inbox to an evidence-backed question about user friction.

The browser demo works without an API key. It uses an **extractive retrieval baseline**, not an LLM. The optional local server adds an OpenAI Responses API workflow with structured answers and citation validation. Live model behavior has not yet been tested with a real API key.

## Applied AI lab extensions

[Published technical studies](https://karan00023.github.io/feedback-lens/research/) include the synthetic telemetry report and a reproducible citation-validation counterexample. They are AI-assisted technical notes, not peer-reviewed papers. Run `npm run study:citations` to reproduce the latter.


- [Portfolio lab index](https://karan00023.github.io/feedback-lens/lab/)
- [Telemetry Lab](https://karan00023.github.io/feedback-lens/telemetry/): a synthetic request replay with cohort analysis, objective compliance, assumed cost and stage inspection.
- [Technical report](experiments/telemetry/REPORT.md): methods and measured simulation results, not peer-reviewed research.
- [Offline model-comparison harness](experiments/comparison/README.md): imports matched outputs, checks coverage and citations, and keeps semantic review separate. Example outputs are scripted fixtures, not model results.
- [Model notes 001](experiments/MODEL-NOTES-001.md): official-source reviews and test hypotheses, not a provider benchmark.

Run `npm run telemetry` to reproduce the request dataset and baseline report. Serve the whole `docs/` tree with a static server (for example `python3 -m http.server 8768 --bind 127.0.0.1 --directory docs`) to preview the added pages locally. The optional LLM server serves only its original allowlisted Feedback Lens files.

## Run it

Requires Node.js 22 or later. There are no package dependencies to install.

```sh
npm test
npm run evaluate
npm start
```

Open http://127.0.0.1:8767. The same `docs/` directory can be hosted on GitHub Pages; only the static baseline is available there.

## Try the workflow

1. Select a feedback channel and inspect the library.
2. Ask “What breaks CSV export?”
3. Click the cited source to inspect the original feedback.
4. Ask “How much revenue did we make last quarter?” to check abstention.
5. Open the evaluation section to see the measured baseline and its limitations.

The channel filter scopes answers. Theme and text filters narrow only the evidence library. Theme assignment uses explicit keyword rules; it is not learned topic clustering.

## Optional live model mode

Set `OPENAI_API_KEY` and `OPENAI_MODEL` in your shell, then start the local server. Choose a model available to your API project that supports Responses structured output. This project does not automatically load `.env` files. Do not commit a key or put it in browser code. The server binds to loopback and is intended for local development, not public hosting.

The model receives the question and retrieved synthetic records as untrusted data. It returns claims with exact quotes and source IDs. The server rejects missing IDs, fabricated quotes, incomplete responses and refusals. **A valid quote does not prove that a generated claim is semantically supported.** Human review and semantic evaluation remain necessary. Token usage is returned when available; costs and model latency have not yet been measured.

The implementation follows the [official structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs). No live model results are claimed by the mocked transport tests.

## What is implemented

- Filterable evidence library with 31 synthetic records and three channels.
- Six keyword-based product themes, plus an Other bucket.
- Shared browser/server retrieval and extractive answers with source navigation.
- Optional server-side LLM adapter, JSON schema and exact-quote validation.
- Local HTTP bounds, origin checks, a request limit and a static-file allowlist.
- Automated tests and an 18-question development evaluation, including failures.
- Accessible form labels, keyboard focus, responsive layout and error states.

## Evidence and limitations

The data describes a fictional product, Orbit workspace. It is entirely synthetic. No employer or customer data is included. Severity labels are authored sample metadata, not model predictions. One record contains an intentionally malicious instruction for testing untrusted content.

The evaluation questions were visible during development. This is a diagnostic suite, **not a held-out benchmark**. See [the full report](docs/data/evaluation.json) for per-query results. The keyword baseline does not reliably handle synonyms or semantic intent; it may retrieve irrelevant but lexically overlapping records. It can abstain even when the corpus contains an answer.

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

Run `npm run telemetry:local` to start an ephemeral loopback server, make 18 actual sequential HTTP requests over synthetic feedback and print a report. The run uses extractive mode only, makes no provider calls and closes its server. [Inspect one recorded local smoke run](docs/telemetry/local-smoke.json). Its server response-lifecycle timings are actual local observations, not simulated values, model-inference latency, browser round trips, load-test results or evidence of answer accuracy. Quantiles use nearest rank over retained completed HTTP responses, including HTTP errors; aborts are separate. The response's original `latency_ms` measures a narrower answer-computation span.

GitHub Pages remains static: it serves the recorded JSON, not a live telemetry endpoint. To inspect your own local app session, start `npm start`, make requests, then open `http://127.0.0.1:8767/api/telemetry`. Do not expose this development server publicly.
