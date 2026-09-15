import { memo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { TooltipProps } from "recharts";
import { Box, Typography, Stack } from "@mui/material";
import { useTheme, useMediaQuery } from "@mui/material";
import { useTokens } from "../context/ColorModeContext";
import { formatCurrency as fmtCurrency, formatCurrencyCompact } from "../utils/format";
import type { IncomeChartPoint } from "./IncomeChart";

interface IncomeLineChartProps {
  data: IncomeChartPoint[];
  currency?: string;
}

/**
 * Plots an income series (net/tax/total per group) as lines — for progressive, time-ordered views
 * such as average monthly income by month/year/FY, where a trend line reads better than bars. Draws
 * the data exactly as given (already filtered, grouped and chronologically sorted by the page).
 */
function IncomeLineChart({ data, currency }: IncomeLineChartProps) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, shadow } = useTokens();

  const rows = data.map(d => ({ label: d.label, net: d.net, tax: d.tax, total: d.net + d.tax }));

  return (
    <ResponsiveContainer width="100%" height={compact ? 240 : 340}>
      <LineChart data={rows} margin={{ top: 4, right: compact ? 4 : 8, left: compact ? -20 : 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={colors.gray100} />
        <XAxis
          dataKey="label" tickLine={false} axisLine={false}
          tick={{ fontSize: compact ? 10 : 11, fill: colors.gray500 }}
          interval={compact ? "preserveStartEnd" : undefined}
        />
        <YAxis
          tickLine={false} axisLine={false} width={compact ? 40 : 52}
          tick={{ fontSize: compact ? 10 : 11, fill: colors.gray400 }}
          tickFormatter={(v: number) => formatCurrencyCompact(v, currency)}
        />
        <Tooltip
          cursor={{ stroke: colors.gray200, strokeDasharray: "4 4" }}
          content={(tipProps: TooltipProps<number, string>) => {
            const { active, payload, label } = tipProps;
            if (!active || !payload?.length) return null;
            const net = (payload.find(p => p.dataKey === "net")?.value as number) ?? 0;
            const tax = (payload.find(p => p.dataKey === "tax")?.value as number) ?? 0;
            const total = net + tax;
            return (
              <Box sx={{
                bgcolor: colors.white, border: `1px solid ${colors.gray200}`,
                borderRadius: 3, boxShadow: shadow.md, px: 2, py: 1.5, minWidth: 160,
              }}>
                <Typography sx={{ fontSize: 11, color: colors.gray400, mb: 0.75 }}>{label}</Typography>
                <Stack spacing={0.5}>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.brand }}>Total</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{fmtCurrency(total, currency)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.success }}>Net</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{fmtCurrency(net, currency)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.error }}>Tax</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{fmtCurrency(tax, currency)}</Typography>
                  </Stack>
                </Stack>
              </Box>
            );
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
          content={() => {
            const items = [
              { label: "Total", color: colors.brand },
              { label: "Net", color: colors.success },
              { label: "Tax", color: colors.error },
            ];
            return (
              <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
                {items.map((item) => (
                  <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 16, height: 0, borderTop: `3px solid ${item.color}`, borderRadius: 2, display: "inline-block" }} />
                    <span style={{ color: item.color, fontWeight: 500 }}>{item.label}</span>
                  </span>
                ))}
              </div>
            );
          }}
        />
        <Line type="monotone" dataKey="total" name="Total" stroke={colors.brand}
          strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: colors.white, fill: colors.brand }}
          isAnimationActive animationDuration={600} animationEasing="ease-out" />
        <Line type="monotone" dataKey="net" name="Net" stroke={colors.success}
          strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: colors.white, fill: colors.success }}
          isAnimationActive animationDuration={600} animationEasing="ease-out" />
        <Line type="monotone" dataKey="tax" name="Tax" stroke={colors.error}
          strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: colors.white, fill: colors.error }}
          isAnimationActive animationDuration={600} animationEasing="ease-out" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Follows its data like the other income charts; recomputed by the page on filter/grouping change.
export default memo(IncomeLineChart);
