import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, Box, Typography, IconButton, Stack, Chip, useMediaQuery, useTheme,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend } from "recharts";
import { getMfFund, getMfNav } from "../api/client";
import type { MfFundDetail, MfNavSeries } from "../api/types";
import { useTokens } from "../context/ColorModeContext";
import { metricMeta, formatMetricValue, isSignedMetric } from "../utils/mfMetrics";

const SERIES_COLORS = ["#6366F1", "#10B981", "#F59E0B", "#EF4444"];

// The rows of the comparison table: (label, metric, horizon).
const ROWS: { label: string; metric: string; horizon: string }[] = [
  { label: "1Y CAGR", metric: "cagr", horizon: "1Y" },
  { label: "3Y CAGR", metric: "cagr", horizon: "3Y" },
  { label: "5Y CAGR", metric: "cagr", horizon: "5Y" },
  { label: "Since inception", metric: "cagr", horizon: "SI" },
  { label: "5Y rolling avg", metric: "rolling_avg", horizon: "5Y" },
  { label: "5Y rolling worst", metric: "rolling_worst", horizon: "5Y" },
  { label: "3Y volatility", metric: "volatility", horizon: "3Y" },
  { label: "3Y Sharpe", metric: "sharpe", horizon: "3Y" },
  { label: "Max drawdown", metric: "max_drawdown", horizon: "SI" },
];

function navOnOrBefore(points: { date: string; nav: number }[], iso: string): number | null {
  let found: number | null = null;
  for (const p of points) { if (p.date <= iso) found = p.nav; else break; }
  return found;
}

export default function MfCompareDialog({ schemeCodes, open, onClose }: {
  schemeCodes: number[]; open: boolean; onClose: () => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, shadow } = useTokens();
  const [funds, setFunds] = useState<MfFundDetail[]>([]);
  const [navs, setNavs] = useState<MfNavSeries[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || schemeCodes.length === 0) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      Promise.all(schemeCodes.map(c => getMfFund(c))),
      Promise.all(schemeCodes.map(c => getMfNav(c))),
    ]).then(([f, n]) => { if (!cancelled) { setFunds(f); setNavs(n); } })
      .catch(() => { if (!cancelled) { setFunds([]); setNavs([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, schemeCodes.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const val = (f: MfFundDetail, metric: string, horizon: string) =>
    f.metrics.find(m => m.metric === metric && m.horizon === horizon)?.value;

  // Overlaid growth of ₹10,000, each fund rebased at the latest of the funds' start dates.
  const growth = useMemo(() => {
    if (navs.length === 0 || navs.some(n => n.points.length < 2)) return [];
    const commonStart = navs.reduce((mx, n) => (n.points[0].date > mx ? n.points[0].date : mx), navs[0].points[0].date);
    const bases = navs.map(n => navOnOrBefore(n.points, commonStart) ?? n.points.find(p => p.date >= commonStart)?.nav ?? n.points[0].nav);
    const dates = [...new Set(navs.flatMap(n => n.points.map(p => p.date)).filter(d => d >= commonStart))].sort();
    return dates.map(date => {
      const row: Record<string, number | string> = { date };
      navs.forEach((n, i) => {
        const nav = navOnOrBefore(n.points, date);
        if (nav != null && bases[i] > 0) row[`f${i}`] = +(10000 * (nav / bases[i])).toFixed(0);
      });
      return row;
    });
  }, [navs]);

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="lg" fullWidth
      slotProps={{ paper: { sx: { borderRadius: fullScreen ? 0 : 3 } } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 700 }}>
        Compare funds
        <Box sx={{ flex: 1 }} />
        <IconButton onClick={onClose} size="small"><CloseRoundedIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>Loading…</Typography>
        ) : funds.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>Nothing to compare.</Typography>
        ) : (
          <Stack spacing={2.5}>
            {/* Legend chips */}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {funds.map((f, i) => (
                <Chip key={f.schemeCode} label={f.name}
                  sx={{ fontWeight: 600, bgcolor: `${SERIES_COLORS[i]}22`, color: SERIES_COLORS[i], maxWidth: 260 }} />
              ))}
            </Stack>

            {/* Overlaid growth of ₹10,000 */}
            {growth.length > 1 && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Growth of ₹10,000 (rebased to a common start)</Typography>
                <Box sx={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={growth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={colors.gray200} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: colors.gray500 }} axisLine={false} tickLine={false}
                        tickFormatter={(d: string) => d.slice(0, 4)} minTickGap={48} />
                      <YAxis tick={{ fontSize: 11, fill: colors.gray500 }} axisLine={false} tickLine={false}
                        tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} width={44} />
                      <RTooltip
                        content={({ active, payload, label }: any) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <Box sx={{ bgcolor: colors.white, border: `1px solid ${colors.gray200}`, borderRadius: 2, boxShadow: shadow.md, p: 1.25 }}>
                              <Typography sx={{ fontSize: 11, color: colors.gray400, mb: 0.5 }}>{label}</Typography>
                              {payload.map((p: any, i: number) => (
                                <Typography key={i} sx={{ fontSize: 12, fontWeight: 600, color: p.color }}>
                                  {funds[Number(p.dataKey.slice(1))]?.name?.slice(0, 24)}: ₹{Math.round(p.value).toLocaleString("en-IN")}
                                </Typography>
                              ))}
                            </Box>
                          );
                        }}
                      />
                      <Legend formatter={(v: string) => funds[Number(v.slice(1))]?.name?.slice(0, 20) ?? v} />
                      {funds.map((_, i) => (
                        <Line key={i} type="monotone" dataKey={`f${i}`} stroke={SERIES_COLORS[i]} strokeWidth={2} dot={false} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            )}

            {/* Side-by-side metrics */}
            <Box sx={{ overflowX: "auto" }}>
              <Box sx={{ display: "grid", gridTemplateColumns: `160px repeat(${funds.length}, minmax(110px, 1fr))`, minWidth: 160 + funds.length * 110, border: `1px solid ${colors.gray200}`, borderRadius: 2, overflow: "hidden" }}>
                <Box sx={{ p: 1, fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", color: colors.gray500, bgcolor: colors.gray50, borderBottom: `1px solid ${colors.gray200}` }}>Metric</Box>
                {funds.map((f, i) => (
                  <Box key={f.schemeCode} sx={{ p: 1, fontSize: "0.72rem", fontWeight: 700, textAlign: "right", color: SERIES_COLORS[i], bgcolor: colors.gray50, borderBottom: `1px solid ${colors.gray200}`, borderLeft: `1px solid ${colors.gray200}` }}>
                    {f.amc.split(" ")[0]}
                  </Box>
                ))}
                {ROWS.map(r => {
                  const meta = metricMeta(r.metric);
                  const values = funds.map(f => val(f, r.metric, r.horizon));
                  const present = values.filter((v): v is number => v != null);
                  const best = present.length ? (meta.higherIsBetter ? Math.max(...present) : Math.min(...present)) : null;
                  return (
                    <Box key={r.label} sx={{ display: "contents" }}>
                      <Box sx={{ p: 1, fontSize: "0.76rem", fontWeight: 600, borderBottom: `1px solid ${colors.gray100}` }}>{r.label}</Box>
                      {values.map((v, i) => {
                        const signed = isSignedMetric(r.metric);
                        const isBest = v != null && best != null && v === best && funds.length > 1;
                        const color = v == null ? colors.gray400 : !signed ? colors.gray800 : v >= 0 ? colors.success : colors.error;
                        return (
                          <Box key={i} sx={{ p: 1, textAlign: "right", fontSize: "0.78rem", fontWeight: isBest ? 800 : 600, color, borderBottom: `1px solid ${colors.gray100}`, borderLeft: `1px solid ${colors.gray100}`, bgcolor: isBest ? `${SERIES_COLORS[i]}14` : "transparent", fontVariantNumeric: "tabular-nums" }}>
                            {v == null ? "—" : formatMetricValue(r.metric, v)}
                          </Box>
                        );
                      })}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
