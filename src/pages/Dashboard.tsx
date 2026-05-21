import { useEffect, useState, useCallback } from "react";
import {
  Box, Paper, Typography, Alert, Skeleton,
  ToggleButtonGroup, ToggleButton, Stack,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";
import NetWorthChart from "../components/NetWorthChart";
import { ChartSkeleton, TintedChip, ErrorState, EmptyState, FadeIn } from "../components/shared";
import { tokens } from "../theme";
import { getWatchlists, getChartData } from "../api/client";
import { useUser } from "../context/UserContext";
import type { WatchlistSummary, ChartDataPoint, TimePeriod } from "../api/types";

const TIME_PERIODS: TimePeriod[] = ["1M", "3M", "6M", "1Y", "2Y", "5Y", "ALL"];
const { colors, gradients } = tokens;

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
      setLoading(true); setError(null);
      const watchlists = await getWatchlists(userId);
      const wl = watchlists.find((w) => w.name === "All") ?? watchlists[0];
      if (!wl) { setError("No watchlists found."); setLoading(false); return; }
      setWatchlist(wl);
      setChartData(await getChartData("watchlist", wl.id, timePeriod));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally { setLoading(false); }
  }, [userId, timePeriod]);

  useEffect(() => { if (!userLoading) loadDashboard(); }, [loadDashboard, userLoading]);

  if (error && !watchlist) return <ErrorState message={error} onRetry={loadDashboard} />;

  const dayChange = watchlist ? watchlist.currentDayValue - watchlist.previousDayValue : 0;
  const dayPct = watchlist && watchlist.previousDayValue > 0 ? (dayChange / watchlist.previousDayValue) * 100 : 0;
  const totalGain = watchlist ? watchlist.currentDayValue - watchlist.invested : 0;
  const gainPct = watchlist && watchlist.invested > 0 ? (totalGain / watchlist.invested) * 100 : 0;

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
      {error && <Alert severity="warning" onClose={() => setError(null)}>{error}</Alert>}

      {/* ── Hero Card ── */}
      {loading ? (
        <Paper sx={{ p: { xs: 3, sm: 4 }, borderRadius: 4 }}>
          <Skeleton width={100} height={16} sx={{ mb: 1 }} />
          <Skeleton width={220} height={48} sx={{ mb: 2 }} />
          <Skeleton width={180} height={28} />
        </Paper>
      ) : watchlist && (
        <FadeIn>
          <Paper sx={{
            p: { xs: 3, sm: 4 },
            background: gradients.hero,
            color: colors.white,
            borderRadius: 4,
            border: "none",
            position: "relative",
            overflow: "hidden",
            boxShadow: `0 8px 32px ${alpha(colors.brand, 0.3)}`,
          }}>
            {/* Decorative circles */}
            <Box sx={{
              position: "absolute", top: -60, right: -60,
              width: 200, height: 200, borderRadius: "50%",
              bgcolor: alpha(colors.white, 0.06),
            }} />
            <Box sx={{
              position: "absolute", bottom: -40, right: 60,
              width: 120, height: 120, borderRadius: "50%",
              bgcolor: alpha(colors.white, 0.04),
            }} />

            <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.75, mb: 0.5 }}>
              Net Worth
            </Typography>
            <Typography sx={{ fontSize: { xs: "2rem", sm: "2.75rem" }, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, mb: 1.5 }}>
              {fmt(watchlist.currentDayValue)}
            </Typography>
            <Stack direction="row" spacing={1.5} flexWrap="wrap" sx={{ position: "relative", zIndex: 1 }}>
              <Box sx={{
                display: "inline-flex", alignItems: "center", gap: 0.5,
                px: 1.5, py: 0.5, borderRadius: 2,
                bgcolor: alpha(colors.white, dayChange >= 0 ? 0.15 : 0.12),
                fontSize: "0.8rem", fontWeight: 600,
              }}>
                {dayChange >= 0 ? <TrendingUpIcon sx={{ fontSize: 16 }} /> : <TrendingDownIcon sx={{ fontSize: 16 }} />}
                {dayChange >= 0 ? "+" : ""}{fmt(dayChange)} ({dayPct >= 0 ? "+" : ""}{dayPct.toFixed(2)}%) today
              </Box>
              <Box sx={{
                display: "inline-flex", alignItems: "center", gap: 0.5,
                px: 1.5, py: 0.5, borderRadius: 2,
                bgcolor: alpha(colors.white, 0.1),
                fontSize: "0.8rem", fontWeight: 600,
              }}>
                {gainPct >= 0 ? "+" : ""}{gainPct.toFixed(2)}% all time
              </Box>
            </Stack>
          </Paper>
        </FadeIn>
      )}

      {/* ── Metrics row ── */}
      {!loading && watchlist && (
        <FadeIn delay={80}>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <Paper sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3 }}>
              <Typography variant="overline" sx={{ color: colors.gray400 }}>Invested</Typography>
              <Typography sx={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em", mt: 0.25 }}>
                {fmt(watchlist.invested)}
              </Typography>
            </Paper>
            <Paper sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3 }}>
              <Typography variant="overline" sx={{ color: colors.gray400 }}>Total Gain</Typography>
              <Typography sx={{
                fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em", mt: 0.25,
                color: totalGain >= 0 ? colors.success : colors.error,
              }}>
                {totalGain >= 0 ? "+" : ""}{fmt(totalGain)}
              </Typography>
              <TintedChip
                label={`${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(2)}%`}
                color={totalGain >= 0 ? colors.success : colors.error}
                size="small"
              />
            </Paper>
          </Box>
        </FadeIn>
      )}

      {/* ── Chart ── */}
      {loading ? <ChartSkeleton /> : (
        <FadeIn delay={150}>
          <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Box sx={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              mb: 2, flexWrap: "wrap", gap: 1,
            }}>
              <Typography variant="subtitle1">Portfolio Over Time</Typography>
              <ToggleButtonGroup
                value={timePeriod} exclusive
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
