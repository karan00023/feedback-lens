# Product brief

## User and problem

A product manager reviewing support tickets, interview notes and survey comments wants to identify friction, inspect the source evidence and ask a follow-up question without repeatedly searching separate tools.

The first slice is intentionally narrow: one fictional product, one synthetic corpus, one workspace and no external integrations. A useful answer is a starting point for investigation, not an automatic roadmap decision.

## Critical user journey

Open the workspace → select a channel → inspect themes and records → ask about a problem → read the evidence → open cited records → decide what to investigate next. When the corpus cannot answer, show an explicit insufficient-evidence state.

## Why this belongs in an AI product portfolio

The example role reviewed in this career search was Google's Senior Product Manager, Agentic AI and Insights Platform. Its requirements included conversational feedback analysis, source investigation, topic clustering and search, internal tools, platform adoption and consolidation of legacy workflows.

| Requirement | Current evidence | Gap |
| --- | --- | --- |
| Conversational investigation | Question form, evidence-first answer rendering, optional LLM adapter | Live model validation and follow-up context |
| Topic discovery and search | Filterable library and explicit theme taxonomy | Semantic search and learned clustering |
| Insight verification | Source IDs, quotes, source navigation and quote validation | Human ratings of semantic support |
| Product judgment | Scope, non-goals, acceptance checks and documented tradeoffs | Real user interviews and adoption evidence |
| Platform thinking | Shared engine, separated static UI and model boundary | Integrations, access model and extensibility |

This project is informed by those requirements. It is not affiliated with Google and does not establish that the owner has already delivered those capabilities professionally.

## Success measures

Measure retrieval recall and ranking on a versioned corpus, correctness of abstention, claim support judged by reviewers, task completion time, and live latency/token usage when available. Keep synthetic diagnostics separate from measurements with users. No success thresholds or business impact should be claimed without a defined baseline and measurement.

## Non-goals for the first version

No autonomous prioritization, sentiment-based employee/customer decisions, production user authentication, customer-data ingestion, paid hosting, analytics tracking or client-side API keys.

## Next user validation

Recruit three to five consenting product practitioners. Give them the same investigation tasks with the original library and the assisted workflow. Record correctness, source-checking behavior, time, confusion and preference. Report sample size and methodology; do not generalize a small pilot to enterprise adoption.
