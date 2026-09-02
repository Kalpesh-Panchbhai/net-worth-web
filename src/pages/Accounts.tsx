import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, TextField, Button, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, Collapse,
  FormControlLabel, Switch, Stack, IconButton, Fab, Avatar,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import InputAdornment from "@mui/material/InputAdornment";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import { useUser } from "../context/UserContext";
import {
  getAccounts, createAccount, updateAccount, deleteAccount, invalidateMoneyCaches,
} from "../api/client";
import XirrBadge from "../components/XirrBadge";
import { pooledXirr } from "../utils/xirr";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import { EmptyState, ErrorState, ListSkeleton, FadeIn } from "../components/shared";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import { CURRENCIES } from "../constants";
import type { AccountSummary, AccountType } from "../api/types";
import { formatCurrency as fmt } from "../utils/format";
const ACCOUNT_TYPES: AccountType[] = ["BROKER", "SAVINGS", "CREDIT_CARD", "LOAN", "OTHER"];
const TYPE_LABELS: Record<AccountType, string> = {
  BROKER: "Broker", SAVINGS: "Savings", CREDIT_CARD: "Credit Card", LOAN: "Loan", OTHER: "Other",
};
const TYPE_ICONS: Record<string, React.ReactNode> = {
  BROKER: <ShowChartRoundedIcon sx={{ fontSize: 20 }} />,
  SAVINGS: <SavingsRoundedIcon sx={{ fontSize: 20 }} />,
  CREDIT_CARD: <CreditCardRoundedIcon sx={{ fontSize: 20 }} />,
  LOAN: <AccountBalanceRoundedIcon sx={{ fontSize: 20 }} />,
  OTHER: <MoreHorizRoundedIcon sx={{ fontSize: 20 }} />,
};

const isInvestable = (a: AccountSummary) => a.type === "BROKER" || a.needsDailyData;

/**
 * A row falls back to its own native currency when no FX rate could be resolved, so adding every
 * row together would mix currencies. Sum only the display currency most rows share and label the
 * totals with it; `fallback` is used when there is nothing to sum.
 */
function aggregate(rows: AccountSummary[], fallback: string) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.displayCurrency, (counts.get(r.displayCurrency) ?? 0) + 1);
  let currency = fallback;
  let most = 0;
  for (const [code, n] of counts) if (n > most) { currency = code; most = n; }

  let value = 0, invested = 0, previous = 0, gain = 0, dayChange = 0, hasInvestable = false;
  for (const r of rows) {
    if (r.displayCurrency !== currency) continue;
    value += r.currentDayValue;
    invested += r.invested;
    previous += r.previousDayValue;
    gain += r.gain;
    dayChange += r.dayChange;
    if (isInvestable(r)) hasInvestable = true;
  }
  return {
    currency, value, invested, gain, dayChange, hasInvestable,
    // Pooled from the members' cash flows, so the figure is exact for whatever the user has
    // filtered to. Averaging the members' own xirr values would not be an IRR at all.
    xirr: pooledXirr(rows, currency),
    gainPct: invested > 0 ? (gain / invested) * 100 : 0,
    dayPct: previous > 0 ? (dayChange / previous) * 100 : 0,
  };
}

interface TypeGroup extends ReturnType<typeof aggregate> {
  type: string;
  group: AccountSummary[];
}

interface AccountCardProps {
  a: AccountSummary;
  i: number;
  onOpen: (a: AccountSummary) => void;
  onEdit: (a: AccountSummary) => void;
  onDelete: (a: AccountSummary) => void;
}

const AccountCard = memo(function AccountCard({ a, i, onOpen, onEdit, onDelete }: AccountCardProps) {
  const theme = useTheme();
  const { colors, typeColors, shadow } = useTokens();
  const gainPct = a.invested > 0 ? (a.gain / a.invested) * 100 : 0;
  const dayPct = a.previousDayValue > 0 ? (a.dayChange / a.previousDayValue) * 100 : 0;
  const tc = typeColors[a.type] || colors.gray500;
  const isDark = theme.palette.mode === "dark";
  const cardMuted = isDark ? alpha(colors.pureWhite, 0.5) : colors.gray400;
  const cardSubtle = isDark ? alpha(colors.pureWhite, 0.08) : colors.gray100;
  const cardInvested = isDark ? "#60A5FA" : colors.brand;
  const cardSuccess = isDark ? "#34D399" : colors.success;
  const cardError = isDark ? "#F87171" : colors.error;
  return (
    <FadeIn delay={i * 40}>
      <Paper
        onClick={() => onOpen(a)}
        sx={{
          p: 2.5, cursor: "pointer",
          borderRadius: 3,
          borderLeft: `4px solid ${tc}`,
          transition: "all 0.2s ease",
          "&:hover": { boxShadow: shadow.hover, transform: "translateY(-2px)" },
          opacity: a.isActive ? 1 : 0.6,
          height: "100%", display: "flex", flexDirection: "column",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, mb: 1.5 }}>
          <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(tc, 0.1), color: tc, borderRadius: 2 }}>
            {TYPE_ICONS[a.type] || TYPE_ICONS.OTHER}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 650, fontSize: "0.9rem", lineHeight: 1.3 }} noWrap>{a.name}</Typography>
            <Typography variant="caption" sx={{ color: cardMuted }}>
              {TYPE_LABELS[a.type as AccountType] || a.type} · {a.currency}
              {!a.isActive && " · Inactive"}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.5} alignItems="center" onClick={e => e.stopPropagation()}>
            <XirrBadge value={a.xirr} size="sm" />
            <IconButton size="small" onClick={() => onEdit(a)} sx={{ color: colors.brand, opacity: 0.6, "&:hover": { opacity: 1, bgcolor: alpha(colors.brand, 0.08) } }}>
              <EditOutlinedIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <IconButton size="small" onClick={() => onDelete(a)} sx={{ color: colors.error, opacity: 0.6, "&:hover": { opacity: 1, bgcolor: alpha(colors.error, 0.08) } }}>
              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Stack>
        </Box>

        <Box sx={{ px: 1.5, py: 1, borderRadius: 1.5, bgcolor: cardSubtle, display: "inline-block", mb: 1.5, alignSelf: "flex-start" }}>
          <Typography sx={{ fontSize: "0.6rem", fontWeight: 500, color: cardMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.15 }}>
            Value
          </Typography>
          <Typography sx={{ fontSize: "1.25rem", fontWeight: 750, letterSpacing: "-0.02em" }}>
            {fmt(a.currentDayValue, a.displayCurrency)}
          </Typography>
        </Box>

        <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mt: "auto" }}>
          {isInvestable(a) && (
            <Box sx={{ flex: 1, minWidth: 80, p: 1, borderRadius: 1.5, bgcolor: alpha(cardInvested, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
              <Typography sx={{ fontSize: "0.6rem", fontWeight: 500, color: cardMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
                Invested
              </Typography>
              <Typography noWrap sx={{ fontSize: "0.8rem", fontWeight: 700, color: cardInvested }}>
                {fmt(a.invested, a.displayCurrency)}
              </Typography>
            </Box>
          )}
          {isInvestable(a) && a.invested > 0 && (
            <Box sx={{ flex: 1, minWidth: 80, p: 1, borderRadius: 1.5, bgcolor: alpha(a.gain >= 0 ? cardSuccess : cardError, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
              <Typography sx={{ fontSize: "0.6rem", fontWeight: 500, color: cardMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
                P&L
              </Typography>
              <Typography noWrap sx={{ fontSize: "0.8rem", fontWeight: 700, color: a.gain >= 0 ? cardSuccess : cardError }}>
                {a.gain >= 0 ? "+" : ""}{fmt(a.gain, a.displayCurrency)}
              </Typography>
              <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, color: a.gain >= 0 ? cardSuccess : cardError, opacity: 0.8 }}>
                {a.gain >= 0 ? "+" : ""}{gainPct.toFixed(1)}%
              </Typography>
            </Box>
          )}
          <Box sx={{ flex: 1, minWidth: 80, p: 1, borderRadius: 1.5, bgcolor: alpha(a.dayChange >= 0 ? cardSuccess : cardError, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
            <Typography sx={{ fontSize: "0.6rem", fontWeight: 500, color: cardMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
              Today
            </Typography>
            <Typography noWrap sx={{ fontSize: "0.8rem", fontWeight: 700, color: a.dayChange >= 0 ? cardSuccess : cardError }}>
              {a.dayChange >= 0 ? "+" : ""}{fmt(a.dayChange, a.displayCurrency)}
            </Typography>
            <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, color: a.dayChange >= 0 ? cardSuccess : cardError, opacity: 0.8 }}>
              {a.dayChange >= 0 ? "+" : ""}{dayPct.toFixed(2)}%
            </Typography>
          </Box>
        </Stack>
      </Paper>
    </FadeIn>
  );
});

function Accounts() {
  const { userId, preferredCurrency, dataVersion } = useUser();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, typeColors } = useTokens();
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<AccountType>("BROKER");
  const [newCurrency, setNewCurrency] = useState("INR");
  const [newActive, setNewActive] = useState(true);
  const [newDailyData, setNewDailyData] = useState(false);
  const [editAccount, setEditAccount] = useState<AccountSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<AccountSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupByType, setGroupByType] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true); setError(null);
    getAccounts(userId)
      .then(data => { if (!cancelled) setAccounts(data); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, dataVersion, reloadKey]);

  const hasInactiveAccounts = accounts.some(a => !a.isActive);
  const visibleAccounts = useMemo(
    () => showInactive ? accounts : accounts.filter(a => a.isActive),
    [accounts, showInactive],
  );


  const handleCreate = async () => {
    if (!userId || !newName.trim()) return;
    const trimmed = newName.trim();
    const type = newType; const currency = newCurrency; const isActive = newActive; const needsDailyData = newDailyData;
    const prev = accounts;
    const tempId = -Date.now();
    const optimistic: AccountSummary = {
      id: tempId, userId, name: trimmed, type, isActive, needsDailyData, currency,
      currentDayValue: 0, previousDayValue: 0, invested: 0, gain: 0, dayChange: 0, xirr: null,
      displayCurrency: preferredCurrency,
    };
    setAccounts(a => [...a, optimistic]);
    setCreateOpen(false); setNewName(""); setNewType("BROKER"); setNewCurrency("INR"); setNewActive(true); setNewDailyData(false);
    try {
      const created = await createAccount({ userId, name: trimmed, type, currency, isActive, needsDailyData });
      setAccounts(a => a.map(acc => acc.id === tempId ? { ...optimistic, ...created } : acc));
      invalidateMoneyCaches();
      showToast(`Account "${trimmed}" created`);
    } catch (err) {
      setAccounts(prev);
      showToast(err instanceof Error ? err.message : "Failed to create account", "error");
    }
  };

  const handleUpdate = async () => {
    if (!editAccount) return;
    const name = editName.trim() || editAccount.name;
    const prev = accounts;
    setAccounts(a => a.map(acc => acc.id === editAccount.id ? { ...acc, name, isActive: editActive } : acc));
    setEditAccount(null);
    try {
      await updateAccount(editAccount.id, { name: editName.trim() || undefined, isActive: editActive });
      invalidateMoneyCaches();
      showToast(`Account "${name}" updated`);
    } catch (err) {
      setAccounts(prev);
      showToast(err instanceof Error ? err.message : "Failed to update account", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const { id, name } = deleteConfirm;
    const prev = accounts;
    setAccounts(a => a.filter(acc => acc.id !== id));
    setDeleteConfirm(null);
    try {
      await deleteAccount(id);
      invalidateMoneyCaches();
      showToast(`Account "${name}" deleted`);
    } catch (err) {
      setAccounts(prev);
      showToast(err instanceof Error ? err.message : "Failed to delete account", "error");
    }
  };

  const openAccount = useCallback((a: AccountSummary) => navigate(`/accounts/${a.id}`), [navigate]);
  const openEdit = useCallback((a: AccountSummary) => { setEditAccount(a); setEditName(a.name); setEditActive(a.isActive); }, []);
  const requestDelete = useCallback((a: AccountSummary) => setDeleteConfirm(a), []);

  // Filter by search query, sort, and group by type — each pass over the list rebuilds every card,
  // so it must not re-run on unrelated renders (and must never sort state in place).
  const { filtered, groups } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const rows = q
      ? visibleAccounts.filter(a => a.name.toLowerCase().includes(q) || (TYPE_LABELS[a.type as AccountType] || a.type).toLowerCase().includes(q))
      : [...visibleAccounts];
    rows.sort((a, b) => groupByType
      ? (TYPE_LABELS[a.type as AccountType] || a.type).localeCompare(TYPE_LABELS[b.type as AccountType] || b.type) || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name)
    );
    const groups: TypeGroup[] = [];
    if (groupByType) {
      const byType = new Map<string, AccountSummary[]>();
      for (const a of rows) {
        const group = byType.get(a.type);
        if (group) group.push(a); else byType.set(a.type, [a]);
      }
      for (const [type, group] of byType) groups.push({ type, group, ...aggregate(group, preferredCurrency) });
    }
    return { filtered: rows, groups };
  }, [visibleAccounts, searchQuery, groupByType, preferredCurrency]);

  // Over the search-filtered rows, so the hero agrees with the cards and group subtotals under it.
  const totals = useMemo(() => aggregate(filtered, preferredCurrency), [filtered, preferredCurrency]);

  if (error && accounts.length === 0 && !loading) return <ErrorState message={error} onRetry={reload} />;

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
      {/* ── Hero Card ── */}
      {!loading && (
        <FadeIn>
          {(() => {
            const isDark = theme.palette.mode === "dark";
            const heroBg = isDark ? colors.white : colors.pureWhite;
            const heroText = isDark ? colors.pureWhite : colors.gray900;
            const heroMuted = isDark ? alpha(colors.pureWhite, 0.5) : colors.gray400;
            const heroSubtle = isDark ? alpha(colors.pureWhite, 0.08) : colors.gray100;
            const heroInvested = isDark ? "#60A5FA" : colors.brand;
            const heroSuccess = isDark ? "#34D399" : colors.success;
            const heroError = isDark ? "#F87171" : colors.error;
            return (
            <Paper sx={{
              p: { xs: 2.5, sm: 3 }, borderRadius: 3,
              bgcolor: heroBg,
              border: "none", borderLeft: `4px solid ${colors.brand}`,
              boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.3)" : "0 4px 20px rgba(0,0,0,0.08)",
            }}>
              {/* Header */}
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(colors.brand, 0.1), color: colors.brand, borderRadius: 1.5 }}>
                  <AccountBalanceWalletRoundedIcon sx={{ fontSize: 18 }} />
                </Avatar>
                <Typography sx={{ fontSize: "0.85rem", fontWeight: 600, color: heroMuted }}>
                  Accounts
                </Typography>
                <Box sx={{ px: 0.8, py: 0.15, borderRadius: 1, bgcolor: heroSubtle, fontSize: "0.7rem", fontWeight: 600, color: heroMuted }}>
                  {filtered.length}
                </Box>
                <Box sx={{ flex: 1 }} />
                <XirrBadge value={totals.xirr} size="lg" />
              </Stack>

              {/* Total value */}
              <Box sx={{ px: 2, py: 1.5, borderRadius: 2, bgcolor: heroSubtle, display: "inline-block" }}>
                <Typography sx={{ fontSize: "0.7rem", fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
                  Total Value
                </Typography>
                <Typography sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem" }, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, color: heroText }}>
                  {fmt(totals.value, totals.currency)}
                </Typography>
              </Box>

              {/* Metrics row */}
              <Stack
                direction="row"
                sx={{ mt: 2.5, gap: { xs: 0.75, sm: 2 }, flexWrap: "wrap" }}
              >
                {totals.hasInvestable && (
                  <Box sx={{ flex: "1 1 auto", minWidth: { xs: "calc(50% - 6px)", sm: 120 }, p: { xs: 1, sm: 1.5 }, borderRadius: 2, bgcolor: alpha(heroInvested, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
                    <Typography sx={{ fontSize: { xs: "0.6rem", sm: "0.65rem" }, fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.5 }}>
                      Invested
                    </Typography>
                    <Typography noWrap sx={{ fontSize: { xs: "0.75rem", sm: "0.95rem" }, fontWeight: 700, color: heroInvested }}>
                      {fmt(totals.invested, totals.currency)}
                    </Typography>
                  </Box>
                )}
                {totals.hasInvestable && totals.invested > 0 && (
                  <Box sx={{ flex: "1 1 auto", minWidth: { xs: "calc(50% - 6px)", sm: 120 }, p: { xs: 1, sm: 1.5 }, borderRadius: 2, bgcolor: alpha(totals.gain >= 0 ? heroSuccess : heroError, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
                    <Typography sx={{ fontSize: { xs: "0.6rem", sm: "0.65rem" }, fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.5 }}>
                      Total P&L
                    </Typography>
                    <Typography noWrap sx={{ fontSize: { xs: "0.75rem", sm: "0.95rem" }, fontWeight: 700, color: totals.gain >= 0 ? heroSuccess : heroError }}>
                      {totals.gain >= 0 ? "+" : ""}{fmt(totals.gain, totals.currency)}
                    </Typography>
                    <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, color: totals.gain >= 0 ? heroSuccess : heroError, opacity: 0.8 }}>
                      {totals.gainPct >= 0 ? "+" : ""}{totals.gainPct.toFixed(1)}%
                    </Typography>
                  </Box>
                )}
                <Box sx={{ flex: "1 1 auto", minWidth: { xs: "calc(50% - 6px)", sm: 120 }, p: { xs: 1, sm: 1.5 }, borderRadius: 2, bgcolor: alpha(totals.dayChange >= 0 ? heroSuccess : heroError, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
                  <Typography sx={{ fontSize: { xs: "0.6rem", sm: "0.65rem" }, fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.5 }}>
                    Today
                  </Typography>
                  <Typography noWrap sx={{ fontSize: { xs: "0.75rem", sm: "0.95rem" }, fontWeight: 700, color: totals.dayChange >= 0 ? heroSuccess : heroError }}>
                    {totals.dayChange >= 0 ? "+" : ""}{fmt(totals.dayChange, totals.currency)}
                  </Typography>
                  <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, color: totals.dayChange >= 0 ? heroSuccess : heroError, opacity: 0.8 }}>
                    {totals.dayPct >= 0 ? "+" : ""}{totals.dayPct.toFixed(1)}%
                  </Typography>
                </Box>
              </Stack>
            </Paper>
            );
          })()}
        </FadeIn>
      )}

      {/* Search + Group toolbar */}
      {!loading && accounts.length > 0 && (
        <Stack spacing={1}>
          <TextField
            size="small" placeholder="Search by name or type…" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, color: colors.gray400 }} /></InputAdornment> }}
            fullWidth
            sx={{ maxWidth: { sm: 320 } }}
          />
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1 }}>
            <FormControlLabel
              control={<Switch checked={groupByType} onChange={e => setGroupByType(e.target.checked)} size="small" />}
              label={<Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.8rem" }}>Group by type</Typography>}
            />
            {hasInactiveAccounts && (
              <FormControlLabel
                control={<Switch checked={showInactive} onChange={e => setShowInactive(e.target.checked)} size="small" />}
                label={<Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.8rem" }}>Show inactive</Typography>}
              />
            )}
          </Stack>
        </Stack>
      )}

      {/* Account cards grid */}
      {loading ? <ListSkeleton rows={4} /> : visibleAccounts.length === 0 && accounts.length === 0 ? (
        <Paper>
          <EmptyState
            icon={<AccountBalanceWalletOutlinedIcon />}
            title="No accounts"
            description="Create your first account to start tracking your net worth."
            action={{ label: "Add Account", onClick: () => setCreateOpen(true) }}
          />
        </Paper>
      ) : visibleAccounts.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">No active accounts. Toggle "Show inactive" to see inactive accounts.</Typography>
        </Paper>
      ) : filtered.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">No accounts match "{searchQuery}"</Typography>
        </Paper>
      ) : groupByType ? (
        <FadeIn delay={100}>
          <Stack spacing={2}>
            {groups.map((g, si) => {
              const tc = typeColors[g.type] || colors.gray500;
              const isCollapsed = !!collapsed[g.type];
              return (
                <FadeIn key={g.type} delay={si * 40}>
                  <Paper sx={{ borderRadius: 3, overflow: "hidden", border: `1px solid ${colors.gray200}` }} elevation={0}>
                    <Box
                      onClick={() => setCollapsed(prev => ({ ...prev, [g.type]: !prev[g.type] }))}
                      sx={{
                        px: { xs: 2, sm: 3 }, py: 1.5,
                        bgcolor: alpha(tc, 0.05),
                        borderBottom: isCollapsed ? "none" : `1px solid ${colors.gray200}`,
                        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1,
                        cursor: "pointer", userSelect: "none",
                        "&:hover": { bgcolor: alpha(tc, 0.08) },
                        transition: "background-color 0.15s ease",
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                        {isCollapsed
                          ? <ExpandMoreRoundedIcon sx={{ fontSize: 20, color: colors.gray400 }} />
                          : <ExpandLessRoundedIcon sx={{ fontSize: 20, color: colors.gray400 }} />}
                        <Avatar sx={{ width: 28, height: 28, bgcolor: alpha(tc, 0.12), color: tc, fontSize: "0.6rem" }}>
                          {TYPE_ICONS[g.type] || TYPE_ICONS.OTHER}
                        </Avatar>
                        <Typography sx={{ fontWeight: 700, fontSize: { xs: "0.85rem", sm: "0.95rem" } }} noWrap>
                          {TYPE_LABELS[g.type as AccountType] || g.type}
                        </Typography>
                        <Typography variant="caption" sx={{ color: colors.gray400 }}>
                          {g.group.length} account{g.group.length !== 1 ? "s" : ""}
                        </Typography>
                      </Box>
                      <Stack alignItems="flex-end" spacing={0.25}>
                        <Typography sx={{ fontWeight: 750, fontSize: "1rem", letterSpacing: "-0.02em" }}>
                          {fmt(g.value, g.currency)}
                        </Typography>
                        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {g.xirr != null && (
                            <Typography sx={{ fontSize: 10, fontWeight: 600, color: g.xirr >= 0 ? colors.success : colors.error, display: "flex", alignItems: "center", gap: 0.4 }}>
                              <Box component="span" sx={{ fontSize: 8, fontWeight: 700, bgcolor: alpha(g.xirr >= 0 ? colors.success : colors.error, 0.12), px: 0.5, py: 0.1, borderRadius: 0.5 }}>XIRR</Box>
                              {g.xirr >= 0 ? "+" : ""}{(g.xirr * 100).toFixed(2)}%
                            </Typography>
                          )}
                          {g.hasInvestable && g.invested > 0 && (
                            <Typography sx={{ fontSize: 10, fontWeight: 600, color: g.gain >= 0 ? colors.success : colors.error, display: "flex", alignItems: "center", gap: 0.4 }}>
                              <Box component="span" sx={{ fontSize: 8, fontWeight: 700, bgcolor: alpha(g.gain >= 0 ? colors.success : colors.error, 0.12), px: 0.5, py: 0.1, borderRadius: 0.5 }}>P&L</Box>
                              {g.gain >= 0 ? "+" : ""}{g.gainPct.toFixed(1)}%
                            </Typography>
                          )}
                          <Typography sx={{ fontSize: 10, fontWeight: 600, color: g.dayChange >= 0 ? colors.success : colors.error, display: "flex", alignItems: "center", gap: 0.4 }}>
                            <Box component="span" sx={{ fontSize: 8, fontWeight: 700, bgcolor: alpha(g.dayChange >= 0 ? colors.success : colors.error, 0.12), px: 0.5, py: 0.1, borderRadius: 0.5 }}>1D</Box>
                            {g.dayChange >= 0 ? "+" : ""}{g.dayPct.toFixed(1)}%
                          </Typography>
                        </Stack>
                      </Stack>
                    </Box>
                    <Collapse in={!isCollapsed}>
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gridAutoRows: "1fr", gap: 2, p: 2 }}>
                        {g.group.map((a, i) => (
                          <AccountCard key={a.id} a={a} i={i} onOpen={openAccount} onEdit={openEdit} onDelete={requestDelete} />
                        ))}
                      </Box>
                    </Collapse>
                  </Paper>
                </FadeIn>
              );
            })}
          </Stack>
        </FadeIn>
      ) : (
        <FadeIn delay={100}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gridAutoRows: "1fr", gap: 2 }}>
            {filtered.map((a, i) => (
              <AccountCard key={a.id} a={a} i={i} onOpen={openAccount} onEdit={openEdit} onDelete={requestDelete} />
            ))}
          </Box>
        </FadeIn>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle>New Account</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <Stack spacing={2}>
            <TextField label="Name" value={newName} onChange={e => setNewName(e.target.value)} fullWidth autoFocus />
            <TextField label="Type" value={newType} onChange={e => setNewType(e.target.value as AccountType)} select fullWidth>
              {ACCOUNT_TYPES.map(t => <MenuItem key={t} value={t}>{TYPE_LABELS[t]}</MenuItem>)}
            </TextField>
            <TextField label="Currency" value={newCurrency} onChange={e => setNewCurrency(e.target.value)} select fullWidth>
              {CURRENCIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
            <FormControlLabel control={<Switch checked={newActive} onChange={e => setNewActive(e.target.checked)} />} label="Active" />
            <FormControlLabel control={<Switch checked={newDailyData} onChange={e => setNewDailyData(e.target.checked)} />} label="Needs Daily Data" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editAccount} onClose={() => setEditAccount(null)} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle>Edit Account</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <Stack spacing={2}>
            <TextField label="Name" value={editName} onChange={e => setEditName(e.target.value)} fullWidth autoFocus />
            <FormControlLabel control={<Switch checked={editActive} onChange={e => setEditActive(e.target.checked)} />} label="Active" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditAccount(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdate} disabled={!editName.trim()}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Account</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{deleteConfirm?.name}</strong>? This will remove all associated holdings and transactions.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Fab onClick={() => setCreateOpen(true)}
        variant={isMobile ? "circular" : "extended"}
        sx={{
          position: "fixed",
          bottom: { xs: "calc(24px + env(safe-area-inset-bottom, 0px))", sm: 24 },
          right: { xs: 16, sm: 24 },
          bgcolor: colors.brand,
          color: colors.pureWhite,
          boxShadow: `0 4px 20px ${alpha(colors.brand, 0.4)}`,
          "&:hover": { bgcolor: colors.brandDark, boxShadow: `0 6px 28px ${alpha(colors.brand, 0.5)}` },
        }}>
        <AddIcon sx={isMobile ? {} : { mr: 0.5 }} />
        {!isMobile && "Add Account"}
      </Fab>
    </Stack>
  );
}

export default Accounts;
