# @divisor-agent/extension-deep-research

Multi-agent deep research for Divisor Agent: clarify scope → plan parallel
sub-questions → run focused web-search sub-researchers → reflect → synthesize a
cited report.

## Tools registered

- `deep-research/run` — orchestrates the full run (clarify → plan → parallel
  research → reflect → synthesize). Produces a live progress block and a report
  artifact.
- `web/search` — Tavily-backed web search. Requires `TAVILY_API_KEY`.
- `web/fetch` — fetch a URL and return its main text.

## UI

- Progress assistant block (`deep-research.progress`) rendered above the tool
  card, showing each sub-researcher's status and source counts.
- Report artifact (`deep-research.report`) in the right panel, with clickable
  `[n]` citations that scroll to the source list.

## Configuration

Set `TAVILY_API_KEY` in the environment before launching the app to enable web
search. Without it, `web/search` returns an actionable error and the run still
completes with whatever the sub-researchers can produce.

## Notes / future work

- Planning currently uses a deterministic decomposition scaffold. A production
  build can replace it with a `submit_research_plan` tool-call so the model owns
  the decomposition (pi-ai has no native structured output).
- Reflection runs at most one extra round for weak sub-tasks.
