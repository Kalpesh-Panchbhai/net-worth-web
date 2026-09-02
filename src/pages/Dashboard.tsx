import { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
import { getWatchlists, getChartData, getIncomes } from "../api/client";
import { useUser } from "../context/UserContext";
import type { WatchlistSummary, ChartDataPoint, TimePeriod, Income } from "../api/types";
import { formatCurrency as fmt } from "../utils/format";

const TIME_PERIODS: TimePeriod[] = ["1M", "3M", "6M", "1Y", "2Y", "5Y", "ALL"];

function Dashboard() {
  const { userId, loading: userLoading, preferredCurrency, dataVersion } = useUser();
  const theme = useTheme();
  const { colors } = useTokens();
  const { showToast } = useToast();
  const [watchlist, setWatchlist] = useState<WatchlistSummary | null>(null);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("1Y");
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The two loads below each read one value they must not re-run for: the page load fetches the
  // chart for whichever period is selected, and the period change reloads the chart for the
  // already-loaded watchlist. Reading them through refs keeps the dependency arrays honest without
  // either effect re-firing on the other's input.
  const timePeriodRef = useRef(timePeriod);
  timePeriodRef.current = timePeriod;
  const watchlistRef = useRef(watchlist);
  watchlistRef.current = watchlist;

  // Initial page load — watchlist + incomes in parallel, then the chart. The chart needs wl.id so
  // it can only follow, but it is awaited here rather than in an effect keyed on the freshly-set
  // `watchlist` state, which would cost a render round-trip before the request even starts.
  // dataVersion: a display-currency change or a refresh restates every amount on this page.
  const chartSeqRef = useRef(0);

  const loadDashboard = useCallback(async (cancelled: () => boolean = () => false) => {
    if (!userId) return;
    try {
      setLoading(true); setError(null);
      const [watchlists, inc] = await Promise.all([getWatchlists(userId), getIncomes(userId)]);
      if (cancelled()) return;
      const wl = watchlists.find((w) => w.name === "All") ?? watchlists[0];
      if (!wl) { showToast("No watchlists found", "error"); setLoading(false); return; }
      setWatchlist(wl);
      setIncomes(inc);
      const seq = ++chartSeqRef.current;
      const data = await getChartData("watchlist", wl.id, timePeriodRef.current);
      if (cancelled() || seq !== chartSeqRef.current) return;
      setChartData(data);
    } catch (err) {
      if (cancelled()) return;
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally { if (!cancelled()) setLoading(false); }
  }, [userId, dataVersion, showToast]);

  useEffect(() => {
    if (userLoading) return;
    let cancelled = false;
    loadDashboard(() => cancelled);
    return () => { cancelled = true; };
  }, [loadDashboard, userLoading]);

  // Chart-only reload when the period changes (no-op on mount, before the watchlist is known)
  useEffect(() => {
    const wl = watchlistRef.current;
    if (!wl) return;
    let cancelled = false;
    (async () => {
      try {
        setChartLoading(true);
        // Both this effect and loadDashboard write chartData, and neither cancels the other.
        // The sequence token makes the most recently *started* request the only one allowed to
        // paint, so an older period's response can never land last.
        const seq = ++chartSeqRef.current;
        const data = await getChartData("watchlist", wl.id, timePeriod);
        if (!cancelled && seq === chartSeqRef.current) setChartData(data);
      } catch {
        if (!cancelled) showToast("Failed to load chart data", "error");
      } finally { if (!cancelled) setChartLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [timePeriod, showToast]);

  // Cumulative income at each chart date, for the savings-rate series. Chart points arrive
  // date-ascending, so one walking index over the date-sorted incomes replaces re-filtering and
  // re-reducing the whole income list per point. The chart values are in displayCurrency, so the
  // income side has to be the converted amount — pairing it with the native one understates or
  // inflates the rate by the whole FX rate.
  const enrichedChartData = useMemo(() => {
    if (incomes.length === 0) return chartData;
    // Only income rows converted into the SAME currency as the chart belong in the denominator.
    // A row whose FX lookup failed keeps its native amount, and including it would make the
    // ratio a cross-currency quotient.
    const seriesCurrency = chartData[0]?.displayCurrency;
    const sorted = incomes
      .filter(i => i.convertedCurrency === seriesCurrency)
      .sort((a, b) => a.creditedDate.localeCompare(b.creditedDate));
    if (sorted.length === 0) return chartData;
    let next = 0;
    let cumIncome = 0;
    return chartData.map((pt) => {
      while (next < sorted.length && sorted[next].creditedDate <= pt.date) {
        cumIncome += sorted[next].convertedNetAmount;
        next++;
      }
      return { ...pt, savingsRate: cumIncome > 0 ? (pt.value / cumIncome) * 100 : null };
    });
  }, [chartData, incomes]);

  if (error && !watchlist) return <ErrorState message={error} onRetry={() => loadDashboard()} />;

  const totalGain = watchlist?.gain ?? 0;
  const dayChange = watchlist?.dayChange ?? 0;
  const dayPct = watchlist && watchlist.previousDayValue > 0 ? (dayChange / watchlist.previousDayValue) * 100 : 0;
  const gainPct = watchlist && watchlist.invested > 0 ? (totalGain / watchlist.invested) * 100 : 0;

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
      {/* ── Hero Card ── */}
      {loading ? (
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
            // Every amount in this card is one of the watchlist's converted totals, so they all
            // carry the same label — including P&L and Today, which used to show the preferred
            // currency even when the backend had fallen back to a native one.
            const heroCurrency = watchlist.displayCurrency;
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
                <XirrBadge value={watchlist.xirr} size="lg" />
              </Stack>

              {/* Total value */}
              <Box sx={{ px: 2, py: 1.5, borderRadius: 2, bgcolor: heroSubtle, display: "inline-block" }}>
                <Typography sx={{ fontSize: "0.7rem", fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
                  Total Value
                </Typography>
                <Typography sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem" }, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, color: heroText }}>
                  {fmt(watchlist.currentDayValue, heroCurrency)}
                </Typography>
              </Box>

              {/* Metrics row */}
              <Stack direction="row" sx={{ mt: 2, gap: { xs: 0.75, sm: 2 }, flexWrap: "wrap" }}>
                <Box sx={{ flex: "1 1 auto", minWidth: { xs: "calc(50% - 6px)", sm: 120 }, p: { xs: 1, sm: 1.5 }, borderRadius: 2, bgcolor: alpha(heroInvested, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
                  <Typography sx={{ fontSize: { xs: "0.6rem", sm: "0.65rem" }, fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
                    Invested
                  </Typography>
                  <Typography noWrap sx={{ fontSize: { xs: "0.75rem", sm: "0.95rem" }, fontWeight: 700, color: heroInvested }}>
                    {fmt(watchlist.invested, heroCurrency)}
                  </Typography>
                </Box>
                {watchlist.invested > 0 && (
                  <Box sx={{ flex: "1 1 auto", minWidth: { xs: "calc(50% - 6px)", sm: 120 }, p: { xs: 1, sm: 1.5 }, borderRadius: 2, bgcolor: alpha(totalGain >= 0 ? heroSuccess : heroError, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
                    <Typography sx={{ fontSize: { xs: "0.6rem", sm: "0.65rem" }, fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
                      Total P&L
                    </Typography>
                    <Typography noWrap sx={{ fontSize: { xs: "0.75rem", sm: "0.95rem" }, fontWeight: 700, color: totalGain >= 0 ? heroSuccess : heroError }}>
                      {totalGain >= 0 ? "+" : ""}{fmt(totalGain, heroCurrency)}
                    </Typography>
                    <Typography sx={{ fontSize: { xs: "0.6rem", sm: "0.65rem" }, fontWeight: 600, color: totalGain >= 0 ? heroSuccess : heroError, opacity: 0.8 }}>
                      {gainPct >= 0 ? "+" : ""}{gainPct.toFixed(2)}%
                    </Typography>
                  </Box>
                )}
                <Box sx={{ flex: "1 1 auto", minWidth: { xs: "calc(50% - 6px)", sm: 120 }, p: { xs: 1, sm: 1.5 }, borderRadius: 2, bgcolor: alpha(dayChange >= 0 ? heroSuccess : heroError, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
                  <Typography sx={{ fontSize: { xs: "0.6rem", sm: "0.65rem" }, fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
                    Today
                  </Typography>
                  <Typography noWrap sx={{ fontSize: { xs: "0.75rem", sm: "0.95rem" }, fontWeight: 700, color: dayChange >= 0 ? heroSuccess : heroError }}>
                    {dayChange >= 0 ? "+" : ""}{fmt(dayChange, heroCurrency)}
                  </Typography>
                  <Typography sx={{ fontSize: { xs: "0.6rem", sm: "0.65rem" }, fontWeight: 600, color: dayChange >= 0 ? heroSuccess : heroError, opacity: 0.8 }}>
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
                sx={{ flexWrap: "wrap", gap: 0.25 }}
              >
                {TIME_PERIODS.map((tp) => (
                  <ToggleButton key={tp} value={tp} sx={{ px: { xs: 0.8, sm: 1.5 }, py: { xs: 0.25, sm: 0.5 }, fontSize: { xs: "0.65rem", sm: "0.8rem" }, minWidth: { xs: 32, sm: "auto" } }}>{tp}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            {enrichedChartData.length > 0 ? (
              <Box sx={{ mx: { xs: -1, sm: 0 }, opacity: chartLoading ? 0.4 : 1, transition: "opacity 0.3s ease" }}>
                <NetWorthChart data={enrichedChartData} currency={preferredCurrency} />
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
