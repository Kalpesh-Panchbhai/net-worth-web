import { Paper, Typography } from "@mui/material";
import { useUser } from "../../context/UserContext";
import { useTokens } from "../../context/ColorModeContext";
import EntityChart from "../../components/EntityChart";
import type { PerformanceConfig } from "../types";
import type { InsightsData } from "../useInsightsData";

export default function PerformanceWidget({ config, data }: { config: PerformanceConfig; data: InsightsData }) {
  const { preferredCurrency } = useUser();
  const { colors } = useTokens();

  // entityId 0 on a watchlist means "the All watchlist" (net worth) — resolve it from shared data.
  const entityId = config.entityType === "watchlist" && config.entityId === 0
    ? (data.allWatchlist?.id ?? 0)
    : config.entityId;

  const currency = config.entityType === "watchlist"
    ? (data.watchlists.find(w => w.id === entityId)?.displayCurrency ?? preferredCurrency)
    : config.entityType === "account"
      ? (data.accounts.find(a => a.id === entityId)?.displayCurrency ?? preferredCurrency)
      : preferredCurrency;

  if (!entityId) {
    return (
      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Typography color="text.secondary" sx={{ fontSize: "0.85rem" }}>No entity selected for this chart.</Typography>
      </Paper>
    );
  }

  return (
    <EntityChart
      entityType={config.entityType}
      entityId={entityId}
      accentColor={colors.brand}
      currency={currency}
      showInvested
    />
  );
}
