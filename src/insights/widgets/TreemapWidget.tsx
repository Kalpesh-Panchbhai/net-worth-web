import { useEffect, useMemo, useState } from "react";
import { Paper, Typography, Box } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import { getHoldings } from "../../api/client";
import type { AccountSummary, HoldingSummary, SummaryMetrics } from "../../api/types";
import MoneyTreemap, { type TreemapNode } from "../../components/MoneyTreemap";
import type { InsightsData } from "../useInsightsData";

function dayPct(m: SummaryMetrics): number | null {
  return m.previousDayValue > 0 ? m.dayChange / m.previousDayValue : null;
}

/** Net worth as a heat map: accounts sized by value, colored by today's move; click to see holdings. */
export default function TreemapWidget({ data }: { data: InsightsData }) {
  const { preferredCurrency, dataVersion } = useUser();
  const navigate = useNavigate();
  const [holdings, setHoldings] = useState<Record<number, HoldingSummary[]>>({});

  const accounts = useMemo(() => data.accounts.filter(a => a.isActive && a.currentDayValue > 0), [data.accounts]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(accounts.map(a => getHoldings(a.id).then(h => [a.id, h] as const).catch(() => [a.id, [] as HoldingSummary[]] as const)))
      .then(entries => { if (!cancelled) setHoldings(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [accounts, dataVersion]);

  const nodes = useMemo<TreemapNode[]>(() => accounts.map((a: AccountSummary) => {
    const children = (holdings[a.id] ?? []).filter(h => h.currentDayValue > 0).map<TreemapNode>(h => ({
      id: `h${h.id}`, name: h.name, value: h.currentDayValue, change: h.dayChange, changePct: dayPct(h),
      onClick: () => navigate(`/accounts/${a.id}/holdings/${h.id}`),
    }));
    return {
      id: `a${a.id}`, name: a.name, value: a.currentDayValue, change: a.dayChange, changePct: dayPct(a),
      children: children.length ? children : undefined,
      onClick: () => navigate(`/accounts/${a.id}`),
    };
  }), [accounts, holdings, navigate]);

  const currency = data.allWatchlist?.displayCurrency ?? preferredCurrency;

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, height: "100%" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: "0.95rem" }}>Money Map</Typography>
        <Typography variant="caption" color="text.secondary">Size = value · Color = today</Typography>
      </Box>
      <MoneyTreemap nodes={nodes} currency={currency} saturateAt={0.03} changeLabel="Today" />
    </Paper>
  );
}
