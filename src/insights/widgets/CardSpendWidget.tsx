import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Paper, Typography, Stack, LinearProgress, Button, Skeleton, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import { useUser } from "../../context/UserContext";
import { useTokens } from "../../context/ColorModeContext";
import { useSyncedConfig } from "../../utils/syncedConfig";
import { getCardSpends } from "../../api/client";
import type { CardSpendSummary } from "../../api/types";
import NumericField from "../../components/NumericField";
import { formatCurrency as fmt } from "../../utils/format";

/** Same key and shape the backend reads for the summary's budget fields. */
interface CardBudget {
  monthlyLimit: number | null;
}

/** Share of the budget used past which the bar turns red. */
const WARN_PCT = 80;

/**
 * Dashboard widget: credit card spend this calendar month against a monthly budget, and what is owed
 * across all cards. Spend comes from bank alert emails, so paying a bill never lowers it; debt is per
 * bank because a bank's cards share one limit.
 */
export default function CardSpendWidget() {
  const theme = useTheme();
  const navigate = useNavigate();
  const isDark = theme.palette.mode === "dark";
  const { userId, preferredCurrency } = useUser();
  const { colors } = useTokens();
  const [budget, setBudget] = useSyncedConfig<CardBudget>(userId, "card_budget", { monthlyLimit: null });
  const [summary, setSummary] = useState<CardSpendSummary | null>(null);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setError(false);
    getCardSpends(userId)
      .then(s => { if (!cancelled) setSummary(s); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [userId]);

  const success = isDark ? "#34D399" : colors.success;
  const spent = summary?.spent ?? 0;
  // Budget maths runs on the synced value so an edit shows at once, without refetching.
  const limit = budget.monthlyLimit;
  const left = limit != null ? limit - spent : null;
  const usedPct = limit ? (spent / limit) * 100 : 0;
  const now = new Date();
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
  const perDay = left != null ? Math.max(0, left) / daysLeft : null;
  const barColor = usedPct >= WARN_PCT ? colors.error : colors.brand;
  const monthLabel = now.toLocaleString("en-IN", { month: "long" });

  const startEdit = () => {
    setDraft(limit != null ? String(limit) : "");
    setEditing(true);
  };
  const saveBudget = () => {
    const n = Number(draft);
    setBudget({ monthlyLimit: draft.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : n });
    setEditing(false);
  };

  return (
    <Paper sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3, height: "100%", display: "flex", flexDirection: "column" }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: 1.5, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: alpha(colors.brand, 0.1), color: colors.brand }}>
          <CreditCardRoundedIcon sx={{ fontSize: 18 }} />
        </Box>
        <Typography onClick={() => navigate("/card-spends")} sx={{ fontSize: "0.9rem", fontWeight: 700, color: colors.gray500, cursor: "pointer", "&:hover": { color: colors.brand } }}>Card spend · {monthLabel}</Typography>
        <Box sx={{ flex: 1 }} />
        {!editing && (
          <Typography onClick={startEdit} sx={{ fontSize: "0.72rem", fontWeight: 600, color: colors.gray400, cursor: "pointer", "&:hover": { color: colors.brand } }}>
            {limit != null ? "Edit budget" : "Set budget"}
          </Typography>
        )}
      </Stack>

      {editing && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <NumericField
            label="Monthly budget" value={draft} onChange={setDraft}
            currency={preferredCurrency} maxDecimals={0} size="small" fullWidth autoFocus
            onKeyDown={e => { if (e.key === "Enter") saveBudget(); }}
          />
          <Button size="small" variant="contained" onClick={saveBudget}>Save</Button>
          <Button size="small" onClick={() => setEditing(false)}>Cancel</Button>
        </Stack>
      )}

      {error ? (
        <Typography sx={{ fontSize: "0.82rem", color: colors.gray400 }}>Could not load card spend.</Typography>
      ) : !summary ? (
        <Stack spacing={1}>
          <Skeleton variant="text" width="50%" height={36} />
          <Skeleton variant="rounded" height={7} />
          <Skeleton variant="text" width="70%" />
        </Stack>
      ) : (
        <>
          <Stack direction="row" alignItems="baseline" spacing={1}>
            <Typography sx={{ fontSize: "1.6rem", fontWeight: 800, color: colors.gray800 }}>{fmt(spent, preferredCurrency)}</Typography>
            {limit != null && (
              <Typography sx={{ fontSize: "0.82rem", color: colors.gray400 }}>of {fmt(limit, preferredCurrency)}</Typography>
            )}
          </Stack>

          {limit != null && left != null && perDay != null && (
            <>
              <LinearProgress
                variant="determinate" value={Math.min(100, usedPct)}
                sx={{ mt: 1, height: 7, borderRadius: 4, bgcolor: colors.gray100, "& .MuiLinearProgress-bar": { borderRadius: 4, bgcolor: barColor } }}
              />
              <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.75 }}>
                <Typography sx={{ fontSize: "0.75rem", fontWeight: 650, color: left < 0 ? colors.error : success }}>
                  {left < 0 ? `${fmt(-left, preferredCurrency)} over budget` : `${fmt(left, preferredCurrency)} left`}
                </Typography>
                <Typography sx={{ fontSize: "0.72rem", color: colors.gray400 }}>
                  {fmt(perDay, preferredCurrency, { maxDecimals: 0 })}/day · {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                </Typography>
              </Stack>
            </>
          )}

          <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px solid ${colors.gray100}` }}>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
              <Typography sx={{ fontSize: "0.78rem", fontWeight: 700, color: colors.gray500 }}>Total card debt</Typography>
              <Typography sx={{ fontSize: "1rem", fontWeight: 800, color: colors.gray800 }}>{fmt(summary.debt, preferredCurrency)}</Typography>
            </Stack>
            <Stack spacing={0.5}>
              {summary.byAccount.map(a => (
                <Stack key={a.accountId} direction="row" justifyContent="space-between">
                  <Typography sx={{ fontSize: "0.72rem", color: colors.gray400 }} noWrap>{a.name}</Typography>
                  <Typography sx={{ fontSize: "0.72rem", color: colors.gray400, flexShrink: 0, ml: 1 }}>
                    {fmt(a.spent, preferredCurrency)} spent · {fmt(a.debt, preferredCurrency)} owed
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        </>
      )}
    </Paper>
  );
}
