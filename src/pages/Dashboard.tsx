import { useEffect, useState, useCallback } from "react";
import {
  Box, Paper, Typography, Grid2 as Grid, Alert,
  ToggleButtonGroup, ToggleButton, Stack, LinearProgress,
} from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";
import NetWorthChart from "../components/NetWorthChart";
import { MetricCard, MetricSkeleton, ChartSkeleton, TintedChip, ErrorState, EmptyState, FadeIn } from "../components/shared";
import { tokens } from "../theme";
import { getWatchlists, getChartData } from "../api/client";
import { useUser } from "../context/UserContext";
import type { WatchlistSummary, ChartDataPoint, TimePeriod } from "../api/types";

const TIME_PERIODS: TimePeriod[] = ["1M", "3M", "6M", "1Y", "2Y", "5Y", "ALL"];
const { colors } = tokens;

function fmt(v: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);
}

function Dashboard() {
  const { userId, loading: userLoading } = useUser();
  const [watchlist, setWatchlist] = useState<WatchlistSummary | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("1Y");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      setError(null);
      const watchlists = await getWatchlists(userId);
      const wl = watchlists.find((w) => w.name === "All") ?? watchlists[0];
      if (!wl) { setError("No watchlists found."); setLoading(false); return; }
      setWatchlist(wl);
      setChartData(await getChartData("watchlist", wl.id, timePeriod));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [userId, timePeriod]);

  useEffect(() => { if (!userLoading) loadDashboard(); }, [loadDashboard, userLoading]);

  if (error && !watchlist) {
    return <ErrorState message={error} onRetry={loadDashboard} />;
  }

  const dayChange = watchlist ? watchlist.currentDayValue - watchlist.previousDayValue : 0;
  const totalGain = watchlist ? watchlist.currentDayValue - watchlist.invested : 0;
  const gainPct = watchlist && watchlist.invested > 0 ? (totalGain / watchlist.invested) * 100 : 0;

  return (
    <Stack spacing={{ xs: 2, sm: 3 }}>
      {error && <Alert severity="warning" onClose={() => setError(null)}>{error}</Alert>}

      {/* Metrics */}
      <Grid container spacing={{ xs: 1.5, sm: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          {loading ? <MetricSkeleton /> : (
            <FadeIn>
              <MetricCard
                label="Current Value"
                value={watchlist ? fmt(watchlist.currentDayValue) : "—"}
                footer={watchlist && dayChange !== 0 ? (
                  <TintedChip
                    label={`${dayChange > 0 ? "+" : ""}${fmt(dayChange)} today`}
                    color={dayChange > 0 ? colors.success : colors.error}
                    icon={dayChange > 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                  />
                ) : undefined}
              />
            </FadeIn>
          )}
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 4 }}>
          {loading ? <MetricSkeleton /> : (
            <FadeIn delay={50}>
              <MetricCard label="Total Invested" value={watchlist ? fmt(watchlist.invested) : "—"} />
            </FadeIn>
          )}
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 4 }}>
          {loading ? <MetricSkeleton /> : (
            <FadeIn delay={100}>
              <MetricCard
                label="Total Gain / Loss"
                value={watchlist ? `${totalGain >= 0 ? "+" : ""}${fmt(totalGain)}` : "—"}
                accent={totalGain >= 0 ? colors.success : colors.error}
                footer={watchlist && watchlist.invested > 0 ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <TintedChip
                      label={`${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(2)}%`}
                      color={totalGain >= 0 ? colors.success : colors.error}
                    />
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(Math.abs(gainPct), 100)}
                      color={totalGain >= 0 ? "success" : "error"}
                      sx={{ flex: 1 }}
                    />
                  </Box>
                ) : undefined}
              />
            </FadeIn>
          )}
        </Grid>
      </Grid>

      {/* Chart */}
      {loading ? <ChartSkeleton /> : (
        <FadeIn delay={150}>
          <Paper sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              mb: 2, flexWrap: "wrap", gap: 1,
            }}>
              <Typography variant="subtitle1">Portfolio Over Time</Typography>
              <ToggleButtonGroup
                value={timePeriod}
                exclusive
                onChange={(_e, val) => val && setTimePeriod(val)}
                size="small"
              >
                {TIME_PERIODS.map((tp) => (
                  <ToggleButton key={tp} value={tp}>{tp}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            {chartData.length > 0 ? (
              <Box sx={{ mx: { xs: -1, sm: 0 } }}>
                <NetWorthChart data={chartData} />
              </Box>
            ) : (
              <EmptyState
                icon={<ShowChartOutlinedIcon />}
                title="No chart data"
                description="No data available for the selected time period."
              />
            )}
          </Paper>
        </FadeIn>
      )}
    </Stack>
  );
}

export default Dashboard;
