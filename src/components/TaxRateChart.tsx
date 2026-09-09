import { memo, useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { TooltipProps } from "recharts";
import { Box, Typography, Stack } from "@mui/material";
import { useTheme, useMediaQuery } from "@mui/material";
import { useTokens } from "../context/ColorModeContext";
import type { IncomeChartPoint } from "./IncomeChart";

interface TaxRateChartProps {
  data: IncomeChartPoint[];
}

interface RatePoint {
  label: string;
  /** This group's tax / gross, as a %. Null when the group has no gross income. */
  periodRate: number | null;
  /** Running tax / running gross up to this group, as a % — the smoothed effective-rate trend. */
  cumRate: number | null;
}

const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);

/**
 * Effective tax-rate trend for income: tax ÷ gross, both per group and cumulatively. Reads the
 * page's already-filtered, grouped and sorted series, so it respects every filter and grouping.
 */
function TaxRateChart({ data }: TaxRateChartProps) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, shadow } = useTokens();

  const points = useMemo<RatePoint[]>(() => {
    let runTax = 0;
    let runGross = 0;
    return data.map(d => {
      const gross = d.net + d.tax;
      runTax += d.tax;
      runGross += gross;
      return {
        label: d.label,
        periodRate: gross > 0 ? (d.tax / gross) * 100 : null,
        cumRate: runGross > 0 ? (runTax / runGross) * 100 : null,
      };
    });
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height={compact ? 220 : 300}>
      <LineChart data={points} margin={{ top: 4, right: compact ? 4 : 8, left: compact ? -20 : 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={colors.gray100} />
        <XAxis
          dataKey="label" tickLine={false} axisLine={false}
          tick={{ fontSize: compact ? 10 : 11, fill: colors.gray500 }}
          interval={compact ? "preserveStartEnd" : undefined}
        />
        <YAxis
          tickLine={false} axisLine={false} width={compact ? 40 : 52}
          tick={{ fontSize: compact ? 10 : 11, fill: colors.gray400 }}
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          domain={[0, (max: number) => Math.ceil((max + 5) / 5) * 5]}
        />
        <Tooltip
          cursor={{ stroke: colors.gray200, strokeDasharray: "4 4" }}
          content={(tipProps: TooltipProps<number, string>) => {
            const { active, payload, label } = tipProps;
            if (!active || !payload?.length) return null;
            const dp = payload[0]?.payload as RatePoint | undefined;
            if (!dp) return null;
            return (
              <Box sx={{
                bgcolor: colors.white, border: `1px solid ${colors.gray200}`,
                borderRadius: 3, boxShadow: shadow.md, px: 2, py: 1.5, minWidth: 180,
              }}>
                <Typography sx={{ fontSize: 11, color: colors.gray400, mb: 0.75 }}>{label}</Typography>
                <Stack spacing={0.5}>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.accent }}>This period</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{pct(dp.periodRate)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.brand }}>Effective (to date)</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{pct(dp.cumRate)}</Typography>
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
              { label: "Per period", color: colors.accent },
              { label: "Effective (to date)", color: colors.brand },
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
        <Line type="monotone" dataKey="periodRate" name="Per period" stroke={colors.accent}
          strokeWidth={2} dot={false} connectNulls
          activeDot={{ r: 4, strokeWidth: 2, stroke: colors.white, fill: colors.accent }}
          isAnimationActive animationDuration={600} animationEasing="ease-out" />
        <Line type="monotone" dataKey="cumRate" name="Effective (to date)" stroke={colors.brand}
          strokeWidth={2.5} dot={false} connectNulls
          activeDot={{ r: 4, strokeWidth: 2, stroke: colors.white, fill: colors.brand }}
          isAnimationActive animationDuration={600} animationEasing="ease-out" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Follows its data like the other income charts; recomputed by the page on filter/grouping change.
export default memo(TaxRateChart);
