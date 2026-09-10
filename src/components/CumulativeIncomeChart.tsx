import { memo, useMemo } from "react";
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { TooltipProps } from "recharts";
import { Box, Typography, Stack } from "@mui/material";
import { useTheme, useMediaQuery } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useTokens } from "../context/ColorModeContext";
import { formatCurrency as fmtCurrency, formatCurrencyCompact } from "../utils/format";
import type { IncomeChartPoint } from "./IncomeChart";

interface CumulativeIncomeChartProps {
  data: IncomeChartPoint[];
  currency?: string;
  /**
   * Future period labels (already in the page's display format) to project onto. Empty for
   * non-time groupings where a forecast is meaningless. When present, a dashed Total line
   * continues past the last group at the average run-rate.
   */
  forecastLabels?: string[];
}

interface Row {
  label: string;
  cumTotal: number | null;
  cumNet: number | null;
  cumTax: number | null;
  /** Average per group up to and including this one (cumulative / count). */
  avgTotal: number | null;
  avgNet: number | null;
  avgTax: number | null;
  /** Projected cumulative Total/Net/Tax; each carries the last actual value too, so the dashed line joins on. */
  fcTotal: number | null;
  fcNet: number | null;
  fcTax: number | null;
  /** [lower, upper] ±1σ range around each projection (recharts range area). Null on actual points. */
  fcBand: [number, number] | null;
  fcBandNet: [number, number] | null;
  fcBandTax: [number, number] | null;
  projected: boolean;
  runRate?: number;
  runRateNet?: number;
  runRateTax?: number;
}

/**
 * Running-total line chart for income. Accumulates `data` in the order it is given — which the page
 * has already filtered, grouped and sorted (chronologically for month/year/FY) — so the curve runs
 * from the first group through to the last and respects every filter and grouping choice.
 * Optionally continues the Total as a dashed forecast at the average run-rate.
 */
function CumulativeIncomeChart({ data, currency, forecastLabels }: CumulativeIncomeChartProps) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, shadow } = useTokens();

  const { rows, hasForecast } = useMemo(() => {
    let runNet = 0;
    let runTax = 0;
    let runTotal = 0;
    const rows: Row[] = data.map((d, i) => {
      runNet += d.net;
      runTax += d.tax;
      runTotal += d.net + d.tax;
      const count = i + 1;
      return {
        label: d.label, cumTotal: runTotal, cumNet: runNet, cumTax: runTax,
        avgTotal: runTotal / count, avgNet: runNet / count, avgTax: runTax / count,
        fcTotal: null, fcNet: null, fcTax: null,
        fcBand: null, fcBandNet: null, fcBandTax: null, projected: false,
      };
    });

    const n = data.length;
    const labels = forecastLabels ?? [];
    const rate = n ? runTotal / n : 0; // average per-period total = expected run-rate
    const rateNet = n ? runNet / n : 0;
    const rateTax = n ? runTax / n : 0;
    const hasForecast = n >= 2 && labels.length > 0 && rate > 0;
    if (hasForecast) {
      // Spread of per-period income (sample std dev). Over k future periods the cumulative
      // uncertainty compounds as sigma*sqrt(k), giving each band its widening cone.
      const stdDev = (values: number[], mean: number) =>
        Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
      const sigma = stdDev(data.map(d => d.net + d.tax), rate);
      const sigmaNet = stdDev(data.map(d => d.net), rateNet);
      const sigmaTax = stdDev(data.map(d => d.tax), rateTax);

      const last = rows[rows.length - 1];
      last.fcTotal = runTotal; last.fcNet = runNet; last.fcTax = runTax; // anchor dashed lines to the solid ones
      last.fcBand = [runTotal, runTotal];                                // bands start at zero width here
      last.fcBandNet = [runNet, runNet];
      last.fcBandTax = [runTax, runTax];
      let fc = runTotal, fcNet = runNet, fcTax = runTax;
      labels.forEach((label, k) => {
        const spread = Math.sqrt(k + 1);
        fc += rate; fcNet += rateNet; fcTax += rateTax;
        const half = sigma * spread;
        const halfNet = sigmaNet * spread;
        const halfTax = sigmaTax * spread;
        // cumulative income can't fall below what's already earned
        rows.push({
          label, cumTotal: null, cumNet: null, cumTax: null,
          avgTotal: null, avgNet: null, avgTax: null,
          fcTotal: fc, fcNet, fcTax,
          fcBand: [Math.max(runTotal, fc - half), fc + half],
          fcBandNet: [Math.max(runNet, fcNet - halfNet), fcNet + halfNet],
          fcBandTax: [Math.max(runTax, fcTax - halfTax), fcTax + halfTax],
          projected: true, runRate: rate, runRateNet: rateNet, runRateTax: rateTax,
        });
      });
    }
    return { rows, hasForecast };
  }, [data, forecastLabels]);

  return (
    <ResponsiveContainer width="100%" height={compact ? 240 : 340}>
      <ComposedChart data={rows} margin={{ top: 4, right: compact ? 4 : 8, left: compact ? -20 : 0, bottom: 0 }}>
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
            const dp = payload[0]?.payload as Row | undefined;
            if (!dp) return null;
            const boxSx = {
              bgcolor: colors.white, border: `1px solid ${colors.gray200}`,
              borderRadius: 3, boxShadow: shadow.md, px: 2, py: 1.5, minWidth: 190,
            } as const;
            const money = (v: number | null) => fmtCurrency(v ?? 0, currency);

            if (dp.projected) {
              return (
                <Box sx={boxSx}>
                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
                    <Typography sx={{ fontSize: 11, color: colors.gray400 }}>{label}</Typography>
                    <Box sx={{ px: 0.75, py: 0.15, borderRadius: 1, bgcolor: colors.gray100, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: colors.gray500 }}>
                      Projected
                    </Box>
                  </Stack>
                  <Stack spacing={0.5}>
                    <Stack direction="row" justifyContent="space-between" spacing={2}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.brand }}>Projected Total</Typography>
                      <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{money(dp.fcTotal)}</Typography>
                    </Stack>
                    {dp.fcBand && (
                      <Stack direction="row" justifyContent="space-between" spacing={2}>
                        <Typography sx={{ fontSize: 11, fontWeight: 500, color: colors.gray400 }}>Range (±1σ)</Typography>
                        <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray500 }}>{money(dp.fcBand[0])} – {money(dp.fcBand[1])}</Typography>
                      </Stack>
                    )}
                    <Stack direction="row" justifyContent="space-between" spacing={2}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.success }}>Projected Net</Typography>
                      <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{money(dp.fcNet)}</Typography>
                    </Stack>
                    {dp.fcBandNet && (
                      <Stack direction="row" justifyContent="space-between" spacing={2}>
                        <Typography sx={{ fontSize: 11, fontWeight: 500, color: colors.gray400 }}>Range (±1σ)</Typography>
                        <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray500 }}>{money(dp.fcBandNet[0])} – {money(dp.fcBandNet[1])}</Typography>
                      </Stack>
                    )}
                    <Stack direction="row" justifyContent="space-between" spacing={2}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.error }}>Projected Tax</Typography>
                      <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{money(dp.fcTax)}</Typography>
                    </Stack>
                    {dp.fcBandTax && (
                      <Stack direction="row" justifyContent="space-between" spacing={2}>
                        <Typography sx={{ fontSize: 11, fontWeight: 500, color: colors.gray400 }}>Range (±1σ)</Typography>
                        <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.gray500 }}>{money(dp.fcBandTax[0])} – {money(dp.fcBandTax[1])}</Typography>
                      </Stack>
                    )}
                  </Stack>
                  <Box sx={{ borderTop: `1px solid ${colors.gray200}`, pt: 0.5, mt: 0.4 }}>
                    <Typography sx={{ fontSize: 11, color: colors.gray400 }}>
                      At avg run-rate {money(dp.runRate ?? null)}/period
                    </Typography>
                  </Box>
                </Box>
              );
            }

            return (
              <Box sx={boxSx}>
                <Typography sx={{ fontSize: 11, color: colors.gray400, mb: 0.75 }}>{label}</Typography>
                <Stack spacing={0.5}>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.brand }}>Cumulative Total</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{money(dp.cumTotal)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.success }}>Cumulative Net</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{money(dp.cumNet)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.error }}>Cumulative Tax</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{money(dp.cumTax)}</Typography>
                  </Stack>
                  <Box sx={{ borderTop: `1px solid ${colors.gray200}`, pt: 0.6, mt: 0.35 }}>
                    <Typography sx={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: colors.gray400, mb: 0.4 }}>
                      Average to date
                    </Typography>
                    <Stack spacing={0.5}>
                      <Stack direction="row" justifyContent="space-between" spacing={2}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.brand }}>Avg Total</Typography>
                        <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{money(dp.avgTotal)}</Typography>
                      </Stack>
                      <Stack direction="row" justifyContent="space-between" spacing={2}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.success }}>Avg Net</Typography>
                        <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{money(dp.avgNet)}</Typography>
                      </Stack>
                      <Stack direction="row" justifyContent="space-between" spacing={2}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.error }}>Avg Tax</Typography>
                        <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{money(dp.avgTax)}</Typography>
                      </Stack>
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            );
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
          content={() => {
            const items: { label: string; color: string; kind: "solid" | "dashed" | "band" }[] = [
              { label: "Cumulative Total", color: colors.brand, kind: "solid" },
              { label: "Cumulative Net", color: colors.success, kind: "solid" },
              { label: "Cumulative Tax", color: colors.error, kind: "solid" },
              ...(hasForecast ? [
                { label: "Forecast (avg)", color: colors.gray500, kind: "dashed" as const },
                { label: "Range (±1σ)", color: colors.gray500, kind: "band" as const },
              ] : []),
            ];
            return (
              <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
                {items.map((item) => (
                  <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {item.kind === "band"
                      ? <span style={{ width: 16, height: 10, background: alpha(item.color, 0.14), border: `1px solid ${alpha(item.color, 0.35)}`, borderRadius: 2, display: "inline-block" }} />
                      : <span style={{ width: 16, height: 0, borderTop: `${item.kind === "dashed" ? "2px dashed" : "3px solid"} ${item.color}`, borderRadius: 2, display: "inline-block" }} />}
                    <span style={{ color: item.color, fontWeight: 500 }}>{item.label}</span>
                  </span>
                ))}
              </div>
            );
          }}
        />
        {hasForecast && (
          <Area type="monotone" dataKey="fcBand" name="Forecast range" stroke="none"
            fill={alpha(colors.brand, 0.14)} isAnimationActive={false} legendType="none" tooltipType="none" />
        )}
        {hasForecast && (
          <Area type="monotone" dataKey="fcBandNet" name="Forecast range (Net)" stroke="none"
            fill={alpha(colors.success, 0.14)} isAnimationActive={false} legendType="none" tooltipType="none" />
        )}
        {hasForecast && (
          <Area type="monotone" dataKey="fcBandTax" name="Forecast range (Tax)" stroke="none"
            fill={alpha(colors.error, 0.14)} isAnimationActive={false} legendType="none" tooltipType="none" />
        )}
        <Line type="monotone" dataKey="cumTotal" name="Cumulative Total" stroke={colors.brand}
          strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: colors.white, fill: colors.brand }}
          isAnimationActive animationDuration={600} animationEasing="ease-out" />
        <Line type="monotone" dataKey="cumNet" name="Cumulative Net" stroke={colors.success}
          strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: colors.white, fill: colors.success }}
          isAnimationActive animationDuration={600} animationEasing="ease-out" />
        <Line type="monotone" dataKey="cumTax" name="Cumulative Tax" stroke={colors.error}
          strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: colors.white, fill: colors.error }}
          isAnimationActive animationDuration={600} animationEasing="ease-out" />
        {hasForecast && (
          <Line type="monotone" dataKey="fcTotal" name="Forecast" stroke={colors.brand}
            strokeWidth={2} strokeDasharray="5 4" dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: colors.white, fill: colors.brand }}
            isAnimationActive={false} />
        )}
        {hasForecast && (
          <Line type="monotone" dataKey="fcNet" name="Forecast (Net)" stroke={colors.success}
            strokeWidth={2} strokeDasharray="5 4" dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: colors.white, fill: colors.success }}
            isAnimationActive={false} legendType="none" />
        )}
        {hasForecast && (
          <Line type="monotone" dataKey="fcTax" name="Forecast (Tax)" stroke={colors.error}
            strokeWidth={2} strokeDasharray="5 4" dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: colors.white, fill: colors.error }}
            isAnimationActive={false} legendType="none" />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Follows its data like IncomeChart; the page recomputes it on every filter/grouping change.
export default memo(CumulativeIncomeChart);
