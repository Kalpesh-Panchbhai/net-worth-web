import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { Box, Typography, useTheme, useMediaQuery } from "@mui/material";
import { alpha } from "@mui/material/styles";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import { useTokens } from "../context/ColorModeContext";
import type { ChartDataPoint } from "../api/types";

interface EnrichedDataPoint extends ChartDataPoint {
  savingsRate?: number | null;
}

interface NetWorthChartProps {
  data: EnrichedDataPoint[];
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

/* eslint-disable @typescript-eslint/no-explicit-any */
function CustomTooltip({ active, payload, label, colors, shadow }: any) {
  if (!active || !payload?.length) return null;
  const value = payload.find((p: any) => p.dataKey === "value")?.value;
  const invested = payload.find((p: any) => p.dataKey === "invested")?.value;
  const raw = payload[0]?.payload as EnrichedDataPoint | undefined;
  const sr = raw?.savingsRate;

  return (
    <Box sx={{
      bgcolor: colors.white, border: `1px solid ${colors.gray200}`,
      borderRadius: 3, boxShadow: shadow.md, p: 1.5, minWidth: 160,
    }}>
      <Typography sx={{ fontSize: 11, color: colors.gray400, mb: 1, fontWeight: 500 }}>{label}</Typography>
      {value != null && (
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, mb: 0.5 }}>
          <Typography sx={{ fontSize: 12, color: colors.gray500 }}>Value</Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: colors.brand }}>{fmtCurrency(value)}</Typography>
        </Box>
      )}
      {invested != null && (
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, mb: 0.5 }}>
          <Typography sx={{ fontSize: 12, color: colors.gray500 }}>Invested</Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.warning }}>{fmtCurrency(invested)}</Typography>
        </Box>
      )}
      {sr != null && (
        <Box sx={{
          display: "flex", alignItems: "center", gap: 0.75,
          mt: 1, pt: 1, borderTop: `1px dashed ${alpha(colors.gray300, 0.5)}`,
        }}>
          <SavingsOutlinedIcon sx={{ fontSize: 14, color: sr >= 50 ? colors.success : sr >= 25 ? colors.warning : colors.error }} />
          <Typography sx={{ fontSize: 11, color: colors.gray500 }}>Saved</Typography>
          <Typography sx={{
            fontSize: 12, fontWeight: 800, ml: "auto",
            color: sr >= 50 ? colors.success : sr >= 25 ? colors.warning : colors.error,
          }}>
            {sr.toFixed(1)}%
          </Typography>
        </Box>
      )}
    </Box>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function NetWorthChart({ data }: NetWorthChartProps) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, shadow } = useTokens();

  const hasSavings = data.some((d) => d.savingsRate != null);

  // Compute savings Y-axis max and gradient thresholds
  const savMax = (() => {
    const m = Math.max(...data.map((d) => d.savingsRate ?? 0));
    return Math.ceil(Math.max(m, 100) / 10) * 10;
  })();
  // Offsets are from top (y1=0=max, y2=1=0), so threshold at value V → offset = 1 - V/max
  // Add smooth transition bands around thresholds
  const band = 0.06; // 6% blend zone on each side
  const sav50 = Math.min(1 - 50 / savMax, 1);
  const sav25 = Math.min(1 - 25 / savMax, 1);
  const sav50a = Math.max(sav50 - band, 0);
  const sav50b = Math.min(sav50 + band, 1);
  const sav25a = Math.max(sav25 - band, sav50b);
  const sav25b = Math.min(sav25 + band, 1);

  return (
    <ResponsiveContainer width="100%" height={compact ? 240 : 340}>
      <AreaChart data={data} margin={{ top: 4, right: hasSavings ? (compact ? 30 : 40) : (compact ? 4 : 8), left: compact ? -10 : 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gVal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.brand} stopOpacity={0.12} />
            <stop offset="100%" stopColor={colors.brand} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gInv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.warning} stopOpacity={0.1} />
            <stop offset="100%" stopColor={colors.warning} stopOpacity={0} />
          </linearGradient>
          {/* Savings stroke gradient: green → yellow → red with smooth blending */}
          <linearGradient id="gSavStroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset={sav50a} stopColor={colors.success} />
            <stop offset={sav50b} stopColor={colors.warning} />
            <stop offset={sav25a} stopColor={colors.warning} />
            <stop offset={sav25b} stopColor={colors.error} />
          </linearGradient>
          {/* Savings fill gradient: matches stroke colors with faded opacity */}
          <linearGradient id="gSavFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset={sav50a} stopColor={colors.success} stopOpacity={0.10} />
            <stop offset={sav50b} stopColor={colors.warning} stopOpacity={0.06} />
            <stop offset={sav25a} stopColor={colors.warning} stopOpacity={0.06} />
            <stop offset={sav25b} stopColor={colors.error} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={colors.gray100} />
        <XAxis
          dataKey="date" tickLine={false} axisLine={false}
          tick={{ fontSize: compact ? 10 : 11, fill: colors.gray400 }}
          interval={compact ? "preserveStartEnd" : undefined}
        />
        <YAxis
          yAxisId="left"
          tickLine={false} axisLine={false} width={compact ? 40 : 52}
          tick={{ fontSize: compact ? 10 : 11, fill: colors.gray400 }}
          tickFormatter={(v: number) => {
            if (Math.abs(v) >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
            if (Math.abs(v) >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
            if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
            return String(v);
          }}
        />
        {hasSavings && (
          <YAxis
            yAxisId="right" orientation="right"
            tickLine={false} axisLine={false} width={compact ? 30 : 36}
            tick={{ fontSize: compact ? 9 : 10, fill: colors.success }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            domain={[0, (max: number) => Math.ceil(Math.max(max, 100) / 10) * 10]}
          />
        )}
        <Tooltip
          content={<CustomTooltip colors={colors} shadow={shadow} />}
          cursor={{ stroke: colors.gray200, strokeDasharray: "4 4" }}
        />
        <Legend
          iconSize={7}
          wrapperStyle={{ fontSize: 12, paddingTop: 12, color: colors.gray500 }}
          formatter={(value: string) => <span style={{ fontSize: 12, verticalAlign: "middle" }}>{value}</span>}
          payload={[
            { value: "Value", type: "circle", color: colors.brand },
            { value: "Invested", type: "circle", color: colors.warning },
            ...(hasSavings ? [{ value: "Saved %", type: "circle" as const, color: colors.success }] : []),
          ]}
        />
        <Area
          yAxisId="left"
          type="monotone" dataKey="value" name="Value"
          stroke={colors.brand} strokeWidth={2.5} fill="url(#gVal)" dot={false}
          activeDot={{ r: 5, strokeWidth: 2, stroke: colors.white, fill: colors.brand }}
          isAnimationActive animationDuration={800} animationEasing="ease-out"
        />
        <Area
          yAxisId="left"
          type="monotone" dataKey="invested" name="Invested"
          stroke={colors.warning} strokeWidth={1.5} strokeDasharray="6 4"
          fill="url(#gInv)" dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: colors.white, fill: colors.warning }}
          isAnimationActive animationDuration={800} animationEasing="ease-out" animationBegin={100}
        />
        {hasSavings && (
          <Area
            yAxisId="right"
            type="monotone" dataKey="savingsRate" name="Saved %"
            stroke="url(#gSavStroke)" strokeWidth={2} strokeDasharray="4 3"
            fill="url(#gSavFill)" dot={false}
            activeDot={(props: { cx: number; cy: number; payload: EnrichedDataPoint }) => {
              const sr = props.payload.savingsRate ?? 0;
              const c = sr >= 50 ? colors.success : sr >= 25 ? colors.warning : colors.error;
              return <circle cx={props.cx} cy={props.cy} r={4} strokeWidth={2} stroke={colors.white} fill={c} />;
            }}
            connectNulls
            isAnimationActive animationDuration={800} animationEasing="ease-out" animationBegin={200}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default NetWorthChart;
