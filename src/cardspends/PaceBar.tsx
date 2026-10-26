import { useState } from "react";
import { Box, Paper, Typography, Stack, Tooltip, Button } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useTokens } from "../context/ColorModeContext";
import NumericField from "../components/NumericField";
import { fmt, type Forecast } from "./model";
import { formatCurrency } from "../utils/format";
import { daysInMonth, monthLabel, shiftMonth } from "./model";

/** Within this share of the budget the bar turns amber, before it is actually over. */
const NEAR_PCT = 0.9;

/** "▲ 18% vs Sep" against last month's total; nothing when last month had no spend. */
export function VsLastMonth({ now, prev, month }: { now: number; prev: number | null; month: string }) {
  const { colors } = useTokens();
  if (prev == null || prev <= 0) return null;
  const pct = ((now - prev) / prev) * 100;
  const up = pct > 0;
  return (
    <Typography component="span" sx={{ fontSize: "0.75rem", fontWeight: 650, color: Math.abs(pct) < 1 ? colors.gray400 : up ? colors.error : colors.success }}>
      {Math.abs(pct) < 1 ? "≈" : up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}% vs {monthLabel(shiftMonth(month, -1), "short")}
    </Typography>
  );
}

/** Forecast amounts are estimates, so they drop the paise. */
const whole = (v: number, currency: string) => formatCurrency(Math.round(v), currency, { maxDecimals: 0 });

/** "Heading for ₹52,000 by month end · ≈ ₹6,000 over budget" */
export function ForecastLine({ forecast, limit, currency }: { forecast: Forecast; limit: number | null; currency: string }) {
  const { colors } = useTokens();
  const gap = limit != null ? forecast.expected - limit : null;
  return (
    <Typography sx={{ fontSize: "0.78rem", color: colors.gray500 }}>
      Heading for <b>{whole(forecast.expected, currency)}</b> by month end
      {gap != null && (
        <Typography component="span" sx={{ fontSize: "inherit", fontWeight: 650, color: gap > 0 ? colors.error : colors.success }}>
          {" "}· ≈ {whole(Math.abs(gap), currency)} {gap > 0 ? "over" : "under"} budget
        </Typography>
      )}
    </Typography>
  );
}

/**
 * The month at a glance: spend against budget, the projected rest of the month and a budget tick on
 * one bar (scaled so an overshoot stays visible), one plain sentence on what that means, and a row
 * of supporting numbers.
 */
export default function PaceBar({ spent, limit, budget, onBudgetChange, forecast, month, isCurrentMonth, prevTotal, prevSameDay, currency }: {
  spent: number;
  /** The budget to pace against; null when there is none or the view is filtered. */
  limit: number | null;
  /** The saved monthly budget, edited here regardless of filters. */
  budget: number | null;
  onBudgetChange: (monthlyLimit: number | null) => void;
  /** Month-end forecast; only for the current month. */
  forecast: Forecast | null;
  month: string;
  isCurrentMonth: boolean;
  /** Last month's whole-month spend. */
  prevTotal: number | null;
  /** Last month's spend by the same day of the month. */
  prevSameDay: number | null;
  currency: string;
}) {
  const { colors } = useTokens();
  const [draft, setDraft] = useState<string | null>(null);
  const saveBudget = () => {
    const n = Number(draft);
    onBudgetChange(draft == null || draft.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : n);
    setDraft(null);
  };
  const days = daysInMonth(month);
  const today = isCurrentMonth ? new Date().getDate() : days;
  const daysLeft = days - today + 1;
  const expectedPct = today / days;
  const usedPct = limit ? spent / limit : 0;
  const over = limit != null && spent > limit;
  const projectedOver = limit != null && forecast != null && forecast.expected > limit;
  const monthEnd = `${monthLabel(month, "short")} ${days}`;

  const color = limit == null ? colors.brand
    : usedPct > 1 ? colors.error
    : usedPct >= NEAR_PCT || usedPct > expectedPct || projectedOver ? colors.warning
    : colors.success;

  // Everything on the bar shares one scale, wide enough for the budget, the spend and the forecast.
  const scale = Math.max(limit ?? 0, spent, forecast?.expected ?? 0, 1);
  const pos = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;

  let sentence: string;
  if (limit == null) {
    sentence = forecast
      ? `Heading for ${whole(forecast.expected, currency)} by ${monthEnd}.`
      : prevSameDay != null && isCurrentMonth
        ? `By this day last month you had spent ${fmt(prevSameDay, currency)}.`
        : "Set a monthly budget to track your pace.";
  } else if (over) {
    sentence = `${fmt(spent - limit, currency)} over budget`
      + (forecast ? `, heading for ${whole(forecast.expected - limit, currency)} over by ${monthEnd}.` : ".");
  } else if (!isCurrentMonth) {
    sentence = `Finished ${fmt(limit - spent, currency)} under budget.`;
  } else {
    const perDay = (limit - spent) / daysLeft;
    sentence = `You can spend ${fmt(perDay, currency)}/day for the next ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`
      + (forecast
        ? projectedOver
          ? ` At this pace you'll end ≈ ${whole(forecast.expected - limit, currency)} over.`
          : ` At this pace you'll finish ≈ ${whole(limit - forecast.expected, currency)} under.`
        : usedPct > expectedPct ? " You're ahead of pace." : "");
  }

  const stats: { label: string; value: string; note?: string }[] = [];
  if (forecast) {
    stats.push({ label: `Projected by ${monthEnd}`, value: whole(forecast.expected, currency),
      note: `${whole(forecast.low, currency)} – ${whole(forecast.high, currency)}` });
  }
  stats.push({ label: "Daily average", value: whole(spent / today, currency) });
  if (isCurrentMonth && prevSameDay != null) stats.push({ label: "Last month by now", value: whole(prevSameDay, currency) });
  else if (prevTotal != null) stats.push({ label: "Last month", value: whole(prevTotal, currency) });

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, height: "100%", display: "flex", flexDirection: "column", gap: 1.25 }}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" flexWrap="wrap" sx={{ columnGap: 1 }}>
        <Typography variant="overline" sx={{ fontSize: { xs: "0.6rem", sm: "0.75rem" } }}>Spent</Typography>
        <Stack direction="row" alignItems="baseline" spacing={1.5}>
          <VsLastMonth now={spent} prev={isCurrentMonth ? prevSameDay : prevTotal} month={month} />
          {draft == null && (
            <Typography onClick={() => setDraft(budget != null ? String(budget) : "")} sx={{ fontSize: "0.72rem", fontWeight: 600, color: colors.gray400, cursor: "pointer", "&:hover": { color: colors.brand } }}>
              {budget != null ? "Edit budget" : "Set budget"}
            </Typography>
          )}
        </Stack>
      </Stack>
      {draft != null && (
        <Stack direction="row" spacing={1} alignItems="center">
          <NumericField
            label="Monthly budget" value={draft} onChange={setDraft}
            currency={currency} maxDecimals={0} size="small" fullWidth autoFocus
            onKeyDown={e => { if (e.key === "Enter") saveBudget(); }}
          />
          <Button size="small" variant="contained" onClick={saveBudget}>Save</Button>
          <Button size="small" onClick={() => setDraft(null)}>Cancel</Button>
        </Stack>
      )}
      <Stack direction="row" alignItems="baseline" spacing={1} flexWrap="wrap">
        <Typography sx={{ fontSize: { xs: "1.6rem", sm: "2.1rem" }, fontWeight: 800, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
          {fmt(spent, currency)}
        </Typography>
        {limit != null && (
          <Typography sx={{ fontSize: "0.85rem", color: colors.gray400 }}>of {fmt(limit, currency)}</Typography>
        )}
        {isCurrentMonth && (
          <Typography sx={{ fontSize: "0.78rem", color: colors.gray400, ml: "auto !important" }}>day {today} of {days}</Typography>
        )}
      </Stack>

      {(limit != null || forecast) && (
        <Box sx={{ mt: 0.5, mb: limit != null ? 1.5 : 0 }}>
          <Box sx={{ position: "relative", height: 10, borderRadius: 5, bgcolor: colors.gray100 }}
            role="meter" aria-valuemin={0} aria-valuemax={scale} aria-valuenow={spent} aria-label="Spend against budget">
            {forecast && forecast.expected > spent && (
              <Tooltip title={`Projected by ${monthEnd}: ${whole(forecast.expected, currency)}`}>
                <Box sx={{
                  position: "absolute", top: 0, bottom: 0, left: 0, width: pos(forecast.expected), borderRadius: 5,
                  background: `repeating-linear-gradient(-45deg, ${alpha(color, 0.35)} 0 4px, ${alpha(color, 0.15)} 4px 8px)`,
                }} />
              </Tooltip>
            )}
            <Box sx={{
              position: "absolute", top: 0, bottom: 0, left: 0, width: pos(spent),
              borderRadius: 5, bgcolor: color, transition: "width 0.4s ease, background-color 0.2s ease",
            }} />
            {limit != null && isCurrentMonth && !over && (
              <Tooltip title={`Where you'd be at an even pace: ${fmt(limit * expectedPct, currency)}`}>
                <Box sx={{
                  position: "absolute", top: -3, bottom: -3, left: `calc(${pos(limit * expectedPct)} - 1px)`, width: 2,
                  borderRadius: 1, bgcolor: alpha(colors.gray700, 0.6),
                }} />
              </Tooltip>
            )}
            {limit != null && (
              <>
                <Box sx={{
                  position: "absolute", top: -5, bottom: -5, left: `calc(${pos(limit)} - 1px)`, width: 2,
                  borderRadius: 1, bgcolor: colors.gray700, boxShadow: `0 0 0 2px ${alpha(colors.white, 0.8)}`,
                }} />
                <Typography sx={{
                  position: "absolute", top: 14, left: pos(limit), transform: limit / scale > 0.85 ? "translateX(-100%)" : "translateX(-50%)",
                  fontSize: "0.68rem", color: colors.gray400, whiteSpace: "nowrap",
                }}>
                  Budget
                </Typography>
              </>
            )}
          </Box>
        </Box>
      )}

      <Typography sx={{ fontSize: "0.82rem", fontWeight: 550, color: over ? colors.error : projectedOver ? colors.warning : colors.gray600 }}>
        {sentence}
      </Typography>

      <Box sx={{
        mt: "auto", pt: 1.5, borderTop: `1px solid ${colors.gray100}`,
        display: "grid", gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, gap: 1.5,
      }}>
        {stats.map(st => (
          <Box key={st.label} sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: "0.7rem", color: colors.gray400 }}>{st.label}</Typography>
            <Typography noWrap sx={{ fontSize: "0.95rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{st.value}</Typography>
            {st.note && <Typography noWrap sx={{ fontSize: "0.68rem", color: colors.gray400 }}>{st.note}</Typography>}
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
