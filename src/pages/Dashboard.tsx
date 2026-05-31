import { useEffect, useState, useCallback } from "react";
import {
  Avatar, Box, Paper, Typography, Skeleton,
  ToggleButtonGroup, ToggleButton, Stack,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import NetWorthChart from "../components/NetWorthChart";
import XirrBadge from "../components/XirrBadge";
import { ChartSkeleton, ErrorState, EmptyState, FadeIn } from "../components/shared";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import { getWatchlists, getChartData, getIncomes, getAccounts, getTransactions } from "../api/client";
import { useUser } from "../context/UserContext";
import { computeXirr } from "../utils/xirr";
import type { WatchlistSummary, ChartDataPoint, TimePeriod, Income, Transaction } from "../api/types";

const TIME_PERIODS: TimePeriod[] = ["1M", "3M", "6M", "1Y", "2Y", "5Y", "ALL"];

function fmt(v: number): string {
  const hasDecimals = v % 1 !== 0;
  const abs = Math.abs(v);
  const formatted = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: hasDecimals ? 2 : 0 }).format(abs);
  return v < 0 ? `-${formatted}` : formatted;
}

function Dashboard() {
  const { userId, loading: userLoading } = useUser();
  const theme = useTheme();
  const { colors } = useTokens();
  const { showToast } = useToast();
  const [watchlist, setWatchlist] = useState<WatchlistSummary | null>(null);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("1Y");
  const [xirr, setXirr] = useState<number | null>(null);
  const [xirrLoading, setXirrLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartKey, setChartKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Initial page load — fetch watchlist + incomes + default chart
  const loadDashboard = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true); setError(null);
      const [watchlists, inc] = await Promise.all([getWatchlists(userId), getIncomes(userId)]);
      const wl = watchlists.find((w) => w.name === "All") ?? watchlists[0];
      if (!wl) { showToast("No watchlists found", "error"); setLoading(false); return; }
      setWatchlist(wl);
      setIncomes(inc);
      setChartData(await getChartData("watchlist", wl.id, timePeriod));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally { setLoading(false); }
  }, [userId]);

  // Chart-only reload when period changes (skip initial mount)
  const loadChart = useCallback(async () => {
    if (!watchlist) return;
    try {
      setChartLoading(true);
      const data = await getChartData("watchlist", watchlist.id, timePeriod);
      setChartData(data);
      setChartKey((k) => k + 1);
    } catch {
      showToast("Failed to load chart data", "error");
    } finally { setChartLoading(false); }
  }, [watchlist, timePeriod]);

  useEffect(() => { if (!userLoading) loadDashboard(); }, [loadDashboard, userLoading]);
  useEffect(() => { if (watchlist) loadChart(); }, [timePeriod]);

  // Compute XIRR across all XIRR-eligible accounts of the user
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setXirrLoading(true);
    (async () => {
      try {
        const accounts = await getAccounts(userId);
        const eligible = accounts.filter(a => a.type === "BROKER" || a.needsDailyData);
        if (eligible.length === 0) { if (!cancelled) setXirrLoading(false); return; }
        const txnsPerAcct = await Promise.all(
          eligible.map(async a => ({ a, txns: await getTransactions({ accountId: a.id }).catch(() => [] as Transaction[]) }))
        );
        if (cancelled) return;
        const allTxns: Transaction[] = [];
        let totalCurrent = 0;
        for (const { a, txns } of txnsPerAcct) {
          if (txns.length > 0) { allTxns.push(...txns); totalCurrent += a.currentDayValue; }
        }
        setXirr(allTxns.length > 0 ? computeXirr(allTxns, totalCurrent) : null);
      } catch { /* silent */ }
      finally { if (!cancelled) setXirrLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (error && !watchlist) return <ErrorState message={error} onRetry={loadDashboard} />;

  const dayChange = watchlist ? watchlist.currentDayValue - watchlist.previousDayValue : 0;
  const dayPct = watchlist && watchlist.previousDayValue > 0 ? (dayChange / watchlist.previousDayValue) * 100 : 0;
  const totalGain = watchlist ? watchlist.currentDayValue - watchlist.invested : 0;
  const gainPct = watchlist && watchlist.invested > 0 ? (totalGain / watchlist.invested) * 100 : 0;

  // Build cumulative income by date for savings rate on chart
  const enrichedChartData = (() => {
    if (incomes.length === 0) return chartData;
    const sorted = [...incomes].sort((a, b) => a.creditedDate.localeCompare(b.creditedDate));
    return chartData.map((pt) => {
      const cumIncome = sorted
        .filter((i) => i.creditedDate <= pt.date)
        .reduce((s, i) => s + i.netAmount, 0);
      return { ...pt, savingsRate: cumIncome > 0 ? (pt.value / cumIncome) * 100 : null };
    });
  })();

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
      {/* ── Hero Card ── */}
      {loading || xirrLoading ? (
        <Paper sx={{ p: { xs: 3, sm: 4 }, borderRadius: 4 }}>
          <Skeleton width={100} height={16} sx={{ mb: 1 }} />
          <Skeleton width={220} height={48} sx={{ mb: 2 }} />
          <Skeleton width={180} height={28} />
        </Paper>
      ) : watchlist && (
        <FadeIn>
          {(() => {
            const isDark = theme.palette.mode === "dark";
            const heroBg = isDark ? colors.white : colors.pureWhite;
            const heroText = isDark ? colors.pureWhite : colors.gray900;
            const heroMuted = isDark ? alpha(colors.pureWhite, 0.5) : colors.gray400;
            const heroSubtle = isDark ? alpha(colors.pureWhite, 0.08) : colors.gray100;
            const heroInvested = isDark ? "#60A5FA" : colors.brand;
            const heroSuccess = isDark ? "#34D399" : colors.success;
            const heroError = isDark ? "#F87171" : colors.error;
            return (
            <Paper sx={{
              p: { xs: 2.5, sm: 3 }, borderRadius: 3,
              bgcolor: heroBg,
              border: "none", borderLeft: `4px solid ${colors.brand}`,
              boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.3)" : "0 4px 20px rgba(0,0,0,0.08)",
            }}>
              {/* Header */}
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(colors.brand, 0.1), color: colors.brand, borderRadius: 1.5 }}>
                  <AccountBalanceWalletRoundedIcon sx={{ fontSize: 18 }} />
                </Avatar>
                <Typography sx={{ fontSize: "0.85rem", fontWeight: 600, color: heroMuted }}>
                  Net Worth
                </Typography>
                <Box sx={{ flex: 1 }} />
                <XirrBadge value={xirr} size="lg" />
              </Stack>

              {/* Total value */}
              <Box sx={{ px: 2, py: 1.5, borderRadius: 2, bgcolor: heroSubtle, display: "inline-block" }}>
                <Typography sx={{ fontSize: "0.7rem", fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
                  Total Value
                </Typography>
                <Typography sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem" }, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, color: heroText }}>
                  {fmt(watchlist.currentDayValue)}
                </Typography>
              </Box>

              {/* Metrics row */}
              <Stack direction="row" sx={{ mt: 2.5, gap: { xs: 1, sm: 2 }, flexWrap: "wrap" }}>
                <Box sx={{ flex: "1 1 auto", minWidth: { xs: "calc(50% - 8px)", sm: 120 }, p: 1.5, borderRadius: 2, bgcolor: alpha(heroInvested, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
                  <Typography sx={{ fontSize: "0.65rem", fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.5 }}>
                    Invested
                  </Typography>
                  <Typography noWrap sx={{ fontSize: { xs: "0.8rem", sm: "0.95rem" }, fontWeight: 700, color: heroInvested }}>
                    {fmt(watchlist.invested)}
                  </Typography>
                </Box>
                {watchlist.invested > 0 && (
                  <Box sx={{ flex: "1 1 auto", minWidth: { xs: "calc(50% - 8px)", sm: 120 }, p: 1.5, borderRadius: 2, bgcolor: alpha(totalGain >= 0 ? heroSuccess : heroError, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
                    <Typography sx={{ fontSize: "0.65rem", fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.5 }}>
                      Total P&L
                    </Typography>
                    <Typography noWrap sx={{ fontSize: { xs: "0.8rem", sm: "0.95rem" }, fontWeight: 700, color: totalGain >= 0 ? heroSuccess : heroError }}>
                      {totalGain >= 0 ? "+" : ""}{fmt(totalGain)}
                    </Typography>
                    <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, color: totalGain >= 0 ? heroSuccess : heroError, opacity: 0.8 }}>
                      {gainPct >= 0 ? "+" : ""}{gainPct.toFixed(2)}%
                    </Typography>
                  </Box>
                )}
                <Box sx={{ flex: "1 1 auto", minWidth: { xs: "calc(50% - 8px)", sm: 120 }, p: 1.5, borderRadius: 2, bgcolor: alpha(dayChange >= 0 ? heroSuccess : heroError, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
                  <Typography sx={{ fontSize: "0.65rem", fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.5 }}>
                    Today
                  </Typography>
                  <Typography noWrap sx={{ fontSize: { xs: "0.8rem", sm: "0.95rem" }, fontWeight: 700, color: dayChange >= 0 ? heroSuccess : heroError }}>
                    {dayChange >= 0 ? "+" : ""}{fmt(dayChange)}
                  </Typography>
                  <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, color: dayChange >= 0 ? heroSuccess : heroError, opacity: 0.8 }}>
                    {dayPct >= 0 ? "+" : ""}{dayPct.toFixed(2)}%
                  </Typography>
                </Box>
              </Stack>
            </Paper>
            );
          })()}
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
                sx={{ flexWrap: "wrap", gap: 0.5 }}
              >
                {TIME_PERIODS.map((tp) => (
                  <ToggleButton key={tp} value={tp} sx={{ px: { xs: 1.2, sm: 1.5 }, fontSize: { xs: "0.7rem", sm: "0.8rem" } }}>{tp}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            {enrichedChartData.length > 0 ? (
              <Box sx={{ mx: { xs: -1, sm: 0 }, opacity: chartLoading ? 0.4 : 1, transition: "opacity 0.3s ease" }}>
                <NetWorthChart key={chartKey} data={enrichedChartData} />
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
