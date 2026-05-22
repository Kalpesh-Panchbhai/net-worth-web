import { useState, useEffect, useCallback } from "react";
import { Box, Paper, Typography, Stack, ToggleButton, ToggleButtonGroup, CircularProgress } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { TooltipProps } from "recharts";
import { useTheme, useMediaQuery } from "@mui/material";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import { useTokens } from "../context/ColorModeContext";
import { getChartData } from "../api/client";
import type { ChartDataPoint, EntityType, TimePeriod } from "../api/types";

const PERIODS: { value: TimePeriod; label: string }[] = [
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
  { value: "2Y", label: "2Y" },
  { value: "5Y", label: "5Y" },
  { value: "ALL", label: "All" },
];

interface EntityChartProps {
  entityType: EntityType;
  entityId: number;
  accentColor?: string;
  currency?: string;
  showInvested?: boolean;
}

function fmtCurrency(v: number, currency = "INR") {
  const hasDecimals = v % 1 !== 0;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: hasDecimals ? 2 : 0 }).format(v);
}

function spansMultipleYears(data: ChartDataPoint[]): boolean {
  if (data.length < 2) return false;
  const firstYear = new Date(data[0].date + "T00:00:00").getFullYear();
  const lastYear = new Date(data[data.length - 1].date + "T00:00:00").getFullYear();
  return firstYear !== lastYear;
}

function formatDateLabel(dateStr: string, multiYear: boolean) {
  const d = new Date(dateStr + "T00:00:00");
  return multiYear
    ? d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function CustomTooltip({ active, payload, label, currency, accentColor, showInvested, colors, shadow }: TooltipProps<number, string> & { currency: string; accentColor: string; showInvested: boolean; colors: ReturnType<typeof useTokens>["colors"]; shadow: ReturnType<typeof useTokens>["shadow"] }) {
  if (!active || !payload?.length) return null;
  const value = payload.find(p => p.dataKey === "value")?.value ?? 0;
  const invested = payload.find(p => p.dataKey === "invested")?.value ?? 0;
  const pl = value - invested;
  const plPct = invested > 0 ? (pl / invested) * 100 : 0;
  const isGain = pl >= 0;
  const plColor = isGain ? colors.success : colors.error;
  const dateStr = typeof label === "string" ? label : "";
  const d = new Date(dateStr + "T00:00:00");
  const formattedDate = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <Box sx={{
      bgcolor: colors.white, border: `1px solid ${colors.gray200}`,
      borderRadius: 4, boxShadow: shadow.md, minWidth: 220, overflow: "hidden",
    }}>
      {/* Date header */}
      <Box sx={{ px: 2.5, pt: 2, pb: 1.5, bgcolor: alpha(colors.gray100, 0.5) }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: colors.gray500, letterSpacing: "0.01em" }}>
          {formattedDate}
        </Typography>
      </Box>

      {/* Values */}
      <Stack spacing={0} sx={{ px: 2.5, py: 1.5 }}>
        {/* Value row */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.75 }}>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: accentColor }} />
            <Typography sx={{ fontSize: 12.5, color: colors.gray400, fontWeight: 600 }}>Value</Typography>
          </Stack>
          <Typography sx={{ fontSize: 13.5, fontWeight: 750, color: colors.gray500, letterSpacing: "-0.01em" }}>
            {fmtCurrency(value, currency)}
          </Typography>
        </Stack>

        {/* Invested row */}
        {showInvested && (
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.75 }}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: colors.warning }} />
              <Typography sx={{ fontSize: 12.5, color: colors.gray400, fontWeight: 600 }}>Invested</Typography>
            </Stack>
            <Typography sx={{ fontSize: 13.5, fontWeight: 750, color: colors.gray500, letterSpacing: "-0.01em" }}>
              {fmtCurrency(invested, currency)}
            </Typography>
          </Stack>
        )}
      </Stack>

      {/* P&L footer */}
      {showInvested && invested > 0 && (
        <Box sx={{
          mx: 1.5, mb: 1.5, px: 2, py: 1.5,
          borderRadius: 2.5,
          bgcolor: alpha(plColor, 0.06),
          border: `1px solid ${alpha(plColor, 0.1)}`,
        }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={0.5} alignItems="center">
              {isGain
                ? <TrendingUpRoundedIcon sx={{ fontSize: 18, color: plColor }} />
                : <TrendingDownRoundedIcon sx={{ fontSize: 18, color: plColor }} />}
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: plColor }}>P&L</Typography>
            </Stack>
            <Stack alignItems="flex-end" spacing={0}>
              <Typography sx={{ fontSize: 14, fontWeight: 800, color: plColor, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                {isGain ? "+" : ""}{fmtCurrency(pl, currency)}
              </Typography>
              <Box sx={{
                display: "inline-flex", alignItems: "center",
                px: 0.75, py: 0.15, mt: 0.3,
                borderRadius: 1, bgcolor: alpha(plColor, 0.1),
              }}>
                <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: plColor, lineHeight: 1.2 }}>
                  {isGain ? "+" : ""}{plPct.toFixed(2)}%
                </Typography>
              </Box>
            </Stack>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

export default function EntityChart({ entityType, entityId, accentColor, currency = "INR", showInvested = true }: EntityChartProps) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, shadow } = useTokens();
  const color = accentColor || colors.brand;

  const [period, setPeriod] = useState<TimePeriod>("1Y");
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) return;
    try {
      setLoading(true);
      setError(false);
      const result = await getChartData(entityType, entityId, period);
      setData(result);
    } catch {
      setError(true);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, period]);

  useEffect(() => { load(); }, [load]);

  const gradientId = `grad-${entityType}-${entityId}`;
  const gradientInvId = `grad-inv-${entityType}-${entityId}`;

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" spacing={1}>
        <Typography sx={{ fontWeight: 700, fontSize: "0.95rem" }}>Performance</Typography>
        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={(_, v) => { if (v) setPeriod(v); }}
          size="small"
          sx={{
            "& .MuiToggleButton-root": {
              px: { xs: 1, sm: 1.5 }, py: 0.3,
              fontSize: "0.7rem", fontWeight: 700,
              border: `1px solid ${colors.gray200}`,
              color: colors.gray500,
              "&.Mui-selected": {
                bgcolor: alpha(color, 0.1),
                color: color,
                borderColor: alpha(color, 0.3),
                "&:hover": { bgcolor: alpha(color, 0.15) },
              },
            },
          }}
        >
          {PERIODS.map(p => (
            <ToggleButton key={p.value} value={p.value}>{p.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: compact ? 200 : 300 }}>
          <CircularProgress size={28} sx={{ color }} />
        </Box>
      ) : error ? (
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: compact ? 200 : 300 }}>
          <Typography color="text.secondary" sx={{ fontSize: "0.85rem" }}>Failed to load chart data</Typography>
        </Box>
      ) : data.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: compact ? 200 : 300 }}>
          <Typography color="text.secondary" sx={{ fontSize: "0.85rem" }}>No data available for this period</Typography>
        </Box>
      ) : (() => {
        const multiYear = spansMultipleYears(data);

        // Build horizontal gradient stops for value line: green where value >= invested, red where value < invested
        const valStrokeId = `val-stroke-${entityType}-${entityId}`;
        const valFillId = `val-fill-${entityType}-${entityId}`;
        const hasInvData = showInvested && data.some(d => d.invested > 0);

        type GradStop = { offset: string; color: string; opacity?: number };
        const strokeStops: GradStop[] = [];
        const fillStops: GradStop[] = [];

        if (hasInvData) {
          const n = data.length;
          const span = Math.max(n - 1, 1);
          // Smooth transition band: ~5% of chart width on each side of crossover
          const band = Math.min(5, 100 / span);

          // Walk points and find crossover offsets with smooth blending
          for (let i = 0; i < n; i++) {
            const d = data[i];
            const pl = d.invested > 0 ? d.value - d.invested : 0;
            const c = pl >= 0 ? colors.success : colors.error;
            const pct = `${((i / span) * 100).toFixed(1)}%`;

            if (i > 0) {
              const prev = data[i - 1];
              const prevPl = prev.invested > 0 ? prev.value - prev.invested : 0;
              if ((prevPl >= 0) !== (pl >= 0)) {
                const ratio = Math.abs(prevPl) / (Math.abs(prevPl) + Math.abs(pl));
                const crossX = ((i - 1 + ratio) / span) * 100;
                const before = Math.max(crossX - band, 0);
                const after = Math.min(crossX + band, 100);
                const prevC = prevPl >= 0 ? colors.success : colors.error;
                strokeStops.push({ offset: `${before.toFixed(1)}%`, color: prevC });
                strokeStops.push({ offset: `${after.toFixed(1)}%`, color: c });
                fillStops.push({ offset: `${before.toFixed(1)}%`, color: prevC, opacity: 0.06 });
                fillStops.push({ offset: `${after.toFixed(1)}%`, color: c, opacity: 0.06 });
              }
            }

            if (i === 0 || i === n - 1) {
              strokeStops.push({ offset: pct, color: c });
              fillStops.push({ offset: pct, color: c, opacity: i === 0 ? 0.12 : 0 });
            }
          }
        }

        return (
        <ResponsiveContainer width="100%" height={compact ? 240 : 320}>
          <AreaChart data={data} margin={{ top: 4, right: compact ? 4 : 8, left: compact ? -20 : 0, bottom: 0 }}>
            <defs>
              {hasInvData ? (
                <>
                  <linearGradient id={valStrokeId} x1="0" y1="0" x2="1" y2="0">
                    {strokeStops.map((s, i) => (
                      <stop key={i} offset={s.offset} stopColor={s.color} />
                    ))}
                  </linearGradient>
                  <linearGradient id={valFillId} x1="0" y1="0" x2="1" y2="0">
                    {fillStops.map((s, i) => (
                      <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
                    ))}
                  </linearGradient>
                </>
              ) : (
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              )}
              {showInvested && (
                <linearGradient id={gradientInvId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.warning} stopOpacity={0.1} />
                  <stop offset="100%" stopColor={colors.warning} stopOpacity={0} />
                </linearGradient>
              )}
            </defs>
            <CartesianGrid vertical={false} stroke={colors.gray100} />
            <XAxis
              dataKey="date" tickLine={false} axisLine={false}
              tick={{ fontSize: compact ? 9 : 11, fill: colors.gray400 }}
              tickFormatter={(dateStr: string) => formatDateLabel(dateStr, multiYear)}
              interval={compact ? "preserveStartEnd" : undefined}
            />
            <YAxis
              tickLine={false} axisLine={false} width={compact ? 40 : 52}
              tick={{ fontSize: compact ? 9 : 11, fill: colors.gray400 }}
              tickFormatter={(v: number) => {
                if (Math.abs(v) >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
                if (Math.abs(v) >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
                if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
                return String(v);
              }}
            />
            <Tooltip
              content={<CustomTooltip currency={currency} accentColor={color} showInvested={showInvested} colors={colors} shadow={shadow} />}
              cursor={{ stroke: colors.gray200, strokeDasharray: "4 4" }}
            />
            <Legend
              iconSize={7}
              wrapperStyle={{ fontSize: 12, paddingTop: 12, color: colors.gray500 }}
              formatter={(value: string) => <span style={{ fontSize: 12, verticalAlign: "middle" }}>{value}</span>}
              payload={[
                { value: "Value", type: "circle" as const, color: hasInvData ? colors.success : color },
                ...(showInvested ? [{ value: "Invested", type: "circle" as const, color: colors.warning }] : []),
              ]}
            />
            <Area
              type="monotone" dataKey="value" name="Value"
              stroke={hasInvData ? `url(#${valStrokeId})` : color}
              strokeWidth={2.5}
              fill={hasInvData ? `url(#${valFillId})` : `url(#${gradientId})`}
              dot={false}
              activeDot={hasInvData
                ? (props: { cx: number; cy: number; payload: ChartDataPoint }) => {
                    const pl = props.payload.invested > 0 ? props.payload.value - props.payload.invested : 0;
                    const c = pl >= 0 ? colors.success : colors.error;
                    return <circle cx={props.cx} cy={props.cy} r={5} strokeWidth={2} stroke={colors.white} fill={c} />;
                  }
                : { r: 5, strokeWidth: 2, stroke: colors.white, fill: color }}
              isAnimationActive animationDuration={800} animationEasing="ease-out"
            />
            {showInvested && (
              <Area
                type="monotone" dataKey="invested" name="Invested"
                stroke={colors.warning} strokeWidth={1.5} strokeDasharray="6 4"
                fill={`url(#${gradientInvId})`} dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: colors.white, fill: colors.warning }}
                isAnimationActive animationDuration={800} animationEasing="ease-out" animationBegin={100}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
        );
      })()}

      {/* P&L High / Low strip */}
      {!loading && !error && data.length > 1 && showInvested && (() => {
        const plPoints = data.filter(d => d.invested > 0).map(d => ({
          date: d.date,
          pl: d.value - d.invested,
          plPct: (d.value - d.invested) / d.invested * 100,
        }));
        if (plPoints.length < 2) return null;
        const best = plPoints.reduce((a, b) => b.pl > a.pl ? b : a);
        const worst = plPoints.reduce((a, b) => b.pl < a.pl ? b : a);
        const fmtDate = (s: string) => {
          const d = new Date(s + "T00:00:00");
          return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
        };
        return (
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            sx={{ mt: 2, pt: 2, borderTop: `1px solid ${colors.gray100}` }}
          >
            {/* Best P&L */}
            <Box sx={{
              flex: 1, display: "flex", alignItems: "center", gap: 1.5,
              px: 2, py: 1.5, borderRadius: 2.5,
              bgcolor: alpha(colors.success, 0.06),
              border: `1px solid ${alpha(colors.success, 0.12)}`,
            }}>
              <Box sx={{
                width: 36, height: 36, borderRadius: 2,
                display: "flex", alignItems: "center", justifyContent: "center",
                bgcolor: alpha(colors.success, 0.12),
              }}>
                <TrendingUpRoundedIcon sx={{ fontSize: 20, color: colors.success }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 10, fontWeight: 600, color: colors.gray400, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Best P&L
                </Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 750, color: colors.success, letterSpacing: "-0.01em" }}>
                  +{fmtCurrency(best.pl, currency)} <Typography component="span" sx={{ fontSize: 11, fontWeight: 600 }}>({best.plPct >= 0 ? "+" : ""}{best.plPct.toFixed(2)}%)</Typography>
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray400, whiteSpace: "nowrap" }}>
                {fmtDate(best.date)}
              </Typography>
            </Box>

            {/* Worst P&L */}
            <Box sx={{
              flex: 1, display: "flex", alignItems: "center", gap: 1.5,
              px: 2, py: 1.5, borderRadius: 2.5,
              bgcolor: alpha(colors.error, 0.06),
              border: `1px solid ${alpha(colors.error, 0.12)}`,
            }}>
              <Box sx={{
                width: 36, height: 36, borderRadius: 2,
                display: "flex", alignItems: "center", justifyContent: "center",
                bgcolor: alpha(colors.error, 0.12),
              }}>
                <TrendingDownRoundedIcon sx={{ fontSize: 20, color: colors.error }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 10, fontWeight: 600, color: colors.gray400, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Worst P&L
                </Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 750, color: colors.error, letterSpacing: "-0.01em" }}>
                  {worst.pl >= 0 ? "+" : ""}{fmtCurrency(worst.pl, currency)} <Typography component="span" sx={{ fontSize: 11, fontWeight: 600 }}>({worst.plPct >= 0 ? "+" : ""}{worst.plPct.toFixed(2)}%)</Typography>
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray400, whiteSpace: "nowrap" }}>
                {fmtDate(worst.date)}
              </Typography>
            </Box>
          </Stack>
        );
      })()}
    </Paper>
  );
}
