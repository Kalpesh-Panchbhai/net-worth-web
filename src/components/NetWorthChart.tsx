import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useTheme, useMediaQuery } from "@mui/material";
import { tokens } from "../theme";
import type { ChartDataPoint } from "../api/types";

const { colors } = tokens;

interface NetWorthChartProps {
  data: ChartDataPoint[];
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

function NetWorthChart({ data }: NetWorthChartProps) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <ResponsiveContainer width="100%" height={compact ? 240 : 340}>
      <AreaChart data={data} margin={{ top: 4, right: compact ? 4 : 8, left: compact ? -20 : 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gVal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.brand} stopOpacity={0.12} />
            <stop offset="100%" stopColor={colors.brand} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gInv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.warning} stopOpacity={0.1} />
            <stop offset="100%" stopColor={colors.warning} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={colors.gray100} />
        <XAxis
          dataKey="date" tickLine={false} axisLine={false}
          tick={{ fontSize: compact ? 10 : 11, fill: colors.gray400 }}
          interval={compact ? "preserveStartEnd" : undefined}
        />
        <YAxis
          tickLine={false} axisLine={false} width={compact ? 40 : 52}
          tick={{ fontSize: compact ? 10 : 11, fill: colors.gray400 }}
          tickFormatter={(v: number) => new Intl.NumberFormat("en-IN", { notation: "compact" }).format(v)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: colors.white, border: `1px solid ${colors.gray200}`,
            borderRadius: 12, boxShadow: tokens.shadow.md, padding: "10px 14px",
            fontSize: 13, lineHeight: 1.5,
          }}
          formatter={(value: number) => [fmtCurrency(value)]}
          labelStyle={{ color: colors.gray400, fontSize: 11, marginBottom: 6 }}
          cursor={{ stroke: colors.gray200, strokeDasharray: "4 4" }}
        />
        <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, paddingTop: 12, color: colors.gray500 }} />
        <Area
          type="monotone" dataKey="value" name="Value"
          stroke={colors.brand} strokeWidth={2.5} fill="url(#gVal)" dot={false}
          activeDot={{ r: 5, strokeWidth: 2, stroke: colors.white, fill: colors.brand }}
        />
        <Area
          type="monotone" dataKey="invested" name="Invested"
          stroke={colors.warning} strokeWidth={1.5} strokeDasharray="6 4"
          fill="url(#gInv)" dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: colors.white, fill: colors.warning }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default NetWorthChart;
