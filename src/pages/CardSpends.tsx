import { useEffect, useState, useCallback, useMemo, useRef, type TouchEvent } from "react";
import {
  Box, Paper, Typography, TextField, MenuItem, Fab, Stack, InputAdornment, Chip, Skeleton, Tooltip,
  ToggleButton, ToggleButtonGroup, useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import { useUser } from "../context/UserContext";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import { useSyncedConfig } from "../utils/syncedConfig";
import {
  getCardSpends, getCardSpendList, createCardSpend, createCardRefund, updateCardSpend, deleteCardSpend, invalidateCache,
} from "../api/client";
import { EmptyState, ErrorState, MetricCard, MetricSkeleton, FadeIn } from "../components/shared";
import type { CardSpend, CardSpendSummary } from "../api/types";
import { formatCurrency as fmt, formatCurrencyCompact as fmtShort } from "../utils/format";
import {
  buildPurchases, cumulativeByDay, dayLabel, daysInMonth, findIssues, matchesQuery, matchesSource, monthKey, monthLabel,
  parseQuery, shiftMonth, todayIso, type Issue, type Purchase, type SourceFilter,
} from "../cardspends/model";
import PaceBar, { VsLastMonth } from "../cardspends/PaceBar";
import DailyChart from "../cardspends/DailyChart";
import SpendRow from "../cardspends/SpendRow";
import SpendForm, { readLastCard, type FormState } from "../cardspends/SpendForm";
import MonthPicker from "../cardspends/MonthPicker";
import ReviewPanel from "../cardspends/ReviewPanel";

type SortBy = "date" | "amount";

/** How long a delete can be undone before it is sent. */
const UNDO_MS = 6000;
/** Horizontal drag on the top area that switches month on phones. */
const MONTH_SWIPE = 70;

const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "email", label: "Email" },
  { value: "refunded", label: "Refunded" },
  { value: "edited", label: "Edited" },
];

/**
 * Every credit card purchase in a month, for analysing and correcting what the alert emails
 * recorded: budget pace, comparison with last month, rows that need a look, and quick add, edit,
 * refund and undoable delete. Refunds sit under their purchase and count in its month. Debt is not
 * affected by any of this: it comes from each card's balance, not from these rows.
 */
function CardSpends() {
  const { userId, preferredCurrency: currency } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors } = useTokens();
  const { showToast } = useToast();
  const [budget] = useSyncedConfig<{ monthlyLimit: number | null }>(userId, "card_budget", { monthlyLimit: null });
  const [reviewed, setReviewed] = useSyncedConfig<string[]>(userId, "card_spend_reviewed", []);

  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [summary, setSummary] = useState<CardSpendSummary | null>(null);
  const [spends, setSpends] = useState<CardSpend[]>([]);
  const [prevSpends, setPrevSpends] = useState<CardSpend[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accountFilter, setAccountFilter] = useState<number | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter | null>(null);
  const [dayFilter, setDayFilter] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [form, setForm] = useState<FormState | null>(null);

  // Deletes wait UNDO_MS before going to the server; until then the rows are only hidden.
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const pendingDeletes = useRef(new Map<number, ReturnType<typeof setTimeout>>());

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

  // Last month feeds the comparison and what counts as a "normal" spend; it is never required.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setPrevSpends(null);
    getCardSpendList(userId, shiftMonth(month, -1))
      .then(l => { if (!cancelled) setPrevSpends(l); })
      .catch(() => { /* comparison is optional */ });
    return () => { cancelled = true; };
  }, [userId, month]);

  // Leaving the page sends any delete still waiting for its undo window.
  useEffect(() => {
    const pending = pendingDeletes.current;
    return () => {
      for (const [id, timer] of pending) { clearTimeout(timer); deleteCardSpend(id).catch(() => {}); }
      if (pending.size) invalidateCache("/card-spends");
      pending.clear();
    };
  }, []);

  useEffect(() => { setDayFilter(null); }, [month]);

  const cards = summary?.byAccount ?? [];
  const isCurrentMonth = month === monthKey(new Date());

  const purchases = useMemo(() => buildPurchases(spends.filter(s => !hidden.has(s.id))), [spends, hidden]);
  const prevPurchases = useMemo(() => (prevSpends ? buildPurchases(prevSpends) : null), [prevSpends]);
  const query = useMemo(() => parseQuery(search), [search]);

  // Everything but the day filter: the chart and totals keep showing the whole month.
  const base = useMemo(() => purchases.filter(p =>
    (accountFilter === "all" || p.accountId === accountFilter)
    && (sourceFilter == null || matchesSource(p, sourceFilter))
    && matchesQuery(p, query)), [purchases, accountFilter, sourceFilter, query]);

  const listed = useMemo(() => {
    const rows = dayFilter == null ? base : base.filter(p => Number(p.spentOn.slice(8, 10)) === dayFilter);
    return sortBy === "amount" ? [...rows].sort((a, b) => b.amount - a.amount) : rows;
  }, [base, dayFilter, sortBy]);

  const spent = base.reduce((sum, p) => sum + p.net, 0);
  const debt = cards.filter(c => accountFilter === "all" || c.accountId === accountFilter).reduce((sum, c) => sum + c.debt, 0);
  // The budget covers all cards, so pace only makes sense unfiltered.
  const unfiltered = accountFilter === "all" && sourceFilter == null && !search.trim();
  const limit = unfiltered ? budget.monthlyLimit : null;

  const prevBase = useMemo(() => prevPurchases?.filter(p => accountFilter === "all" || p.accountId === accountFilter) ?? null, [prevPurchases, accountFilter]);
  const prevCumulative = useMemo(() => (prevBase ? cumulativeByDay(prevBase, shiftMonth(month, -1)) : null), [prevBase, month]);
  const prevTotal = prevCumulative ? prevCumulative[prevCumulative.length - 1] ?? 0 : null;
  const todayIdx = isCurrentMonth ? new Date().getDate() - 1 : daysInMonth(month) - 1;
  const prevSameDay = prevCumulative ? prevCumulative[Math.min(todayIdx, prevCumulative.length - 1)] : null;

  const daily = useMemo(() => {
    const d = new Array(daysInMonth(month)).fill(0);
    for (const p of base) d[Number(p.spentOn.slice(8, 10)) - 1] += p.net;
    return d;
  }, [base, month]);
  const cumulative = useMemo(() => cumulativeByDay(base, month), [base, month]);

  const byCard = useMemo(() => {
    const map = new Map<number, { accountId: number; name: string; amount: number }>();
    for (const p of base) {
      const e = map.get(p.accountId) ?? { accountId: p.accountId, name: p.accountName, amount: 0 };
      e.amount += p.net;
      map.set(p.accountId, e);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [base]);

  const reviewedSet = useMemo(() => new Set(reviewed), [reviewed]);
  const issues = useMemo(() => findIssues(
    purchases, [...purchases, ...(prevPurchases ?? [])], new Map(cards.map(c => [c.accountId, c.debt])), reviewedSet,
  ), [purchases, prevPurchases, cards, reviewedSet]);
  const flaggedIds = useMemo(() => new Set(issues.map(i => i.purchase.id)), [issues]);

  // Date order groups rows under a day header; amount order is one flat list.
  const groups = useMemo(() => {
    if (sortBy === "amount") return [{ day: null as string | null, total: listed.reduce((s, p) => s + p.net, 0), rows: listed }];
    const out: { day: string | null; total: number; rows: Purchase[] }[] = [];
    for (const p of listed) {
      const last = out[out.length - 1];
      if (last && last.day === p.spentOn) { last.rows.push(p); last.total += p.net; }
      else out.push({ day: p.spentOn, total: p.net, rows: [p] });
    }
    return out;
  }, [listed, sortBy]);

  // ── Actions ──

  const openAdd = useCallback(() => {
    const last = readLastCard();
    const lastValid = last && cards.some(c => c.accountId === last.accountId) ? last : null;
    setForm({
      kind: "spend", id: null,
      accountId: accountFilter !== "all" ? accountFilter : lastValid?.accountId ?? (cards.length === 1 ? cards[0].accountId : ""),
      cardLast4: accountFilter === "all" || lastValid?.accountId === accountFilter ? lastValid?.cardLast4 ?? "" : "",
      spentOn: isCurrentMonth ? todayIso() : `${month}-01`,
      amount: "",
    });
  }, [cards, accountFilter, isCurrentMonth, month]);

  const openEdit = (p: Purchase) => setForm({
    kind: "spend", id: p.id, accountId: p.accountId, cardLast4: p.cardLast4 ?? "", spentOn: p.spentOn,
    amount: String(p.amount), fromEmail: p.source === "email",
  });
  // A new refund starts at what is left to refund: the full amount for a failed payment.
  const openRefund = (p: Purchase) => setForm({
    kind: "refund", purchase: p, id: null, accountId: p.accountId, cardLast4: p.cardLast4 ?? "", spentOn: todayIso(), amount: String(p.net),
  });
  const openEditRefund = (p: Purchase, r: CardSpend) => setForm({
    kind: "refund", purchase: p, id: r.id, accountId: p.accountId, cardLast4: p.cardLast4 ?? "", spentOn: r.spentOn, amount: String(-r.amount),
  });

  const saveForm = async (f: FormState) => {
    try {
      if (f.kind === "refund" && f.purchase) {
        const refund = { amount: Number(f.amount), spentOn: f.spentOn };
        if (f.id == null) await createCardRefund(f.purchase.id, refund);
        else await updateCardSpend(f.id, refund);
        showToast(f.id == null ? "Refund added" : "Refund updated");
      } else {
        const data = { accountId: f.accountId as number, amount: Number(f.amount), spentOn: f.spentOn, cardLast4: f.cardLast4 || null };
        if (f.id == null) await createCardSpend(data);
        else await updateCardSpend(f.id, data);
        showToast(f.id == null ? `Added ${fmt(data.amount, currency)}${f.spentOn.slice(0, 7) !== month ? ` to ${monthLabel(f.spentOn.slice(0, 7))}` : ""}` : "Spend updated");
      }
      invalidateCache("/card-spends");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
      throw err;
    }
  };

  const changeAmount = async (p: Purchase, amount: number) => {
    try {
      await updateCardSpend(p.id, { accountId: p.accountId, amount, spentOn: p.spentOn, cardLast4: p.cardLast4 });
      invalidateCache("/card-spends");
      showToast("Amount updated");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update amount", "error");
      throw err;
    }
  };

  const remove = (s: CardSpend) => {
    // A purchase's refunds go with it on the server (cascade), so hide them together.
    const ids = [s.id, ...spends.filter(x => x.refundOf === s.id).map(x => x.id)];
    setHidden(h => new Set([...h, ...ids]));
    const timer = setTimeout(async () => {
      pendingDeletes.current.delete(s.id);
      try {
        await deleteCardSpend(s.id);
        invalidateCache("/card-spends");
        setSpends(list => list.filter(x => !ids.includes(x.id)));
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to delete", "error");
      } finally {
        setHidden(h => { const n = new Set(h); ids.forEach(i => n.delete(i)); return n; });
      }
    }, UNDO_MS);
    pendingDeletes.current.set(s.id, timer);
    const what = s.refundOf != null ? "Refund" : "Spend";
    showToast(`${what} of ${fmt(Math.abs(s.amount), currency)} deleted`, "success", {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timer);
          pendingDeletes.current.delete(s.id);
          setHidden(h => { const n = new Set(h); ids.forEach(i => n.delete(i)); return n; });
        },
      },
    });
  };

  const dismissIssue = (i: Issue) => setReviewed([...reviewed, i.key]);
  const showIssue = (i: Issue) => {
    setAccountFilter("all"); setSourceFilter(null); setSearch("");
    setDayFilter(Number(i.purchase.spentOn.slice(8, 10)));
  };

  // "N" opens the add form when not typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey || form) return;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (cards.length === 0) return;
      e.preventDefault();
      openAdd();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [form, cards.length, openAdd]);

  // Swiping the top area left/right changes month on phones.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onTopTouchStart = (e: TouchEvent) => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTopTouchEnd = (e: TouchEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) < MONTH_SWIPE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx > 0) setMonth(m => shiftMonth(m, -1));
    else if (!isCurrentMonth) setMonth(m => shiftMonth(m, 1));
  };

  // The slim sticky summary appears once the main one scrolls away.
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(true);
  useEffect(() => {
    const el = summaryRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setSummaryVisible(e.isIntersecting), { rootMargin: "-60px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loading]);

  if (error && !summary && !loading) {
    return <ErrorState message={error} onRetry={load} />;
  }

  const cardName = (id: number) => cards.find(c => c.accountId === id)?.name ?? "Card";
  const firstRun = !loading && spends.length === 0 && (prevSpends?.length ?? 0) === 0;

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }} sx={{ pb: 12 }}>
      {/* ── Sticky mini summary ── */}
      <Box sx={{ position: "sticky", top: { xs: "calc(52px + env(safe-area-inset-top, 0px))", md: 0 }, height: 0, zIndex: 20, mt: "0 !important" }}>
        <Box sx={{
          transform: summaryVisible ? "translateY(-12px)" : "translateY(8px)", opacity: summaryVisible ? 0 : 1,
          pointerEvents: summaryVisible ? "none" : "auto", transition: "all 0.2s ease",
        }}>
          <Paper sx={{
            px: 2, py: 1, borderRadius: 999, display: "flex", alignItems: "center", gap: 1.5, mx: "auto", width: "fit-content", maxWidth: "100%",
            bgcolor: alpha(colors.white, 0.92), backdropFilter: "blur(10px)", boxShadow: 4,
          }} aria-hidden={summaryVisible}>
            <Typography sx={{ fontSize: "0.8rem", fontWeight: 700 }}>{monthLabel(month, "short")}</Typography>
            <Typography sx={{ fontSize: "0.8rem", fontVariantNumeric: "tabular-nums" }}>{fmtShort(spent, currency)} spent</Typography>
            {limit != null && (
              <Typography sx={{ fontSize: "0.8rem", fontWeight: 650, color: spent > limit ? colors.error : colors.success, fontVariantNumeric: "tabular-nums" }}>
                {spent > limit ? `${fmtShort(spent - limit, currency)} over` : `${fmtShort(limit - spent, currency)} left`}
              </Typography>
            )}
          </Paper>
        </Box>
      </Box>

      {/* ── Month, card filter, search ── */}
      <Box onTouchStart={isMobile ? onTopTouchStart : undefined} onTouchEnd={isMobile ? onTopTouchEnd : undefined}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "stretch", sm: "center" }}>
          <Stack direction="row" justifyContent={{ xs: "center", sm: "flex-start" }}>
            <MonthPicker userId={userId} month={month} onChange={setMonth} budget={budget.monthlyLimit} currency={currency} />
          </Stack>
          <Box sx={{ flex: 1 }} />
          <Stack direction="row" spacing={1.5}>
            <TextField select size="small" label="Card" value={accountFilter} sx={{ minWidth: { xs: 0, sm: 170 }, flex: { xs: 1, sm: "none" } }}
              onChange={e => setAccountFilter(e.target.value === "all" ? "all" : Number(e.target.value))}>
              <MenuItem value="all">All cards</MenuItem>
              {cards.map(c => <MenuItem key={c.accountId} value={c.accountId}>{c.name}</MenuItem>)}
            </TextField>
            <Tooltip title="Try >5000, <500, 1000-2000 or a card's last 4 digits" placement="bottom-end">
              <TextField size="small" placeholder="Search ₹ or card" value={search} onChange={e => setSearch(e.target.value)}
                sx={{ flex: { xs: 1.4, sm: "none" }, width: { sm: 220 } }}
                inputProps={{ "aria-label": "Search spends" }}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18 }} /></InputAdornment> }} />
            </Tooltip>
          </Stack>
        </Stack>
      </Box>

      {/* ── Summary ── */}
      <Box ref={summaryRef} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: { xs: 1.5, sm: 2 } }}>
        {loading && !summary ? (<><MetricSkeleton /><MetricSkeleton /></>) : (
          <>
            <PaceBar spent={spent} limit={limit} month={month} isCurrentMonth={isCurrentMonth}
              prevTotal={prevTotal} prevSameDay={prevSameDay} currency={currency} />
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "1fr" }, gap: { xs: 1.5, sm: 2 } }}>
              <MetricCard label="Total owed" value={fmtShort(debt, currency)}
                footer={<Typography sx={{ fontSize: "0.72rem", color: colors.gray400 }}>Right now, from card balances</Typography>} />
              <MetricCard label="Spends" value={String(base.length)}
                footer={<VsLastMonth now={base.length} prev={prevBase ? prevBase.length : null} month={month} />} />
            </Box>
          </>
        )}
      </Box>

      {/* ── Needs a look ── */}
      {!loading && (
        <ReviewPanel issues={issues} currency={currency} onDelete={i => remove(i.purchase)} onDismiss={dismissIssue} onShow={showIssue} />
      )}

      {/* ── Daily chart + split by card ── */}
      {!loading && base.length > 0 && (
        <FadeIn>
          <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 3 }}>
              <DailyChart month={month} daily={daily} cumulative={cumulative} prevCumulative={prevCumulative}
                selectedDay={dayFilter} onSelectDay={setDayFilter} currency={currency} compact={isMobile} />
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", mb: 1.5 }}>By card</Typography>
                <Stack spacing={1}>
                  {byCard.map(c => {
                    const active = accountFilter === c.accountId;
                    return (
                      <Box key={c.accountId} role="button" tabIndex={0} aria-pressed={active}
                        onClick={() => setAccountFilter(active ? "all" : c.accountId)}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAccountFilter(active ? "all" : c.accountId); } }}
                        sx={{
                          p: 1, mx: -1, borderRadius: 2, cursor: "pointer", outline: "none",
                          bgcolor: active ? alpha(colors.brand, 0.08) : "transparent",
                          "&:hover, &:focus-visible": { bgcolor: alpha(colors.brand, 0.06) },
                        }}>
                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                          <Typography sx={{ fontSize: "0.8rem", fontWeight: active ? 700 : 500 }} noWrap>{c.name}</Typography>
                          <Typography sx={{ fontSize: "0.8rem", fontWeight: 650, ml: 1, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{fmtShort(c.amount, currency)}</Typography>
                        </Stack>
                        <Box sx={{ height: 6, borderRadius: 3, bgcolor: colors.gray100 }}>
                          <Box sx={{ height: "100%", borderRadius: 3, bgcolor: colors.brand, width: `${spent > 0 ? Math.max(0, (c.amount / spent) * 100) : 0}%` }} />
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
                <Typography sx={{ fontSize: "0.7rem", color: colors.gray400, mt: 1.5 }}>Tap a card or a day to filter the list.</Typography>
              </Box>
            </Box>
          </Paper>
        </FadeIn>
      )}

      {/* ── Filter chips ── */}
      {!loading && spends.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
          {SOURCE_FILTERS.map(f => (
            <Chip key={f.value} size="small" label={f.label}
              color={sourceFilter === f.value ? "primary" : "default"} variant={sourceFilter === f.value ? "filled" : "outlined"}
              onClick={() => setSourceFilter(sourceFilter === f.value ? null : f.value)} />
          ))}
          {dayFilter != null && (
            <Chip size="small" color="primary" label={`Showing ${dayLabel(`${month}-${String(dayFilter).padStart(2, "0")}`)}`} onDelete={() => setDayFilter(null)} />
          )}
          {accountFilter !== "all" && (
            <Chip size="small" color="primary" label={cardName(accountFilter)} onDelete={() => setAccountFilter("all")} />
          )}
          {search.trim() && <Chip size="small" color="primary" label={`“${search.trim()}”`} onDelete={() => setSearch("")} />}
        </Stack>
      )}

      {/* ── The list ── */}
      {loading ? <RowsSkeleton /> : listed.length === 0 ? (
        <Paper>
          {firstRun ? (
            <EmptyState
              icon={<CreditCardRoundedIcon />}
              title="Your card spends will show up here"
              description="Purchases from your card alert emails appear automatically. Missed spends can be added by hand."
              action={cards.length > 0 ? { label: "Add a spend", onClick: openAdd } : undefined}
            />
          ) : spends.length === 0 ? (
            <EmptyState
              icon={<CreditCardRoundedIcon />}
              title={`No spends in ${monthLabel(month)}`}
              description={isCurrentMonth ? "A quiet month so far." : "Nothing was recorded this month."}
              action={cards.length > 0 ? { label: "Add a spend", onClick: openAdd } : undefined}
            />
          ) : (
            <EmptyState icon={<SearchRoundedIcon />} title="Nothing matches" description="Try another card, day or search."
              action={{ label: "Clear filters", onClick: () => { setAccountFilter("all"); setSourceFilter(null); setDayFilter(null); setSearch(""); } }} />
          )}
        </Paper>
      ) : (
        <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
          <Stack direction="row" alignItems="center" sx={{ px: { xs: 2, sm: 2.5 }, py: 1.5, borderBottom: `1px solid ${colors.gray100}` }}>
            <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", flex: 1 }}>
              {listed.length} spend{listed.length === 1 ? "" : "s"}
            </Typography>
            <ToggleButtonGroup size="small" exclusive value={sortBy} onChange={(_e, v) => { if (v) setSortBy(v); }} aria-label="Sort by">
              <ToggleButton value="date" sx={{ px: 1.25, py: 0.25, fontSize: "0.72rem" }}>Date</ToggleButton>
              <ToggleButton value="amount" sx={{ px: 1.25, py: 0.25, fontSize: "0.72rem" }}>Amount</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          {groups.map(g => (
            <Box key={g.day ?? "all"}>
              {g.day && (
                <Stack direction="row" justifyContent="space-between" sx={{ px: { xs: 2, sm: 2.5 }, py: 0.75, bgcolor: alpha(colors.brand, 0.04) }}>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: colors.gray500 }}>{dayLabel(g.day)}</Typography>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: colors.gray500, fontVariantNumeric: "tabular-nums" }}>{fmt(g.total, currency, { maxDecimals: 0 })}</Typography>
                </Stack>
              )}
              {g.rows.map(p => (
                <SpendRow key={p.id} purchase={p} showDate={!g.day} flagged={flaggedIds.has(p.id)} isMobile={isMobile} currency={currency}
                  onEdit={openEdit} onRefund={openRefund} onDelete={remove} onEditRefund={openEditRefund} onAmountChange={changeAmount} />
              ))}
            </Box>
          ))}
          {isMobile && (
            <Typography sx={{ fontSize: "0.7rem", color: colors.gray400, textAlign: "center", py: 1.25 }}>
              Swipe a spend left to delete, right to refund. Tap to edit.
            </Typography>
          )}
        </Paper>
      )}

      {cards.length > 0 && (
        <Tooltip title={isMobile ? "" : "Add spend (N)"} placement="left">
          <Fab onClick={openAdd} aria-label="Add spend"
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
        </Tooltip>
      )}

      <SpendForm form={form} setForm={setForm} cards={cards} currency={currency} onSave={saveForm} />
    </Stack>
  );
}

/** Placeholder rows shaped like the real ones, so loading doesn't jump. */
function RowsSkeleton() {
  return (
    <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
      {[0, 1, 2, 3, 4].map(i => (
        <Stack key={i} direction="row" alignItems="center" spacing={1.5} sx={{ px: 2.5, py: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            <Skeleton width={i % 2 ? "45%" : "35%"} height={20} />
            <Skeleton width={60} height={18} />
          </Box>
          <Skeleton width={80} height={24} />
        </Stack>
      ))}
    </Paper>
  );
}

export default CardSpends;
