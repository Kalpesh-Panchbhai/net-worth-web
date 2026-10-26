import { useState } from "react";
import { Box, Paper, Typography, Stack, Tooltip, Button } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useTokens } from "../context/ColorModeContext";
import NumericField from "../components/NumericField";
import { fmt, fmtShort } from "./model";
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

/**
 * The month at a glance: spend against budget with a marker for where spend "should" be by today,
 * coloured by pace, plus one plain sentence on what that means for the rest of the month.
 */
export default function PaceBar({ spent, limit, budget, onBudgetChange, month, isCurrentMonth, prevTotal, prevSameDay, currency }: {
  spent: number;
  /** The budget to pace against; null when there is none or the view is filtered. */
  limit: number | null;
  /** The saved monthly budget, edited here regardless of filters. */
  budget: number | null;
  onBudgetChange: (monthlyLimit: number | null) => void;
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

  const color = limit == null ? colors.brand
    : usedPct > 1 ? colors.error
    : usedPct >= NEAR_PCT || usedPct > expectedPct ? colors.warning
    : colors.success;

  let sentence: string;
  if (limit == null) {
    sentence = prevSameDay != null && isCurrentMonth
      ? `By this day last month you had spent ${fmt(prevSameDay, currency)}.`
      : "Set a monthly budget to track your pace.";
  } else if (spent > limit) {
    sentence = `${fmt(spent - limit, currency)} over budget.`
      + (prevTotal != null && prevTotal > 0 ? ` Last month you finished at ${fmtShort(prevTotal, currency)}.` : "");
  } else if (!isCurrentMonth) {
    sentence = `Finished ${fmt(limit - spent, currency)} under budget.`;
  } else {
    const perDay = (limit - spent) / daysLeft;
    sentence = `You can spend ${fmt(perDay, currency)}/day for the next ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`
      + (usedPct > expectedPct ? " You're ahead of pace." : "");
  }

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

      {limit != null && (
        <Box sx={{ position: "relative", height: 10, borderRadius: 5, bgcolor: colors.gray100, mt: 0.5 }}
          role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={spent} aria-label="Budget used">
          <Box sx={{
            position: "absolute", inset: 0, width: `${Math.min(100, usedPct * 100)}%`,
            borderRadius: 5, bgcolor: color, transition: "width 0.4s ease, background-color 0.2s ease",
          }} />
          {isCurrentMonth && (
            <Tooltip title={`Where you'd be at an even pace: ${fmt(limit * expectedPct, currency)}`}>
              <Box sx={{
                position: "absolute", top: -4, bottom: -4, left: `calc(${expectedPct * 100}% - 1px)`, width: 2,
                borderRadius: 1, bgcolor: colors.gray700, boxShadow: `0 0 0 2px ${alpha(colors.white, 0.8)}`,
              }} />
            </Tooltip>
          )}
        </Box>
      )}

      <Typography sx={{ fontSize: "0.82rem", fontWeight: 550, color: limit != null && spent > limit ? colors.error : colors.gray600 }}>
        {sentence}
      </Typography>
    </Paper>
  );
}
