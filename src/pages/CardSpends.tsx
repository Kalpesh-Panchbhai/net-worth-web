import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Box, Paper, Typography, TextField, Button, MenuItem, Fab, IconButton, Stack, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions, ToggleButton, ToggleButtonGroup,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CreditCardOffOutlinedIcon from "@mui/icons-material/CreditCardOffOutlined";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip } from "recharts";
import { useUser } from "../context/UserContext";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import { useSyncedConfig } from "../utils/syncedConfig";
import {
  getCardSpends, getCardSpendList, createCardSpend, updateCardSpend, deleteCardSpend, invalidateCache,
} from "../api/client";
import { EmptyState, ErrorState, ListSkeleton, MetricCard, MetricSkeleton, TintedChip, FadeIn } from "../components/shared";
import NumericField, { isAmount } from "../components/NumericField";
import type { CardSpend, CardSpendSummary } from "../api/types";
import { formatCurrency as fmt } from "../utils/format";

/** "2026-10" for the month containing `d`, in local time. */
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const shiftMonth = (key: string, by: number) => {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + by, 1));
};
const todayIso = () => {
  const d = new Date();
  return `${monthKey(d)}-${String(d.getDate()).padStart(2, "0")}`;
};
const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

type SortBy = "date" | "amount";

interface FormState {
  id: number | null;
  accountId: number | "";
  cardLast4: string;
  spentOn: string;
  amount: string;
}

/**
 * Every credit card purchase in a month, for analysing and correcting what the alert emails
 * recorded. Spends can be added by hand, edited (email rows are then marked "edited") and deleted.
 * Debt is not affected: it comes from each card's balance, not from these rows.
 */
function CardSpends() {
  const { userId, preferredCurrency } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors } = useTokens();
  const { showToast } = useToast();
  const [budget] = useSyncedConfig<{ monthlyLimit: number | null }>(userId, "card_budget", { monthlyLimit: null });

  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [summary, setSummary] = useState<CardSpendSummary | null>(null);
  const [spends, setSpends] = useState<CardSpend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date");

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CardSpend | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true); setError(null);
      const [s, list] = await Promise.all([getCardSpends(userId, month), getCardSpendList(userId, month)]);
      setSummary(s); setSpends(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load card spends");
    } finally {
      setLoading(false);
    }
  }, [userId, month]);

  useEffect(() => { load(); }, [load]);

  const cards = summary?.byAccount ?? [];
  const isCurrentMonth = month === monthKey(new Date());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/,/g, "");
    const rows = spends.filter(s =>
      (accountFilter === "all" || s.accountId === accountFilter)
      && (!q || String(s.amount).includes(q) || s.accountName.toLowerCase().includes(q) || (s.cardLast4 ?? "").includes(q)));
    return sortBy === "amount" ? [...rows].sort((a, b) => b.amount - a.amount) : rows;
  }, [spends, accountFilter, search, sortBy]);

  const spent = filtered.reduce((sum, s) => sum + s.amount, 0);
  const debt = cards.filter(c => accountFilter === "all" || c.accountId === accountFilter).reduce((sum, c) => sum + c.debt, 0);
  // The budget covers all cards, so "left" only makes sense unfiltered.
  const limit = accountFilter === "all" ? budget.monthlyLimit : null;
  const left = limit != null ? limit - spent : null;
  const now = new Date();
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;

  // One bar per day of the month, from the filtered rows.
  const daily = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    const totals = Array.from({ length: days }, (_, i) => ({ day: i + 1, amount: 0 }));
    for (const s of filtered) totals[Number(s.spentOn.slice(8, 10)) - 1].amount += s.amount;
    return totals;
  }, [filtered, month]);

  const byCard = useMemo(() => {
    const map = new Map<number, { name: string; amount: number }>();
    for (const s of filtered) {
      const e = map.get(s.accountId) ?? { name: s.accountName, amount: 0 };
      e.amount += s.amount;
      map.set(s.accountId, e);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  // Date order groups rows under a day header; amount order is one flat list.
  const groups = useMemo(() => {
    if (sortBy === "amount") return [{ day: null as string | null, total: spent, rows: filtered }];
    const out: { day: string | null; total: number; rows: CardSpend[] }[] = [];
    for (const s of filtered) {
      const last = out[out.length - 1];
      if (last && last.day === s.spentOn) { last.rows.push(s); last.total += s.amount; }
      else out.push({ day: s.spentOn, total: s.amount, rows: [s] });
    }
    return out;
  }, [filtered, sortBy, spent]);

  const openAdd = () => setForm({
    id: null,
    accountId: accountFilter !== "all" ? accountFilter : cards.length === 1 ? cards[0].accountId : "",
    cardLast4: "",
    spentOn: isCurrentMonth ? todayIso() : `${month}-01`,
    amount: "",
  });
  const openEdit = (s: CardSpend) => setForm({
    id: s.id, accountId: s.accountId, cardLast4: s.cardLast4 ?? "", spentOn: s.spentOn, amount: String(s.amount),
  });

  const last4Valid = !form || form.cardLast4 === "" || /^\d{4}$/.test(form.cardLast4);
  const formValid = !!form && form.accountId !== "" && !!form.spentOn && isAmount(form.amount) && Number(form.amount) > 0 && last4Valid;

  const handleSave = async () => {
    if (!form || !formValid) return;
    const data = {
      accountId: form.accountId as number,
      amount: Number(form.amount),
      spentOn: form.spentOn,
      cardLast4: form.cardLast4 || null,
    };
    setSaving(true);
    try {
      if (form.id == null) await createCardSpend(data);
      else await updateCardSpend(form.id, data);
      invalidateCache("/card-spends");
      showToast(form.id == null ? "Spend added" : "Spend updated");
      setForm(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save spend", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const prev = spends;
    setDeleteTarget(null);
    setSpends(s => s.filter(x => x.id !== target.id));
    try {
      await deleteCardSpend(target.id);
      invalidateCache("/card-spends");
      showToast("Spend deleted");
      load();
    } catch (err) {
      setSpends(prev);
      showToast(err instanceof Error ? err.message : "Failed to delete spend", "error");
    }
  };

  if (error && !summary && !loading) {
    return <ErrorState message={error} onRetry={load} />;
  }

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }} sx={{ pb: 10 }}>
      {/* ── Month, card filter, search ── */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "stretch", sm: "center" }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <IconButton size="small" onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Previous month"><ChevronLeftRoundedIcon /></IconButton>
          <Typography sx={{ fontWeight: 700, fontSize: "1.05rem", minWidth: 140, textAlign: "center" }}>{monthLabel}</Typography>
          <IconButton size="small" onClick={() => setMonth(m => shiftMonth(m, 1))} disabled={isCurrentMonth} aria-label="Next month"><ChevronRightRoundedIcon /></IconButton>
        </Stack>
        <Box sx={{ flex: 1 }} />
        <TextField select size="small" label="Card" value={accountFilter} sx={{ minWidth: 180 }}
          onChange={e => setAccountFilter(e.target.value === "all" ? "all" : Number(e.target.value))}>
          <MenuItem value="all">All cards</MenuItem>
          {cards.map(c => <MenuItem key={c.accountId} value={c.accountId}>{c.name}</MenuItem>)}
        </TextField>
        <TextField size="small" placeholder="Search amount or card" value={search} onChange={e => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18 }} /></InputAdornment> }} />
      </Stack>

      {/* ── Summary ── */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(3, 1fr)" }, gap: { xs: 1.5, sm: 2 } }}>
        {loading && !summary ? [0, 1, 2].map(i => <MetricSkeleton key={i} />) : (
          <>
            <MetricCard label="Spent" value={fmt(spent, preferredCurrency, { maxDecimals: 0 })}
              footer={<Typography sx={{ fontSize: "0.75rem", color: colors.gray400 }}>{filtered.length} spend{filtered.length === 1 ? "" : "s"}</Typography>} />
            <MetricCard label="Budget left"
              value={left != null ? fmt(left, preferredCurrency, { maxDecimals: 0 }) : "—"}
              accent={left != null && left < 0 ? colors.error : undefined}
              footer={<Typography sx={{ fontSize: "0.75rem", color: colors.gray400 }}>
                {limit == null
                  ? (accountFilter === "all" ? "No budget set" : "Budget covers all cards")
                  : isCurrentMonth && left != null
                    ? `${fmt(Math.max(0, left) / daysLeft, preferredCurrency, { maxDecimals: 0 })}/day · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
                    : `of ${fmt(limit, preferredCurrency, { maxDecimals: 0 })}`}
              </Typography>} />
            <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}>
              <MetricCard label="Total owed" value={fmt(debt, preferredCurrency, { maxDecimals: 0 })}
                footer={<Typography sx={{ fontSize: "0.75rem", color: colors.gray400 }}>Right now, from card balances</Typography>} />
            </Box>
          </>
        )}
      </Box>

      {/* ── Daily chart + split by card ── */}
      {!loading && filtered.length > 0 && (
        <FadeIn>
          <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 3 }}>
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", mb: 1 }}>Spend by day</Typography>
                <Box sx={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <XAxis dataKey="day" tickLine={false} axisLine={false} interval={isMobile ? 6 : 2} tick={{ fontSize: 11, fill: colors.gray400 }} />
                      <YAxis hide />
                      <ChartTooltip cursor={{ fill: alpha(colors.brand, 0.08) }}
                        formatter={(v: number) => [fmt(v, preferredCurrency, { maxDecimals: 0 }), "Spent"]}
                        labelFormatter={d => dayLabel(`${month}-${String(d).padStart(2, "0")}`)} />
                      <Bar dataKey="amount" fill={colors.brand} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", mb: 1.5 }}>By card</Typography>
                <Stack spacing={1.25}>
                  {byCard.map(c => (
                    <Box key={c.name}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Typography sx={{ fontSize: "0.8rem" }} noWrap>{c.name}</Typography>
                        <Typography sx={{ fontSize: "0.8rem", fontWeight: 650, ml: 1, flexShrink: 0 }}>{fmt(c.amount, preferredCurrency, { maxDecimals: 0 })}</Typography>
                      </Stack>
                      <Box sx={{ height: 6, borderRadius: 3, bgcolor: colors.gray100 }}>
                        <Box sx={{ height: "100%", borderRadius: 3, bgcolor: colors.brand, width: `${spent > 0 ? (c.amount / spent) * 100 : 0}%` }} />
                      </Box>
                    </Box>
                  ))}
                </Stack>
              </Box>
            </Box>
          </Paper>
        </FadeIn>
      )}

      {/* ── The list ── */}
      {loading ? <ListSkeleton rows={5} /> : filtered.length === 0 ? (
        <Paper>
          <EmptyState
            icon={<CreditCardOffOutlinedIcon />}
            title={spends.length === 0 ? "No card spends this month" : "Nothing matches"}
            description={spends.length === 0 ? "Spends from your card alert emails show up here. You can also add one by hand." : "Try another card or search."}
            action={spends.length === 0 && cards.length > 0 ? { label: "Add Spend", onClick: openAdd } : undefined}
          />
        </Paper>
      ) : (
        <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
          <Stack direction="row" alignItems="center" sx={{ px: { xs: 2, sm: 2.5 }, py: 1.5, borderBottom: `1px solid ${colors.gray100}` }}>
            <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", flex: 1 }}>Spends</Typography>
            <ToggleButtonGroup size="small" exclusive value={sortBy} onChange={(_e, v) => { if (v) setSortBy(v); }}>
              <ToggleButton value="date" sx={{ px: 1.25, py: 0.25, fontSize: "0.72rem" }}>Date</ToggleButton>
              <ToggleButton value="amount" sx={{ px: 1.25, py: 0.25, fontSize: "0.72rem" }}>Amount</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          {groups.map(g => (
            <Box key={g.day ?? "all"}>
              {g.day && (
                <Stack direction="row" justifyContent="space-between" sx={{ px: { xs: 2, sm: 2.5 }, py: 0.75, bgcolor: alpha(colors.brand, 0.04) }}>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: colors.gray500 }}>{dayLabel(g.day)}</Typography>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: colors.gray500 }}>{fmt(g.total, preferredCurrency, { maxDecimals: 0 })}</Typography>
                </Stack>
              )}
              {g.rows.map(s => (
                <Stack key={s.id} direction="row" alignItems="center" spacing={1.5}
                  sx={{ px: { xs: 2, sm: 2.5 }, py: 1.25, borderBottom: `1px solid ${colors.gray100}`, "&:hover .row-actions": { opacity: 1 } }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: "0.88rem", fontWeight: 600 }} noWrap>
                      {s.accountName}{s.cardLast4 ? ` ·· ${s.cardLast4}` : ""}
                    </Typography>
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25 }}>
                      {!g.day && <Typography sx={{ fontSize: "0.72rem", color: colors.gray400 }}>{dayLabel(s.spentOn)}</Typography>}
                      <TintedChip label={s.source === "email" ? "Email" : "Manual"} color={s.source === "email" ? colors.brand : colors.accent} />
                      {s.edited && <TintedChip label="Edited" color={colors.warning} />}
                    </Stack>
                  </Box>
                  <Typography sx={{ fontSize: "0.95rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    {fmt(s.amount, preferredCurrency)}
                  </Typography>
                  <Stack direction="row" className="row-actions" sx={{ opacity: { xs: 1, sm: 0.4 }, transition: "opacity 0.15s ease" }}>
                    <IconButton size="small" onClick={() => openEdit(s)} aria-label="Edit spend"><EditOutlinedIcon sx={{ fontSize: 18 }} /></IconButton>
                    <IconButton size="small" onClick={() => setDeleteTarget(s)} aria-label="Delete spend" sx={{ "&:hover": { color: colors.error } }}>
                      <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Stack>
                </Stack>
              ))}
            </Box>
          ))}
        </Paper>
      )}

      {cards.length > 0 && (
        <Fab onClick={openAdd}
          variant={isMobile ? "circular" : "extended"}
          sx={{
            position: "fixed",
            bottom: { xs: "calc(24px + env(safe-area-inset-bottom, 0px))", sm: 24 },
            right: { xs: 16, sm: 24 },
            bgcolor: colors.accent,
            color: colors.pureWhite,
            boxShadow: `0 4px 20px ${alpha(colors.accent, 0.4)}`,
            "&:hover": { bgcolor: colors.accentDark, boxShadow: `0 6px 28px ${alpha(colors.accent, 0.5)}` },
          }}>
          <AddIcon sx={isMobile ? {} : { mr: 0.5 }} />
          {!isMobile && "Add Spend"}
        </Fab>
      )}

      {/* ── Add / edit ── */}
      <Dialog open={!!form} onClose={() => setForm(null)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>{form?.id == null ? "Add spend" : "Edit spend"}</DialogTitle>
        {form && (
          <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: "16px !important" }}>
            <TextField select label="Card" value={form.accountId} fullWidth
              onChange={e => setForm({ ...form, accountId: Number(e.target.value) })}>
              {cards.map(c => <MenuItem key={c.accountId} value={c.accountId}>{c.name}</MenuItem>)}
            </TextField>
            <TextField label="Card last 4 digits (optional)" value={form.cardLast4} fullWidth
              onChange={e => setForm({ ...form, cardLast4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              error={!last4Valid} helperText={!last4Valid ? "Enter all 4 digits" : undefined}
              inputProps={{ inputMode: "numeric", autoComplete: "off" }} />
            <TextField label="Date" type="date" value={form.spentOn} fullWidth InputLabelProps={{ shrink: true }}
              onChange={e => setForm({ ...form, spentOn: e.target.value })} />
            <NumericField label="Amount" value={form.amount} onChange={v => setForm({ ...form, amount: v })}
              currency={preferredCurrency} maxDecimals={2} fullWidth autoFocus={form.id == null}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); }} />
            {form.id != null && spends.find(s => s.id === form.id)?.source === "email" && (
              <Typography sx={{ fontSize: "0.75rem", color: colors.gray400 }}>
                This spend came from an alert email. Saving marks it as edited.
              </Typography>
            )}
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setForm(null)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={!formValid || saving}>
            {form?.id == null ? "Add" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete confirm ── */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete spend?</DialogTitle>
        <DialogContent>
          {deleteTarget && (
            <Typography sx={{ fontSize: "0.9rem" }}>
              {fmt(deleteTarget.amount, preferredCurrency)} on {deleteTarget.accountName} · {dayLabel(deleteTarget.spentOn)}. This can't be undone.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button onClick={handleDelete} variant="contained" color="error">Delete</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default CardSpends;
