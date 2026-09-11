import { useEffect, useMemo, useState } from "react";
import { Box, Paper, Typography, ToggleButton, ToggleButtonGroup, CircularProgress, useTheme, useMediaQuery } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useUser } from "../../context/UserContext";
import { useTokens } from "../../context/ColorModeContext";
import { getChartData } from "../../api/client";
import NetWorthChart from "../../components/NetWorthChart";
import type { ChartDataPoint, TimePeriod } from "../../api/types";
import type { InsightsData } from "../useInsightsData";

const PERIODS: TimePeriod[] = ["1M", "3M", "6M", "1Y", "2Y", "5Y", "ALL"];

/**
 * Net worth over time with Value, Invested and the savings-rate (Saved %) overlay — the chart that
 * used to live on the dashboard. Saved % is cumulative net income vs. portfolio value, so it only
 * applies to total net worth (the "All" watchlist).
 */
export default function NetWorthWidget({ data }: { data: InsightsData }) {
  const { preferredCurrency, dataVersion } = useUser();
  const { colors } = useTokens();
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("sm"));
  const [period, setPeriod] = useState<TimePeriod>("1Y");
  const [chart, setChart] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const allId = data.allWatchlist?.id;

  useEffect(() => {
    if (!allId) return;
    let cancelled = false;
    (async () => {
      try { setLoading(true); const d = await getChartData("watchlist", allId, period); if (!cancelled) setChart(d); }
      catch { if (!cancelled) setChart([]); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [allId, period, dataVersion]);

  // Cumulative net income at each chart date → savings rate = value / cumulative income.
  const enriched = useMemo(() => {
    if (data.incomes.length === 0 || chart.length === 0) return chart;
    const seriesCurrency = chart[0]?.displayCurrency;
    const sorted = data.incomes
      .filter(i => i.convertedCurrency === seriesCurrency)
      .sort((a, b) => a.creditedDate.localeCompare(b.creditedDate));
    if (sorted.length === 0) return chart;
    let next = 0, cum = 0;
    return chart.map(pt => {
      while (next < sorted.length && sorted[next].creditedDate <= pt.date) { cum += sorted[next].convertedNetAmount; next++; }
      return { ...pt, savingsRate: cum > 0 ? (pt.value / cum) * 100 : null };
    });
  }, [chart, data.incomes]);

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, height: "100%" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: "0.95rem" }}>Net Worth</Typography>
        <ToggleButtonGroup
          value={period} exclusive size="small"
          onChange={(_e, v) => { if (v) setPeriod(v); }}
          sx={{
            flexWrap: "wrap", gap: 0.25,
            "& .MuiToggleButton-root": {
              px: { xs: 0.8, sm: 1.5 }, py: { xs: 0.25, sm: 0.3 }, fontSize: { xs: "0.62rem", sm: "0.7rem" }, fontWeight: 700,
              border: `1px solid ${colors.gray200}`, color: colors.gray500,
              "&.Mui-selected": { bgcolor: alpha(colors.brand, 0.1), color: colors.brand, borderColor: alpha(colors.brand, 0.3), "&:hover": { bgcolor: alpha(colors.brand, 0.15) } },
            },
          }}
        >
          {PERIODS.map(p => <ToggleButton key={p} value={p}>{p}</ToggleButton>)}
        </ToggleButtonGroup>
      </Box>
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: compact ? 240 : 340 }}>
          <CircularProgress size={26} sx={{ color: colors.brand }} />
        </Box>
      ) : enriched.length > 0 ? (
        <Box sx={{ mx: { xs: -1, sm: 0 } }}>
          <NetWorthChart data={enriched} currency={preferredCurrency} />
        </Box>
      ) : (
        <Typography color="text.secondary" sx={{ fontSize: "0.85rem" }}>No data available for this period.</Typography>
      )}
    </Paper>
  );
}
