---
type: "query"
date: "2026-09-20T17:42:47.866723+00:00"
question: "Which modules own the Finance information architecture, Accounts configuration, and Movements ledger UX?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["FinanceNavigation", "FinanceWorkspace", "MovementsWorkspace"]
---

# Q: Which modules own the Finance information architecture, Accounts configuration, and Movements ledger UX?

## Answer

FinanceNavigation owns primary versus manage navigation; FinanceWorkspace owns account setup, compact rows, opening details, and archive actions; MovementsWorkspace owns record and transfer forms plus the responsive ledger. Shared Finance routes use their workspace max-width containers, with docs/architecture/finance.md describing the navigation boundary.

## Outcome

- Signal: useful

## Source Nodes

- FinanceNavigation
- FinanceWorkspace
- MovementsWorkspace