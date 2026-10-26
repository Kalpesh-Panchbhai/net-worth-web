import { useMemo } from "react";
import { Box, Typography, Stack } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ResponsiveContainer, ComposedChart, Area, Bar, Line, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { useTokens } from "../context/ColorModeContext";
import { fmt, fmtShort, type Forecast } from "./model";
import { dayLabel, daysInMonth, monthLabel, shiftMonth } from "./model";

/** Height of the soft stub drawn for a no-spend day, as a share of the tallest bar. */
const EMPTY_DAY_STUB = 0.03;

/**
 * Bars for each day's spend, a line for this month's running total and a faint line for last month's,
 * so being ahead of or behind last month is visible at once. A dashed line and band run from today to
 * the month-end forecast. Clicking a bar picks that day.
 */
export default function DailyChart({ month, daily, cumulative, prevCumulative, forecast, selectedDay, onSelectDay, currency, compact }: {
  month: string;
  /** Net spend per day (index 0 = day 1). */
  daily: number[];
  cumulative: number[];
  /** Last month's running total by day, or null when not loaded. */
  prevCumulative: number[] | null;
  /** Month-end forecast; only for the current month. */
  forecast: Forecast | null;
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
  currency: string;
  compact: boolean;
}) {
  const { colors } = useTokens();
  const today = new Date();
  const isCurrent = month === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const lastDay = isCurrent ? today.getDate() : daysInMonth(month);

  const data = useMemo(() => {
    const max = Math.max(...daily, 1);
    const from = lastDay - 1;
    const start = cumulative[from] ?? 0;
    // Straight from today's running total to the forecast at month end.
    const along = (i: number, end: number) => start + (end - start) * ((i - from) / Math.max(1, daily.length - 1 - from));
    return daily.map((amount, i) => ({
      day: i + 1,
      amount,
      // A no-spend day gets a tiny pale stub, so quiet days read as "good" rather than as missing data.
      bar: amount > 0 ? amount : i + 1 <= lastDay ? max * EMPTY_DAY_STUB : 0,
      // The running total stops at today, so the line doesn't run flat into the future.
      total: i + 1 <= lastDay ? cumulative[i] : null,
      prev: prevCumulative ? prevCumulative[Math.min(i, prevCumulative.length - 1)] : null,
      proj: forecast && i >= from ? along(i, forecast.expected) : null,
      band: forecast && i >= from ? [along(i, forecast.low), along(i, forecast.high)] : null,
    }));
  }, [daily, cumulative, prevCumulative, forecast, lastDay]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }} flexWrap="wrap">
        <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", flex: 1 }}>Spend by day</Typography>
        <Legend color={colors.brand} label="Running total" />
        {forecast && <Legend color={colors.brand} label="Forecast" dashed />}
        {prevCumulative && <Legend color={colors.gray300} label={monthLabel(shiftMonth(month, -1), "short")} dashed />}
      </Stack>
      <Box sx={{ height: compact ? 170 : 210, cursor: "pointer" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}
            onClick={e => {
              const day = e?.activePayload?.[0]?.payload?.day as number | undefined;
              if (day != null) onSelectDay(day === selectedDay ? null : day);
            }}>
            <XAxis dataKey="day" tickLine={false} axisLine={false} interval={compact ? 6 : 2} tick={{ fontSize: 11, fill: colors.gray400 }} />
            <YAxis yAxisId="day" hide />
            <YAxis yAxisId="total" hide orientation="right" />
            <Tooltip
              cursor={{ fill: alpha(colors.brand, 0.08) }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof data)[number];
                return (
                  <Box sx={{ bgcolor: colors.white, border: `1px solid ${colors.gray200}`, borderRadius: 2, px: 1.5, py: 1, boxShadow: 3 }}>
                    <Typography sx={{ fontSize: "0.75rem", fontWeight: 700 }}>{dayLabel(`${month}-${String(p.day).padStart(2, "0")}`)}</Typography>
                    <Typography sx={{ fontSize: "0.75rem" }}>{p.amount > 0 ? fmt(p.amount, currency) : "No spend"}</Typography>
                    {p.total != null && <Typography sx={{ fontSize: "0.72rem", color: colors.gray500 }}>Month so far {fmtShort(p.total, currency)}</Typography>}
                    {p.total == null && p.proj != null && <Typography sx={{ fontSize: "0.72rem", color: colors.gray500 }}>Forecast by then {fmtShort(Math.round(p.proj), currency)}</Typography>}
                    {p.prev != null && <Typography sx={{ fontSize: "0.72rem", color: colors.gray400 }}>Last month by now {fmtShort(p.prev, currency)}</Typography>}
                  </Box>
                );
              }} />
            <Bar yAxisId="day" dataKey="bar" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.map(d => (
                <Cell key={d.day}
                  fill={d.amount <= 0 ? colors.gray200 : selectedDay == null || selectedDay === d.day ? colors.brand : alpha(colors.brand, 0.3)} />
              ))}
            </Bar>
            {prevCumulative && (
              <Line yAxisId="total" dataKey="prev" stroke={colors.gray300} strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            )}
            {forecast && (
              <>
                <Area yAxisId="total" dataKey="band" stroke="none" fill={alpha(colors.brand, 0.1)} isAnimationActive={false} connectNulls={false} />
                <Line yAxisId="total" dataKey="proj" stroke={colors.brand} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
              </>
            )}
            <Line yAxisId="total" dataKey="total" stroke={colors.brand} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  const { colors } = useTokens();
  return (
    <Stack direction="row" alignItems="center" spacing={0.75}>
      <Box sx={{ width: 14, height: 0, borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }} />
      <Typography sx={{ fontSize: "0.72rem", color: colors.gray500 }}>{label}</Typography>
    </Stack>
  );
}
