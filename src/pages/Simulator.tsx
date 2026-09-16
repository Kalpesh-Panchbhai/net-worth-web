import { useEffect, useMemo, useState } from "react";
import {
  Box, Paper, Typography, TextField, InputAdornment, Stack, Slider, Button,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useUser } from "../context/UserContext";
import { useTokens } from "../context/ColorModeContext";
import { getAccounts } from "../api/client";
import { isInternalAccount } from "../utils/account";
import { useSyncedConfig } from "../utils/syncedConfig";
import { PageHeader, MetricCard, FadeIn } from "../components/shared";
import { formatCurrency as fmt, formatCurrencyCompact as fmtC } from "../utils/format";

interface YearPoint {
  year: number;
  nominal: number;
  invested: number;
  real: number;
}

/**
 * Monthly-compounding projection. The balance grows at the monthly-equivalent of the annual return
 * and a fixed contribution is added each month; the contribution itself steps up once a year. A
 * per-year snapshot records the nominal balance, cumulative amount invested, and the inflation-
 * adjusted ("today's money") value.
 */
function project(
  start: number, monthly: number, annualReturnPct: number, stepUpPct: number,
  inflationPct: number, years: number,
): YearPoint[] {
  const monthlyRate = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;
  const points: YearPoint[] = [{ year: 0, nominal: start, invested: start, real: start }];
  let balance = start;
  let invested = start;
  let contribution = monthly;
  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + monthlyRate) + contribution;
      invested += contribution;
    }
    const real = balance / Math.pow(1 + inflationPct / 100, y);
    points.push({ year: y, nominal: Math.round(balance), invested: Math.round(invested), real: Math.round(real) });
    contribution *= 1 + stepUpPct / 100;
  }
  return points;
}

interface SimSettings {
  monthly: string; annualReturn: string; stepUp: string; inflation: string; years: number;
}
const DEFAULT_SIM: SimSettings = { monthly: "25000", annualReturn: "12", stepUp: "5", inflation: "6", years: 20 };

function Simulator() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { userId, preferredCurrency, dataVersion } = useUser();
  const { colors } = useTokens();

  // The starting amount is prefilled from net worth per-session (not synced); the assumptions below
  // are the user's own inputs and sync across devices.
  const [start, setStart] = useState("");
  const [sim, setSim] = useSyncedConfig<SimSettings>(userId, "simulator", DEFAULT_SIM);
  const patch = (k: keyof SimSettings, v: string | number) => setSim({ ...sim, [k]: v });
  const { monthly, annualReturn, stepUp, inflation, years } = sim;
  const [prefilled, setPrefilled] = useState(false);

  // Prefill the starting amount with current net worth (sum of active accounts, in the display
  // currency). Only seeds an empty field so it never clobbers what the user typed.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getAccounts(userId).then(accounts => {
      if (cancelled) return;
      const net = accounts
        .filter(a => a.isActive && a.displayCurrency === preferredCurrency && !isInternalAccount(a.name))
        .reduce((sum, a) => sum + a.currentDayValue, 0);
      setStart(prev => prev === "" && net > 0 ? String(Math.round(net)) : prev);
      setPrefilled(net > 0);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId, preferredCurrency, dataVersion]);

  const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };

  const data = useMemo(
    () => project(num(start), num(monthly), num(annualReturn), num(stepUp), num(inflation), years),
    [start, monthly, annualReturn, stepUp, inflation, years],
  );

  const final = data[data.length - 1];
  const growth = final.nominal - final.invested;

  const returnColor = colors.brand;
  const realColor = isDark ? "#34D399" : colors.success;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const p = data[label] ?? {};
    return (
      <Paper sx={{ p: 1.5, borderRadius: 2, boxShadow: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: "0.8rem", mb: 0.5 }}>Year {label}</Typography>
        <Typography sx={{ fontSize: "0.75rem", color: returnColor, fontWeight: 600 }}>
          Value: {fmt(p.nominal ?? 0, preferredCurrency)}
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: realColor, fontWeight: 600 }}>
          Today's money: {fmt(p.real ?? 0, preferredCurrency)}
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: colors.gray500 }}>
          Invested: {fmt(p.invested ?? 0, preferredCurrency)}
        </Typography>
      </Paper>
    );
  };

  const inputField = (
    label: string, value: string, setter: (v: string) => void,
    adornment: string, adornmentPos: "start" | "end" = "start", helper?: string,
  ) => (
    <TextField
      label={label}
      value={value}
      onChange={e => setter(e.target.value)}
      type="number"
      inputMode="decimal"
      size="small"
      fullWidth
      helperText={helper}
      InputProps={adornmentPos === "start"
        ? { startAdornment: <InputAdornment position="start">{adornment}</InputAdornment> }
        : { endAdornment: <InputAdornment position="end">{adornment}</InputAdornment> }}
    />
  );

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
      <PageHeader title="What-If Simulator" />

      <FadeIn>
        <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <InsightsRoundedIcon sx={{ color: colors.brand }} />
            <Typography sx={{ fontWeight: 700 }}>Assumptions</Typography>
          </Stack>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            {inputField("Starting amount", start, setStart, preferredCurrency, "start",
              prefilled ? "Prefilled from your current net worth" : undefined)}
            {inputField("Monthly contribution", monthly, v => patch("monthly", v), preferredCurrency, "start")}
            {inputField("Expected annual return", annualReturn, v => patch("annualReturn", v), "%", "end")}
            {inputField("Annual step-up", stepUp, v => patch("stepUp", v), "%", "end", "Yearly increase in your contribution")}
            {inputField("Inflation", inflation, v => patch("inflation", v), "%", "end", "Used to compute today's-money value")}
            <Box sx={{ px: 1 }}>
              <Typography sx={{ fontSize: "0.75rem", color: colors.gray500, mb: 0.5 }}>
                Time horizon: <strong>{years} years</strong>
              </Typography>
              <Slider
                value={years}
                onChange={(_, v) => patch("years", v as number)}
                min={1}
                max={40}
                marks={[{ value: 1, label: "1y" }, { value: 20, label: "20y" }, { value: 40, label: "40y" }]}
                sx={{ mx: 1 }}
              />
            </Box>
          </Box>
        </Paper>
      </FadeIn>

      {/* Result metrics */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: { xs: 1.5, sm: 2 } }}>
        <FadeIn delay={40}><MetricCard label={`Value in ${years}y`} value={fmt(final.nominal, preferredCurrency)} accent={returnColor} /></FadeIn>
        <FadeIn delay={80}><MetricCard label="Total invested" value={fmt(final.invested, preferredCurrency)} /></FadeIn>
        <FadeIn delay={120}><MetricCard label="Total growth" value={fmt(growth, preferredCurrency)} accent={growth >= 0 ? realColor : colors.error} /></FadeIn>
        <FadeIn delay={160}><MetricCard label="In today's money" value={fmt(final.real, preferredCurrency)} accent={realColor} /></FadeIn>
      </Box>

      {/* Chart */}
      <FadeIn delay={100}>
        <Paper sx={{ p: { xs: 1.5, sm: 3 }, borderRadius: 3 }}>
          <Typography sx={{ fontWeight: 700, mb: 2, px: { xs: 1, sm: 0 } }}>Projected growth</Typography>
          <Box sx={{ height: { xs: 280, sm: 360 } }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="simValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={returnColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={returnColor} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="simInvested" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.gray400} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={colors.gray400} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.gray200} vertical={false} />
                <XAxis dataKey="year" tickFormatter={(y) => `${y}y`} tick={{ fontSize: 11, fill: colors.gray400 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => fmtC(v, preferredCurrency)} tick={{ fontSize: 11, fill: colors.gray400 }} tickLine={false} axisLine={false} width={54} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                <Area type="monotone" dataKey="invested" name="Invested" stroke={colors.gray400} strokeWidth={1.5} strokeDasharray="4 4" fill="url(#simInvested)" />
                <Area type="monotone" dataKey="real" name="Today's money" stroke={realColor} strokeWidth={2} fillOpacity={0} />
                <Area type="monotone" dataKey="nominal" name="Projected value" stroke={returnColor} strokeWidth={2.5} fill="url(#simValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
          <Typography sx={{ fontSize: "0.7rem", color: colors.gray400, mt: 1.5, px: { xs: 1, sm: 0 } }}>
            Illustrative only. Returns are assumed constant and compounded monthly; actual markets vary.
          </Typography>
        </Paper>
      </FadeIn>

      <Box sx={{ display: "flex", justifyContent: "center", pb: 1 }}>
        <Button
          variant="text"
          onClick={() => setSim(DEFAULT_SIM)}
          sx={{ textTransform: "none", color: colors.gray500, "&:hover": { bgcolor: alpha(colors.brand, 0.06) } }}
        >
          Reset assumptions
        </Button>
      </Box>
    </Stack>
  );
}

export default Simulator;
