# Feedback Lens

[Open the live demonstration](https://karan00023.github.io/feedback-lens/) · [Source repository](https://github.com/karan00023/feedback-lens)

A personal portfolio prototype for investigating product feedback with source-linked answers. Built for a product manager who needs to move from a support inbox to an evidence-backed question about user friction.

Ask any reasonable question in plain English. With the Feedback Lens server running and a free-tier Gemini key configured, a language model interprets the question (typos, follow-ups, general versus product questions), **semantic + keyword retrieval** finds the relevant feedback, and the answer separates three things: **findings from your feedback** (each cited, with the quote checked against the record), **general knowledge** (labelled, not from your feedback) and **what cannot be verified**. This was verified with real Gemini calls on 16 November 2026 ([live results](evaluations/live-verification.json)).

The static GitHub Pages copy has no server, so it cannot hold an API key: there, answers use keyword retrieval and rule-based listings that quote records verbatim, and the page says that AI is not connected. See [Deploying AI answers](#deploying-ai-answers).

## Start here: five practical walkthroughs

This is Karan Kapoor's personal AI product portfolio, developed with AI coding assistance. Each walkthrough connects a product decision to a working artifact and inspectable evidence.

| Question to explore | Try it | Inspect the evidence |
| --- | --- | --- |
| Would you trust an AI usage bill after retries, conflicting records or a tariff change? | [Metering & Launch Console](https://karan00023.github.io/feedback-lens/metering/) — replay events, inspect exact charges and review decision blockers. | [Accounting decisions and three-minute walkthrough](docs/metering/README.md). Synthetic usage, fictional prices and a simulated gate; no production billing or enforcement. |
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
npm test            # 92 unit and local HTTP tests (scripted providers; no network)
GEMINI_API_KEY=... npm start           # with AI answers
GEMINI_API_KEY=... npm run verify:live # 10 live checks against the real model
npm run evaluate    # scores v1, today's retriever and the full workspace; checks 24 use cases
npm start           # http://127.0.0.1:8767 — serves the whole docs/ site locally
```

`npm run test:browser` drives the workflow in Chromium at desktop and mobile widths. It needs Playwright with Chromium, which is not a project dependency. Set `BASE_URL` to run the same checks against the hosted site.

The same `docs/` directory is published by GitHub Pages; only the static, keyless experience is available there.

## Try the workflow

1. **Scope.** Choose a channel. The channel limits both the answer and the evidence library.
2. **Ask.** Ask “What breaks CSV export?” or pick an example. Enter submits; Shift+Enter adds a line.
3. **Inspect.** With AI on, the answer is labelled *AI answer* with the model name, and split into *From your feedback* (cited points with the checked quote), *General knowledge · not from your feedback*, and *Not verified*. “Understood as” shows how the question was interpreted. Without AI, answers quote matching records word for word and are labelled *Keyword search · no AI*.
   Follow-up questions (“What about the previous issue?”) use the conversation; *New conversation* clears it.
4. **Follow a source.** “Show FB-016 in library” scrolls to and focuses the record, clearing any library filter that would hide it. “Back to answer” returns.
5. **Understand the result.** “Why this result?” lists the searched terms, terms missing from the scope, the rule applied and records that shared a term but were not cited.
6. **Explore.** “Top issues”, “Most urgent”, “Feature requests”, “What users like” and “Compare channels” answer from record metadata and keyword rules, quoting the records they used. Questions such as “Tell me about billing”, “How many complaints are about exports?” or “Show me recent feedback” work too.
7. **Limits.** “Too narrow a scope” offers to search all channels. “Out of scope” (revenue) explains what the library covers and suggests questions that will work. “Sensitive request” is declined. A specific question nothing answers (“total invoice owed by Acme”) says so, then shows related feedback labelled as context.

**What affects answers:** only the question and the channel. **What does not:** theme chips, library search and “Cited only” narrow the evidence library. The UI says so beside each control. Themes are keyword rules, not learned clusters. A question and channel are kept in the URL so an investigation can be shared.

## AI answers

**Provider: Google Gemini API, free tier**, through its OpenAI-compatible endpoint. Chat model `gemini-3.5-flash-lite`, falling back to `gemini-3.1-flash-lite` when the primary is overloaded or rate-limited; embeddings `gemini-embedding-001`. Groq, OpenRouter, Ollama (local, no key) and OpenAI work by setting `LLM_PROVIDER` (see `.env.example`); only Gemini has been exercised with real calls.

Why Gemini: it has a no-cost tier for both chat and embeddings, so one free key covers question understanding, semantic retrieval and answers. It was also the only one of the evaluated providers reachable from the authoring environment. Groq and OpenRouter were blocked by its network policy, and Ollama cannot run on the free hosting targets. Free-tier rate limits are low and change over time; check Google AI Studio for current limits. The authoring session could not open Google's pricing pages, so they are not quoted here. **Google's free-tier terms may allow submitted content to be used to improve its products.** That is why only records marked `synthetic: true` are sent by default (see Privacy below).

How a question is answered (`ai/pipeline.mjs`):

1. **Guardrails first.** Credential/financial-data requests are declined and help requests answered without calling the model.
2. **Understand** (model call, strict JSON schema): intent (feedback, general, product fact, mixed, ambiguous), a standalone rewrite that fixes typos and resolves references from up to six earlier turns, search queries, and whether the whole scope is needed (top issues, urgency, priorities, comparisons).
3. **Retrieve** (`ai/retrieval.mjs`): within the selected channel only, embedding similarity is fused with the existing lexical retriever (reciprocal-rank fusion). Aggregate questions see every record in scope. Retrieval always runs, but an empty result never ends the workflow.
4. **Answer** (model call, strict JSON schema). The model gets the records as untrusted data, plus statistics computed by code: theme counts and severity. It is told that no product documentation exists.
5. **Validate** (`validateGenerated`). It removes any feedback point that:
   - cites a record that was not retrieved;
   - quotes text that is not word for word in the cited record;
   - states numbers that are in neither the cited records nor the code-computed statistics.

   Unknown record IDs are scrubbed from free text, and a headline with an unsupported number is replaced. Every removal is listed under “checks changed this answer”.
6. **Fallbacks.** Timeouts, retries, Retry-After and failover are handled in `ai/provider.mjs`:
   - each call times out after 20 s;
   - 429 and 5xx responses get two retries, honouring Retry-After;
   - after that, the fallback model is tried;
   - malformed JSON is retried once;
   - a failed embedding call degrades to keyword retrieval.

   If the model still fails, the keyword answer is shown with the reason (for example “rate limit reached”), never a blank error.

**Privacy controls** (`ai/privacy.mjs`):
- Only records marked synthetic are sent unless `ALLOW_REAL_FEEDBACK_TO_PROVIDER=true`.
- Emails, phone numbers, card-like numbers, URLs with query strings and key-like strings are redacted before sending.
- Only retrieved records are sent; the whole scope is sent only for aggregate questions over this 31-record sample.
- General questions send the question and any related records retrieved.
- The key stays in server environment variables; the browser never sees it.

**Limits.** A quote that appears in a record does not prove the point follows from it. General-knowledge text is model-written and not checked against a source. Model output varies between runs. A typical answer takes 3–10 s and makes two chat calls, plus embedding calls.

## Deploying AI answers

GitHub Pages serves static files only and cannot keep a key secret. To get AI answers in a deployment:

1. Create a free Gemini API key in Google AI Studio.
2. Host the server, for example on Render with the included `render.yaml` (free web service; it sleeps when idle, so the first request after a pause is slow). Set `GEMINI_API_KEY` and `PUBLIC_HOSTS` (the service hostname) in the dashboard. That URL serves the full app with AI on.
3. Optional: to make the GitHub Pages copy use it, put the service URL (ending in `/`) in `<meta name="feedback-lens-api">` in `docs/index.html`. `ALLOWED_ORIGINS` must include `https://karan00023.github.io`.
4. Optional: add `GEMINI_API_KEY` as a repository secret so CI runs `npm run verify:live`.

## What is implemented

- Filterable evidence library with 31 synthetic records across three channels.
- Six keyword-based product themes, plus an Other bucket.
- A deterministic question router (`docs/assistant.mjs`) for specific problems, overviews, urgency, feature requests, praise, themes, recency, counts, channel comparison, help and sensitive requests. No question ends in a bare error: non-answers explain why and suggest questions that work. See [the router note](evaluations/ASSISTANT.md).
- Shared browser/server lexical retrieval (v3) with a small hand-written synonym glossary and an explanation for every search answer and abstention.
- Extractive answers that quote records verbatim, with source navigation and match highlighting.
- Useful states: loading, failed load with retry, empty question, no library matches, weaker match, scope-limited abstention with a broaden option, and provider errors with retry.
- Hybrid AI answers: model-based question understanding with conversation context, semantic + keyword retrieval, structured generation, citation/number/ID validation, model failover and keyword fallback. Verified with real Gemini free-tier calls (10/10 live checks, 16 Nov 2026).
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
