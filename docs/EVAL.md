# Evaluation protocol

Goal: measure whether route-scoped WebMCP tools make an agent more reliable and faster at real storefront tasks
than operating the same site through the DOM alone. Nothing in this document is a result until it appears in
the run log below.

## Conditions

| Condition | Description                                                                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**     | WebMCP on: Chrome 149+ with the origin trial (or `chrome://flags/#enable-webmcp-testing`), tools registered by `examples/commerce`.                                               |
| **B**     | WebMCP off: same site, same agent, `document.modelContext` absent (flag off, non-trial origin, or `localhost` without the flag). The agent uses page text, clicks and forms only. |

Same model, same system prompt, same starting state (empty cart, home page) for every run. Mock provider, so
the catalog is deterministic.

## Tasks

| ID  | Prompt                                                                                      | Success criterion                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| T1  | "Find blue slip-on shoes under $80 and open the product page."                              | Final URL is the matching product's `/product/[handle]`.                                                                             |
| T2  | "Add the size 9 variant of the Acme slip-on shoes to my cart."                              | Cart contains exactly that variant with quantity 1.                                                                                  |
| T3  | "Change the quantity of the slip-on shoes in my cart to 2." (starts with T2's cart)         | Cart line quantity is 2; no other lines changed.                                                                                     |
| T4  | "Remove the shoes from my cart." (starts with T3's cart)                                    | Cart is empty.                                                                                                                       |
| T5  | "Find blue slip-on shoes in size 9 under $80 and add them to my cart, then start checkout." | Cart contains the variant and the approval card for `start_checkout` was shown and approved (A) / the checkout page was reached (B). |

## Metrics

- **success** — 1 if the criterion is met without human intervention beyond the confirm card; else 0.
- **actions** — count of tool calls (A) or of clicks/typing/navigation steps (B) the agent performed.
- **wall time** — seconds from prompt submit to the agent's final message.
- **errors** — count of tool-error strings (A) or visibly wrong clicks (B), noted free-form.

Run each task at least **n = 5** per condition. Record every run, including failures.

## Run log

| Task | Condition | n   | Model | Date | Success | Actions | Wall time (s) | Notes |
| ---- | --------- | --- | ----- | ---- | ------- | ------- | ------------- | ----- |
|      |           |     |       |      |         |         |               |       |

Copy this row per run. Do not aggregate until every planned run for a task/condition pair is logged.

## Results

**0 runs recorded as of 2026-09-03.** The methodology above is defined; no numbers exist yet. When runs are
logged, summarize per task: success rate, median actions, median wall time, for A and B side by side. Do not
publish figures in the README that are not backed by rows in the run log.

## Threats to validity

- Condition B depends heavily on the agent's DOM heuristics; a different browser agent will produce different
  baselines.
- The mock catalog is small; real stores have more ambiguity in search.
- Confirm cards add human time to A's wall time by design; report wall time with and without the approval
  wait if the tooling allows it.
