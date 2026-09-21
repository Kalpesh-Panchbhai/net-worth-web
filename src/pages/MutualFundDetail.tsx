import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, Stack, Chip, IconButton, Tooltip, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Cell, ReferenceLine } from "recharts";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { getMfFund } from "../api/client";
import type { MfFundDetail } from "../api/types";
import { ErrorState, ChartSkeleton } from "../components/shared";
import { useTokens } from "../context/ColorModeContext";
import { formatMetricValue, assetClassLabel } from "../utils/mfMetrics";

const CAGR_HORIZONS = ["1Y", "3Y", "5Y", "7Y", "10Y", "SI"];

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function MutualFundDetail() {
  const { schemeCode } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const { colors, shadow } = useTokens();
  const isDark = theme.palette.mode === "dark";

  const [detail, setDetail] = useState<MfFundDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = Number(schemeCode);
    if (!Number.isFinite(code)) { setError("Invalid fund"); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError(null);
        const data = await getMfFund(code);
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load fund");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [schemeCode]);

  const val = (horizon: string, metric: string): number | undefined =>
    detail?.metrics.find(m => m.horizon === horizon && m.metric === metric)?.value;

  const cagrData = useMemo(() => {
    if (!detail) return [];
    return CAGR_HORIZONS
      .map(h => ({ horizon: h === "SI" ? "Incep." : h, pct: val(h, "cagr") }))
      .filter((d): d is { horizon: string; pct: number } => d.pct != null)
      .map(d => ({ horizon: d.horizon, pct: +(d.pct * 100).toFixed(2) }));
  }, [detail]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <Stack spacing={2}>
        <Box sx={{ height: 40 }} />
        <ChartSkeleton />
        <ChartSkeleton />
      </Stack>
    );
  }
  if (error || !detail) return <ErrorState message={error ?? "Fund not found"} onRetry={() => navigate("/mutual-funds")} />;

  const StatTile = ({ label, metric, horizon, help }: { label: string; metric: string; horizon: string; help?: string }) => {
    const v = val(horizon, metric);
    const signed = metric !== "volatility" && metric !== "rolling_windows" && metric !== "rolling_share_negative";
    const color = v == null ? colors.gray400 : !signed ? colors.gray800 : v >= 0 ? colors.success : colors.error;
    const tile = (
      <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${colors.gray200}`, bgcolor: isDark ? alpha(colors.pureWhite, 0.02) : colors.gray50, height: "100%" }}>
        <Typography sx={{ fontSize: "0.62rem", fontWeight: 600, color: colors.gray400, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</Typography>
        <Typography sx={{ fontSize: "1.15rem", fontWeight: 750, color, mt: 0.25, fontVariantNumeric: "tabular-nums" }}>
          {v == null ? "—" : formatMetricValue(metric, v)}
        </Typography>
      </Box>
    );
    return help ? <Tooltip title={help} placement="top">{tile}</Tooltip> : tile;
  };

  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <Paper sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Typography variant="subtitle1" sx={{ mb: 1.5 }}>{title}</Typography>
      {children}
    </Paper>
  );

  const grid3 = { display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" }, gap: 1.25 };

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
        <IconButton onClick={() => navigate(-1)} sx={{ mt: 0.25, border: `1px solid ${colors.gray200}` }} size="small">
          <ArrowBackRoundedIcon fontSize="small" />
        </IconButton>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h5" sx={{ lineHeight: 1.25 }}>{detail.name}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{detail.amc}</Typography>
          <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: "wrap" }} useFlexGap>
            <Chip size="small" label={assetClassLabel(detail.assetClass)} sx={{ bgcolor: alpha(colors.brand, 0.1), color: colors.brand, fontWeight: 600 }} />
            <Chip size="small" label={detail.subCategory} sx={{ bgcolor: alpha(colors.accent, 0.1), color: colors.accent, fontWeight: 600 }} />
            <Chip size="small" variant="outlined" label={`Direct · Growth`} />
          </Stack>
        </Box>
      </Box>

      {/* Coverage strip */}
      <Paper sx={{ p: { xs: 1.5, sm: 2 }, display: "flex", flexWrap: "wrap", gap: { xs: 2, sm: 4 } }}>
        {[
          { label: "Launched", value: fmtDate(detail.launchDate) },
          { label: "NAV history", value: `${fmtDate(detail.firstNavDate)} → ${fmtDate(detail.lastNavDate)}` },
          { label: "NAV points", value: detail.navPoints.toLocaleString("en-IN") },
        ].map(item => (
          <Box key={item.label}>
            <Typography sx={{ fontSize: "0.62rem", fontWeight: 600, color: colors.gray400, textTransform: "uppercase", letterSpacing: "0.04em" }}>{item.label}</Typography>
            <Typography sx={{ fontSize: "0.85rem", fontWeight: 600 }}>{item.value}</Typography>
          </Box>
        ))}
      </Paper>

      {/* Headline stats */}
      <Box sx={grid3}>
        <StatTile label="5Y CAGR" metric="cagr" horizon="5Y" help="Annualised return over 5 years." />
        <StatTile label="Since inception" metric="cagr" horizon="SI" help="Annualised return from the first NAV." />
        <StatTile label="3Y Sharpe" metric="sharpe" horizon="3Y" help="Return per unit of volatility." />
      </Box>

      {/* CAGR by horizon chart */}
      <Section title="CAGR by horizon">
        {cagrData.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Not enough history to compute CAGR.</Typography>
        ) : (
          <Box sx={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cagrData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.gray200} vertical={false} />
                <XAxis dataKey="horizon" tick={{ fontSize: 12, fill: colors.gray500 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: colors.gray500 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <ReferenceLine y={0} stroke={colors.gray300} />
                <RTooltip
                  cursor={{ fill: alpha(colors.brand, 0.06) }}
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const v = payload[0].value as number;
                    return (
                      <Box sx={{ bgcolor: colors.white, border: `1px solid ${colors.gray200}`, borderRadius: 2, boxShadow: shadow.md, p: 1.25 }}>
                        <Typography sx={{ fontSize: 11, color: colors.gray400, mb: 0.5 }}>{label}</Typography>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: v >= 0 ? colors.success : colors.error }}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</Typography>
                      </Box>
                    );
                  }}
                />
                <Bar dataKey="pct" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {cagrData.map((d, i) => <Cell key={i} fill={d.pct >= 0 ? colors.success : colors.error} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}
      </Section>

      {/* Rolling 5Y distribution */}
      <Section title="5-year rolling returns">
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
          What an investor entering on any given day actually earned over the next 5 years — the honest view a single point-to-point number hides.
        </Typography>
        <Box sx={grid3}>
          <StatTile label="Average" metric="rolling_avg" horizon="5Y" />
          <StatTile label="Worst" metric="rolling_worst" horizon="5Y" help="Worst 5-year outcome any investor got." />
          <StatTile label="Best" metric="rolling_best" horizon="5Y" />
          <StatTile label="% windows > 12%" metric="rolling_share_above_12" horizon="5Y" />
          <StatTile label="% windows negative" metric="rolling_share_negative" horizon="5Y" />
          <StatTile label="Windows counted" metric="rolling_windows" horizon="5Y" />
        </Box>
      </Section>

      {/* Risk */}
      <Section title="Risk & drawdown">
        <Box sx={grid3}>
          <StatTile label="Volatility (3Y)" metric="volatility" horizon="3Y" help="Annualised standard deviation — lower is steadier." />
          <StatTile label="Sharpe (3Y)" metric="sharpe" horizon="3Y" />
          <StatTile label="Sortino (3Y)" metric="sortino" horizon="3Y" help="Like Sharpe but only penalises downside moves." />
          <StatTile label="Max drawdown" metric="max_drawdown" horizon="SI" help="Largest peak-to-trough fall ever." />
          <StatTile label="Current drawdown" metric="current_drawdown" horizon="SI" help="How far below its all-time high it sits now." />
        </Box>
      </Section>

      {/* Short-term absolute returns */}
      <Section title="Recent returns (absolute)">
        <Box sx={grid3}>
          <StatTile label="1 month" metric="absolute" horizon="1M" />
          <StatTile label="3 months" metric="absolute" horizon="3M" />
          <StatTile label="6 months" metric="absolute" horizon="6M" />
        </Box>
      </Section>

      <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
        Scheme code {detail.schemeCode} · Analysis computed live from AMFI NAV history · not investment advice
      </Typography>
    </Stack>
  );
}

export default MutualFundDetail;
