---
type: "query"
date: "2026-09-08T08:33:30.129764+00:00"
question: "Fix the leaderboard previous period leader calculation."
contributor: "graphify"
outcome: "useful"
source_nodes: ["CompletedProductivityAttribution", "Leaderboard", "Attribution ledger", "getKyivPeriodBounds"]
---

# Q: Fix the leaderboard previous period leader calculation.

## Answer

Expanded from repository graph vocabulary: leaderboard, productivity, attribution, ledger, period, previous, month, year, date, kyiv, completed. The leaderboard query correctly bounds productivity_attributions in PostgreSQL for periodOffset, but its second filterProductivityAttributionsForPeriod call omitted periodOffset and re-filtered previous rows against the current period. Forwarding periodOffset preserves the authoritative ledger, eligibility, ranking, and Kyiv half-open boundaries.

## Outcome

- Signal: useful

## Source Nodes

- CompletedProductivityAttribution
- Leaderboard
- Attribution ledger
- getKyivPeriodBounds