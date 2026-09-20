---
type: "query"
date: "2026-09-20T18:59:19.784671+00:00"
question: "Which modules own the Finance Expected Payments timeline, create flow, and Movements presentation?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["FinanceExpectedWorkspace", "FinanceMovementsWorkspace", "getFinancePlanning", "getFinanceExpectedReturnHref"]
---

# Q: Which modules own the Finance Expected Payments timeline, create flow, and Movements presentation?

## Answer

FinanceExpectedWorkspace owns month grouping, compact rows, filters, progressive disclosure, completed rows, and create/edit presentation; FinanceMovementsWorkspace owns transfer and FX presentation; getFinancePlanning and getFinanceExpectedReturnHref provide the planning data and selected-item return flow.

## Outcome

- Signal: useful

## Source Nodes

- FinanceExpectedWorkspace
- FinanceMovementsWorkspace
- getFinancePlanning
- getFinanceExpectedReturnHref