import { useEffect, useMemo, useState } from "react";
import {
  Box, Paper, Typography, Stack, ToggleButton, ToggleButtonGroup, TextField,
  InputAdornment, MenuItem, Select, FormControl,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from "recharts";
import { getMfNav } from "../api/client";
import type { MfNavSeries } from "../api/types";
import { ChartSkeleton } from "./shared";
import { useTokens } from "../context/ColorModeContext";
import { historyYears, lumpsum, sip, type CalcResult } from "../utils/mfCalc";

const YEAR_OPTIONS = [1, 2, 3, 5, 7, 10];

function inr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export default function MfGrowthAndCalculator({ schemeCode }: { schemeCode: number }) {
  const { colors, shadow } = useTokens();
  const [nav, setNav] = useState<MfNavSeries | null>(null);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<"sip" | "lumpsum">("sip");
  const [amount, setAmount] = useState(10000);
  const [years, setYears] = useState(5);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMfNav(schemeCode)
      .then(d => { if (!cancelled) setNav(d); })
      .catch(() => { if (!cancelled) setNav(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [schemeCode]);

  const growth = useMemo(() => {
    if (!nav || nav.points.length < 2) return [];
    const base = nav.points[0].nav;
    return nav.points.map(p => ({ date: p.date, value: +(10000 * (p.nav / base)).toFixed(0) }));
  }, [nav]);

  const maxYears = nav ? Math.floor(historyYears(nav.points)) : 0;
  const yearChoices = YEAR_OPTIONS.filter(y => y <= maxYears);

  // Keep the selected period within what the fund's history supports.
  useEffect(() => {
    if (yearChoices.length && !yearChoices.includes(years)) setYears(yearChoices[yearChoices.length - 1]);
  }, [maxYears]); // eslint-disable-line react-hooks/exhaustive-deps

  const result: CalcResult | null = useMemo(() => {
    if (!nav) return null;
    return mode === "sip" ? sip(nav.points, amount, years) : lumpsum(nav.points, amount, years);
  }, [nav, mode, amount, years]);

  if (loading) return <ChartSkeleton />;
  if (!nav || growth.length < 2) return null;

  const gainColor = result && result.gain >= 0 ? colors.success : colors.error;

  return (
    <Paper sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Typography variant="subtitle1" sx={{ mb: 1.5 }}>Growth & returns calculator</Typography>

      {/* Growth of ₹10,000 */}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        Growth of ₹10,000 invested at the start of the fund's history.
      </Typography>
      <Box sx={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={growth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mfgrow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.brand} stopOpacity={0.35} />
                <stop offset="100%" stopColor={colors.brand} stopOpacity={0} />
              </linearGradient>
            </defs>
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
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: colors.brand }}>{inr(payload[0].value as number)}</Typography>
                  </Box>
                );
              }}
            />
            <Area type="monotone" dataKey="value" stroke={colors.brand} strokeWidth={2} fill="url(#mfgrow)" />
          </AreaChart>
        </ResponsiveContainer>
      </Box>

      {/* Calculator */}
      <Box sx={{ mt: 2, p: { xs: 1.5, sm: 2 }, borderRadius: 2, border: `1px solid ${colors.gray200}`, bgcolor: alpha(colors.brand, 0.02) }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "stretch", sm: "center" }} sx={{ mb: 2 }}>
          <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => { if (v) { setMode(v); setAmount(v === "sip" ? 10000 : 100000); } }}>
            <ToggleButton value="sip">SIP (monthly)</ToggleButton>
            <ToggleButton value="lumpsum">Lumpsum</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            size="small" type="number" label={mode === "sip" ? "Monthly amount" : "Amount"}
            value={amount} onChange={e => setAmount(Math.max(0, Number(e.target.value)))}
            InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
            sx={{ maxWidth: { sm: 180 } }}
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select value={yearChoices.includes(years) ? years : (yearChoices[yearChoices.length - 1] ?? 1)}
              onChange={e => setYears(Number(e.target.value))}>
              {yearChoices.map(y => <MenuItem key={y} value={y}>{y} year{y > 1 ? "s" : ""}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>

        {result ? (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 1.5 }}>
            <Stat label="Invested" value={inr(result.invested)} />
            <Stat label="Current value" value={inr(result.value)} color={colors.gray900} />
            <Stat label="Gain" value={`${result.gain >= 0 ? "+" : ""}${inr(result.gain)}`} color={gainColor} />
            <Stat label={mode === "sip" ? "XIRR" : "CAGR"} value={result.annualized == null ? "—" : `${(result.annualized * 100).toFixed(2)}%`} color={gainColor} />
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">Not enough history for this period.</Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
          Indicative, computed from past NAVs (direct-growth). Past performance doesn't predict future returns.
        </Typography>
      </Box>
    </Paper>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const { colors } = useTokens();
  return (
    <Box>
      <Typography sx={{ fontSize: "0.62rem", fontWeight: 600, color: colors.gray400, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</Typography>
      <Typography sx={{ fontSize: "1.05rem", fontWeight: 750, color: color ?? colors.gray800, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
    </Box>
  );
}
