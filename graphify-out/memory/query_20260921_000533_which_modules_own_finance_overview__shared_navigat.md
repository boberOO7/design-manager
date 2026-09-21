---
type: "query"
date: "2026-09-21T00:05:33.069446+00:00"
question: "Which modules own Finance Overview, shared navigation, and canonical chart reporting?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["FinanceOverviewWorkspace()", "FinanceNavigation()", "getFinanceOverview()", "FinanceCashChart()", "financeCashChartPoints()"]
---

# Q: Which modules own Finance Overview, shared navigation, and canonical chart reporting?

## Answer

Expanded with repository vocabulary: finance overview forecast cash. FinanceOverviewWorkspace in src/components/finance/finance-overview.tsx renders the control center; FinanceNavigation and src/app/(app)/finance/layout.tsx own shared tabs and width. getFinanceOverview consumes the existing admin-only get_finance_overview RPC. financeCashChartPoints only crops exact canonical points; FinanceCashChart uses the full range for Planning and a 30-day range for Overview. No reporting calculation or authorization boundary changed.

## Outcome

- Signal: useful

## Source Nodes

- FinanceOverviewWorkspace()
- FinanceNavigation()
- getFinanceOverview()
- FinanceCashChart()
- financeCashChartPoints()