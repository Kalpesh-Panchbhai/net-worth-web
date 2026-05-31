import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, TextField, Button, MenuItem, Avatar,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, IconButton, Fab, Breadcrumbs, Link as MuiLink,
  useMediaQuery, useTheme, CircularProgress, InputAdornment, ListItemAvatar,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import ReceiptOutlinedIcon from "@mui/icons-material/ReceiptOutlined";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import { useUser } from "../context/UserContext";
import {
  getAccounts, getHoldings, createHolding, deleteHolding,
  getTransactions, createTransaction, deleteTransaction,
  getAccountWatchlists, getWatchlists, linkWatchlistAccount, unlinkWatchlistAccount,
  invalidateCache, searchSymbol,
} from "../api/client";
import type { YahooQuote } from "../api/client";
import Chip from "@mui/material/Chip";
import Checkbox from "@mui/material/Checkbox";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ListItemIcon from "@mui/material/ListItemIcon";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { EmptyState, ErrorState, ListSkeleton, FadeIn } from "../components/shared";
import EntityChart from "../components/EntityChart";
import XirrBadge from "../components/XirrBadge";
import { computeXirr } from "../utils/xirr";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import type { AccountSummary, HoldingSummary, Transaction, WatchlistSummary } from "../api/types";

const TYPE_LABELS: Record<string, string> = {
  BROKER: "Broker", SAVINGS: "Savings", CREDIT_CARD: "Credit Card", LOAN: "Loan", OTHER: "Other",
};

function fmt(v: number, currency = "INR"): string {
  const hasDecimals = v % 1 !== 0;
  const abs = Math.abs(v);
  const formatted = new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: hasDecimals ? 2 : 0 }).format(abs);
  return v < 0 ? `-${formatted}` : formatted;
}

function fmtUnits(v: number): string {
  return v.toFixed(3);
}

function parseTxnDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return {
    day: d.getDate(),
    month: d.toLocaleDateString("en-IN", { month: "short" }),
    year: d.getFullYear(),
    full: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
  };
}

function AccountDetail() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const { userId } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, shadow, typeColors } = useTokens();
  const { showToast } = useToast();

  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Holdings (broker accounts)
  const [holdings, setHoldings] = useState<HoldingSummary[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [createHoldingOpen, setCreateHoldingOpen] = useState(false);
  const [holdingSearch, setHoldingSearch] = useState("");
  const [holdingResults, setHoldingResults] = useState<YahooQuote[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [deleteHoldingConfirm, setDeleteHoldingConfirm] = useState<HoldingSummary | null>(null);

  // Transactions (non-broker accounts)
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txnLoading, setTxnLoading] = useState(false);
  const [xirrLoading, setXirrLoading] = useState(true);
  const [createTxnOpen, setCreateTxnOpen] = useState(false);
  const [txnDate, setTxnDate] = useState("");
  const [txnInvested, setTxnInvested] = useState("");
  const [txnValue, setTxnValue] = useState("");
  const [txnMode, setTxnMode] = useState("add");
  const [deleteTxnConfirm, setDeleteTxnConfirm] = useState<Transaction | null>(null);

  // Watchlists
  const [accountWatchlists, setAccountWatchlists] = useState<WatchlistSummary[]>([]);
  const [wlDialogOpen, setWlDialogOpen] = useState(false);
  const [allWatchlists, setAllWatchlists] = useState<WatchlistSummary[]>([]);
  const [linkedWlIds, setLinkedWlIds] = useState<Set<number>>(new Set());
  const [wlDialogLoading, setWlDialogLoading] = useState(false);

  const isBroker = account?.type === "BROKER";
  const showInvested = isBroker || (account?.needsDailyData ?? false);
  const numAccountId = Number(accountId);

  const loadAccountWatchlists = useCallback(async () => {
    if (!numAccountId) return;
    try { setAccountWatchlists(await getAccountWatchlists(numAccountId)); }
    catch { /* silent */ }
  }, [numAccountId]);

  const loadAccount = useCallback(async () => {
    if (!userId || !accountId) return;
    try {
      setLoading(true); setError(null);
      const accounts = await getAccounts(userId);
      const found = accounts.find(a => a.id === numAccountId);
      if (found) setAccount(found); else setError("Account not found");
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [userId, accountId]);

  const loadHoldings = useCallback(async () => {
    if (!isBroker || !numAccountId) return;
    try { setHoldingsLoading(true); setHoldings(await getHoldings(numAccountId)); }
    catch (err) { showToast(err instanceof Error ? err.message : "Failed to load holdings", "error"); }
    finally { setHoldingsLoading(false); }
  }, [isBroker, numAccountId]);

  // For non-broker accounts, resolve the default holding ID
  const [defaultHoldingId, setDefaultHoldingId] = useState<number | null>(null);

  const loadTransactions = useCallback(async () => {
    if (isBroker || !numAccountId) return;
    try {
      setTxnLoading(true); setXirrLoading(true);
      const [txns, h] = await Promise.all([
        getTransactions({ accountId: numAccountId }),
        getHoldings(numAccountId),
      ]);
      setTransactions(txns);
      if (h.length > 0) setDefaultHoldingId(h[0].id);
    }
    catch (err) { showToast(err instanceof Error ? err.message : "Failed to load transactions", "error"); }
    finally { setTxnLoading(false); setXirrLoading(false); }
  }, [isBroker, numAccountId]);

  // For broker accounts: load all txns (for XIRR) in addition to holdings list
  const loadBrokerTransactions = useCallback(async () => {
    if (!isBroker || !numAccountId) return;
    setXirrLoading(true);
    try { setTransactions(await getTransactions({ accountId: numAccountId })); }
    catch { /* silent — XIRR optional */ }
    finally { setXirrLoading(false); }
  }, [isBroker, numAccountId]);

  useEffect(() => { loadAccount(); }, [loadAccount]);
  useEffect(() => { loadAccountWatchlists(); }, [loadAccountWatchlists]);
  useEffect(() => { if (account) { if (isBroker) { loadHoldings(); loadBrokerTransactions(); } else loadTransactions(); } }, [account, isBroker, loadHoldings, loadTransactions, loadBrokerTransactions]);
  useEffect(() => { if (account && !showInvested) setXirrLoading(false); }, [account, showInvested]);

  // Debounced Yahoo Finance search
  useEffect(() => {
    const q = holdingSearch.trim();
    if (!q) { setHoldingResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchSymbol(q);
      setHoldingResults(results);
      setIsSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [holdingSearch]);

  // Holdings actions
  const handleCreateHoldingFromQuote = async (quote: YahooQuote) => {
    const name = quote.longname || quote.shortname || quote.symbol;
    const symbol = quote.symbol;
    const prev = holdings;
    const tempId = -Date.now();
    const optimistic: HoldingSummary = { id: tempId, accountId: numAccountId, name, symbol, units: 0, currentDayValue: 0, previousDayValue: 0, invested: 0 };
    setHoldings(h => [...h, optimistic]);
    setCreateHoldingOpen(false); setHoldingSearch(""); setHoldingResults([]);
    try {
      const created = await createHolding({ accountId: numAccountId, name, symbol });
      setHoldings(h => h.map(hld => hld.id === tempId ? { ...optimistic, ...created } : hld));
      invalidateCache("holdings");
      showToast(`Holding "${name}" created`);
    } catch (err) {
      setHoldings(prev);
      showToast(err instanceof Error ? err.message : "Failed to create holding", "error");
    }
  };

  const handleDeleteHolding = async () => {
    if (!deleteHoldingConfirm) return;
    const { id, name } = deleteHoldingConfirm;
    const prev = holdings;
    setHoldings(h => h.filter(hld => hld.id !== id));
    setDeleteHoldingConfirm(null);
    try {
      await deleteHolding(id);
      invalidateCache("holdings");
      showToast(`Holding "${name}" deleted`);
    } catch (err) {
      setHoldings(prev);
      showToast(err instanceof Error ? err.message : "Failed to delete holding", "error");
    }
  };

  // Transaction actions
  // Last transaction date (newest first) — restrict new txns to after last date
  const lastTxnDate = transactions.length > 0 ? transactions[0].txnDate : "";
  const _now = new Date();
  const todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
  const minTxnDate = lastTxnDate ? (() => { const d = new Date(lastTxnDate + "T00:00:00"); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })() : "";
  const canAddTxn = !minTxnDate || minTxnDate <= todayStr;

  const handleCreateTxn = async () => {
    if (!txnDate || !txnValue || (showInvested && !txnInvested) || !defaultHoldingId) return;
    let invested = showInvested ? parseFloat(parseFloat(txnInvested).toFixed(2)) : parseFloat(parseFloat(txnValue).toFixed(2));
    let value = parseFloat(parseFloat(txnValue).toFixed(2));
    // Add mode: add to last transaction's cumulative values
    if (txnMode === "add" && transactions.length > 0) {
      const last = transactions[0];
      invested = parseFloat((last.invested + invested).toFixed(2));
      value = parseFloat((last.value + value).toFixed(2));
    }
    const date = txnDate;
    const holdingId = defaultHoldingId;
    const prev = transactions;
    const tempId = -Date.now();
    const optimistic: Transaction = { id: tempId, accountId: numAccountId, holdingId, txnDate: date, invested, value };
    setTransactions(t => [optimistic, ...t]);
    setCreateTxnOpen(false); setTxnDate(""); setTxnInvested(""); setTxnValue(""); setTxnMode("add");
    try {
      const created = await createTransaction({ accountId: numAccountId, holdingId, txnDate: date, invested, value, mode: "update" });
      setTransactions(t => t.map(txn => txn.id === tempId ? created : txn));
      invalidateCache("transactions");
      showToast(`Transaction on ${date} created`);
    } catch (err) {
      setTransactions(prev);
      showToast(err instanceof Error ? err.message : "Failed to create transaction", "error");
    }
  };

  const handleDeleteTxn = async () => {
    if (!deleteTxnConfirm) return;
    const { id, txnDate: date } = deleteTxnConfirm;
    const prev = transactions;
    setTransactions(t => t.filter(txn => txn.id !== id));
    setDeleteTxnConfirm(null);
    try {
      await deleteTransaction(id);
      invalidateCache("transactions");
      showToast(`Transaction on ${date} deleted`);
    } catch (err) {
      setTransactions(prev);
      showToast(err instanceof Error ? err.message : "Failed to delete transaction", "error");
    }
  };

  // Watchlist dialog
  const openWlDialog = async () => {
    if (!userId) return;
    setWlDialogOpen(true); setWlDialogLoading(true);
    try {
      const [all, linked] = await Promise.all([getWatchlists(userId), getAccountWatchlists(numAccountId)]);
      setAllWatchlists(all.filter(w => w.name !== "All"));
      setLinkedWlIds(new Set(linked.map(w => w.id)));
    } catch (err) { showToast(err instanceof Error ? err.message : "Failed to load watchlists", "error"); }
    finally { setWlDialogLoading(false); }
  };

  const toggleWl = async (wlId: number) => {
    const isLinked = linkedWlIds.has(wlId);
    const wlName = allWatchlists.find(w => w.id === wlId)?.name || "Watchlist";
    try {
      if (isLinked) {
        await unlinkWatchlistAccount(wlId, numAccountId);
        setLinkedWlIds(prev => { const n = new Set(prev); n.delete(wlId); return n; });
        showToast(`Removed from "${wlName}"`);
      } else {
        await linkWatchlistAccount(wlId, numAccountId);
        setLinkedWlIds(prev => new Set(prev).add(wlId));
        showToast(`Added to "${wlName}"`);
      }
      invalidateCache("watchlist"); invalidateCache("account-watchlist");
    } catch (err) { showToast(err instanceof Error ? err.message : "Failed to update watchlist", "error"); }
  };

  const closeWlDialog = () => {
    setWlDialogOpen(false);
    loadAccountWatchlists();
  };

  if (error && !account && !loading) return <ErrorState message={error} onRetry={loadAccount} />;

  const acctGain = account ? account.currentDayValue - account.invested : 0;
  const acctGainPct = account && account.invested > 0 ? (acctGain / account.invested) * 100 : 0;
  const acctDayChg = account ? account.currentDayValue - account.previousDayValue : 0;
  const acctDayPct = account && account.previousDayValue > 0 ? (acctDayChg / account.previousDayValue) * 100 : 0;
  const acctXirr = showInvested && account && transactions.length > 0 ? computeXirr(transactions, account.currentDayValue) : null;
  const tc = account ? (typeColors[account.type] || colors.gray500) : colors.gray500;

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
      {/* Breadcrumbs */}
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
        <MuiLink underline="hover" color="inherit" sx={{ cursor: "pointer" }} onClick={() => navigate("/accounts")}>
          Accounts
        </MuiLink>
        <Typography color="text.primary">{account?.name || "..."}</Typography>
      </Breadcrumbs>

      {loading || xirrLoading ? <ListSkeleton rows={3} /> : account && (
        <>
          {/* ── Account Hero Card ── */}
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
                border: "none", borderLeft: `4px solid ${tc}`,
                boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.3)" : "0 4px 20px rgba(0,0,0,0.08)",
                ...(account && !account.isActive && { opacity: 0.75, filter: "saturate(0.5)" }),
              }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography sx={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: heroMuted }}>
                    {TYPE_LABELS[account.type] || account.type} · {account.currency}
                  </Typography>
                  {!account.isActive && (
                    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, px: 1, py: 0.2, borderRadius: 1.5, bgcolor: heroSubtle, fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: heroMuted }}>
                      <PauseCircleOutlineIcon sx={{ fontSize: 12 }} /> Inactive
                    </Box>
                  )}
                  <Box sx={{ flex: 1 }} />
                  <XirrBadge value={acctXirr} size="lg" />
                </Stack>
                <Typography sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" }, fontWeight: 700, mb: 1.5, color: heroText }}>
                  {account.name}
                </Typography>

                <Box sx={{ px: 2, py: 1.5, borderRadius: 2, bgcolor: heroSubtle, display: "inline-block" }}>
                  <Typography sx={{ fontSize: "0.7rem", fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
                    Current Value
                  </Typography>
                  <Typography sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem" }, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, color: heroText }}>
                    {fmt(account.currentDayValue, account.currency)}
                  </Typography>
                </Box>

                <Stack direction="row" sx={{ mt: 2.5, gap: { xs: 1, sm: 2 }, flexWrap: "wrap" }}>
                  {showInvested && (
                    <Box sx={{ flex: "1 1 auto", minWidth: { xs: "calc(50% - 8px)", sm: 120 }, p: 1.5, borderRadius: 2, bgcolor: alpha(heroInvested, isDark ? 0.1 : 0.06) }}>
                      <Typography sx={{ fontSize: "0.65rem", fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.5 }}>
                        Invested
                      </Typography>
                      <Typography sx={{ fontSize: "0.95rem", fontWeight: 700, color: heroInvested }}>
                        {fmt(account.invested, account.currency)}
                      </Typography>
                    </Box>
                  )}
                  {showInvested && account.invested > 0 && (
                    <Box sx={{ flex: "1 1 auto", minWidth: { xs: "calc(50% - 8px)", sm: 120 }, p: 1.5, borderRadius: 2, bgcolor: alpha(acctGain >= 0 ? heroSuccess : heroError, isDark ? 0.1 : 0.06) }}>
                      <Typography sx={{ fontSize: "0.65rem", fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.5 }}>
                        Total P&L
                      </Typography>
                      <Typography noWrap sx={{ fontSize: { xs: "0.8rem", sm: "0.95rem" }, fontWeight: 700, color: acctGain >= 0 ? heroSuccess : heroError }}>
                        {acctGain >= 0 ? "+" : ""}{fmt(acctGain, account.currency)}
                      </Typography>
                      <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, color: acctGain >= 0 ? heroSuccess : heroError, opacity: 0.8 }}>
                        {acctGainPct >= 0 ? "+" : ""}{acctGainPct.toFixed(1)}%
                      </Typography>
                    </Box>
                  )}
                  <Box sx={{ flex: "1 1 auto", minWidth: { xs: "calc(50% - 8px)", sm: 120 }, p: 1.5, borderRadius: 2, bgcolor: alpha(acctDayChg >= 0 ? heroSuccess : heroError, isDark ? 0.1 : 0.06) }}>
                    <Typography sx={{ fontSize: "0.65rem", fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.5 }}>
                      Today
                    </Typography>
                    <Typography noWrap sx={{ fontSize: { xs: "0.8rem", sm: "0.95rem" }, fontWeight: 700, color: acctDayChg >= 0 ? heroSuccess : heroError }}>
                      {acctDayChg >= 0 ? "+" : ""}{fmt(acctDayChg, account.currency)}
                    </Typography>
                    <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, color: acctDayChg >= 0 ? heroSuccess : heroError, opacity: 0.8 }}>
                      {acctDayPct >= 0 ? "+" : ""}{acctDayPct.toFixed(1)}%
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
              );
            })()}
          </FadeIn>

          {/* ── Watchlists ── */}
          {accountWatchlists.length > 0 && (
            <FadeIn delay={50}>
              <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                <VisibilityRoundedIcon sx={{ fontSize: 16, color: colors.gray400 }} />
                {accountWatchlists.filter(w => w.name !== "All").map(w => (
                  <Chip
                    key={w.id}
                    label={w.name}
                    size="small"
                    onClick={() => navigate(`/watchlists/${w.id}`)}
                    sx={{ fontWeight: 600, fontSize: "0.75rem", cursor: "pointer", bgcolor: alpha(colors.accent, 0.1), color: colors.accent, "&:hover": { bgcolor: alpha(colors.accent, 0.18) } }}
                  />
                ))}
                {account?.isActive && (
                  <Chip
                    label="+ Watchlist"
                    size="small"
                    variant="outlined"
                    onClick={() => openWlDialog()}
                    sx={{ fontWeight: 600, fontSize: "0.75rem", cursor: "pointer", borderColor: colors.gray300, color: colors.gray500, "&:hover": { borderColor: colors.accent, color: colors.accent } }}
                  />
                )}
              </Stack>
            </FadeIn>
          )}
          {accountWatchlists.length === 0 && account?.isActive && (
            <FadeIn delay={50}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label="+ Add to Watchlist"
                  size="small"
                  variant="outlined"
                  onClick={() => openWlDialog()}
                  sx={{ fontWeight: 600, fontSize: "0.75rem", cursor: "pointer", borderColor: colors.gray300, color: colors.gray500, "&:hover": { borderColor: colors.accent, color: colors.accent } }}
                />
              </Stack>
            </FadeIn>
          )}

          {/* ── Chart ── */}
          <FadeIn delay={80}>
            <EntityChart entityType="account" entityId={numAccountId} accentColor={tc} currency={account.currency} showInvested={showInvested} />
          </FadeIn>

          {/* ── BROKER: Holdings cards ── */}
          {isBroker && (
            <>
              {holdingsLoading ? <ListSkeleton rows={4} /> : holdings.length === 0 ? (
                <Paper>
                  <EmptyState
                    icon={<ShowChartIcon />}
                    title="No holdings"
                    description="Add your first holding to this broker account."
                    action={{ label: "Add Holding", onClick: () => setCreateHoldingOpen(true) }}
                  />
                </Paper>
              ) : (
                <FadeIn delay={100}>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
                    {holdings.map((h, i) => {
                      const gain = h.currentDayValue - h.invested;
                      const gainPct = h.invested > 0 ? (gain / h.invested) * 100 : 0;
                      const dayChg = h.currentDayValue - h.previousDayValue;
                      const dayPct = h.previousDayValue > 0 ? (dayChg / h.previousDayValue) * 100 : 0;
                      const hTxns = transactions.filter(t => t.holdingId === h.id);
                      const hXirr = hTxns.length > 0 ? computeXirr(hTxns, h.currentDayValue) : null;
                      const isDark = theme.palette.mode === "dark";
                      const cardMuted = isDark ? alpha(colors.pureWhite, 0.5) : colors.gray400;
                      const cardSubtle = isDark ? alpha(colors.pureWhite, 0.08) : colors.gray100;
                      const cardInvested = isDark ? "#60A5FA" : colors.brand;
                      const cardSuccess = isDark ? "#34D399" : colors.success;
                      const cardError = isDark ? "#F87171" : colors.error;
                      return (
                        <FadeIn key={h.id} delay={i * 40}>
                          <Paper
                            onClick={() => navigate(`/accounts/${accountId}/holdings/${h.id}`)}
                            sx={{
                              p: 2.5, cursor: "pointer", borderRadius: 3,
                              borderLeft: `4px solid ${colors.brand}`,
                              transition: "all 0.2s ease",
                              "&:hover": { boxShadow: shadow.hover, transform: "translateY(-2px)" },
                              height: "100%", display: "flex", flexDirection: "column",
                            }}
                          >
                            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, mb: 1.5 }}>
                              <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(colors.brand, 0.1), color: colors.brand, fontSize: "0.65rem", fontWeight: 800, borderRadius: 2 }}>
                                {h.symbol.slice(0, 3)}
                              </Avatar>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography sx={{ fontWeight: 650, fontSize: "0.9rem", lineHeight: 1.3 }} noWrap>{h.name}</Typography>
                                <Typography variant="caption" sx={{ color: cardMuted }}>{h.symbol} · {fmtUnits(h.units)} units</Typography>
                              </Box>
                              <Stack direction="row" spacing={0.5} alignItems="center" onClick={e => e.stopPropagation()} sx={{ ml: 1 }}>
                                <XirrBadge value={hXirr} size="sm" />
                                {account?.isActive && (<IconButton size="small" onClick={() => setDeleteHoldingConfirm(h)} sx={{ color: colors.error, opacity: 0.6, "&:hover": { opacity: 1, bgcolor: alpha(colors.error, 0.08) } }}>
                                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                                </IconButton>)}
                              </Stack>
                            </Box>

                            <Box sx={{ px: 1.5, py: 1, borderRadius: 1.5, bgcolor: cardSubtle, display: "inline-block", mb: 1.5, alignSelf: "flex-start" }}>
                              <Typography sx={{ fontSize: "0.6rem", fontWeight: 500, color: cardMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.15 }}>
                                Value
                              </Typography>
                              <Typography sx={{ fontSize: "1.25rem", fontWeight: 750, letterSpacing: "-0.02em" }}>
                                {fmt(h.currentDayValue, account.currency)}
                              </Typography>
                            </Box>

                            <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mt: "auto" }}>
                              <Box sx={{ flex: 1, minWidth: 80, p: 1, borderRadius: 1.5, bgcolor: alpha(cardInvested, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
                                <Typography sx={{ fontSize: "0.6rem", fontWeight: 500, color: cardMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
                                  Invested
                                </Typography>
                                <Typography noWrap sx={{ fontSize: "0.8rem", fontWeight: 700, color: cardInvested }}>
                                  {fmt(h.invested, account.currency)}
                                </Typography>
                              </Box>
                              {h.invested > 0 && (
                                <Box sx={{ flex: 1, minWidth: 80, p: 1, borderRadius: 1.5, bgcolor: alpha(gain >= 0 ? cardSuccess : cardError, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
                                  <Typography sx={{ fontSize: "0.6rem", fontWeight: 500, color: cardMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
                                    P&L
                                  </Typography>
                                  <Typography noWrap sx={{ fontSize: "0.8rem", fontWeight: 700, color: gain >= 0 ? cardSuccess : cardError }}>
                                    {gain >= 0 ? "+" : ""}{fmt(gain, account.currency)}
                                  </Typography>
                                  <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, color: gain >= 0 ? cardSuccess : cardError, opacity: 0.8 }}>
                                    {gain >= 0 ? "+" : ""}{gainPct.toFixed(1)}%
                                  </Typography>
                                </Box>
                              )}
                              <Box sx={{ flex: 1, minWidth: 80, p: 1, borderRadius: 1.5, bgcolor: alpha(dayChg >= 0 ? cardSuccess : cardError, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
                                <Typography sx={{ fontSize: "0.6rem", fontWeight: 500, color: cardMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
                                  Today
                                </Typography>
                                <Typography noWrap sx={{ fontSize: "0.8rem", fontWeight: 700, color: dayChg >= 0 ? cardSuccess : cardError }}>
                                  {dayChg >= 0 ? "+" : ""}{fmt(dayChg, account.currency)}
                                </Typography>
                                <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, color: dayChg >= 0 ? cardSuccess : cardError, opacity: 0.8 }}>
                                  {dayChg >= 0 ? "+" : ""}{dayPct.toFixed(2)}%
                                </Typography>
                              </Box>
                            </Stack>
                          </Paper>
                        </FadeIn>
                      );
                    })}
                  </Box>
                </FadeIn>
              )}
            </>
          )}

          {/* ── NON-BROKER: Transaction ledger ── */}
          {!isBroker && (
            <>
              {txnLoading ? <ListSkeleton rows={4} /> : transactions.length === 0 ? (
                <Paper>
                  <EmptyState
                    icon={<ReceiptOutlinedIcon />}
                    title="No transactions"
                    description="Add your first transaction to this account."
                    action={{ label: "Add Transaction", onClick: () => { if (!canAddTxn) { showToast("A transaction already exists for today. Try again tomorrow.", "warning"); return; } setCreateTxnOpen(true); } }}
                  />
                </Paper>
              ) : (
                <>
                  <Typography variant="subtitle1" sx={{ color: colors.gray500 }}>
                    {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
                  </Typography>
                  <Stack spacing={0}>
                    {transactions.map((t, i) => {
                        const dt = parseTxnDate(t.txnDate);
                        const prevValue = i < transactions.length - 1 ? transactions[i + 1].value : 0;
                        const prevInvested = i < transactions.length - 1 ? transactions[i + 1].invested : 0;
                        const delta = t.value - prevValue;
                        const investedDelta = t.invested - prevInvested;
                        const isAdd = delta >= 0;
                        const unitColor = isAdd ? colors.success : colors.error;
                        return (
                          <FadeIn key={t.id} delay={i * 30}>
                            <Box sx={{ display: "flex", gap: { xs: 1.5, sm: 2.5 }, alignItems: "flex-start", position: "relative" }}>
                              {/* Timeline connector */}
                              {i < transactions.length - 1 && (
                                <Box sx={{
                                  position: "absolute", left: 23, top: 52,
                                  width: 2, bottom: -4,
                                  bgcolor: colors.gray200,
                                }} />
                              )}
                              {/* Date bubble */}
                              <Box sx={{
                                width: 48, minWidth: 48, pt: 1.5,
                                display: "flex", flexDirection: "column", alignItems: "center",
                                position: "relative", zIndex: 1,
                              }}>
                                <Box sx={{
                                  width: 48, height: 48, borderRadius: 3,
                                  bgcolor: alpha(unitColor, 0.08),
                                  display: "flex", flexDirection: "column",
                                  alignItems: "center", justifyContent: "center",
                                }}>
                                  <Typography sx={{ fontSize: "1rem", fontWeight: 750, lineHeight: 1, color: unitColor }}>
                                    {dt.day}
                                  </Typography>
                                  <Typography sx={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", color: colors.gray500, lineHeight: 1, mt: 0.25 }}>
                                    {dt.month}
                                  </Typography>
                                </Box>
                              </Box>
                              {/* Transaction card */}
                              <Paper sx={{
                                flex: 1, p: 2, my: 0.75, borderRadius: 3,
                                transition: "all 0.2s ease",
                                "&:hover": { boxShadow: shadow.md },
                              }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                  <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, color: colors.gray500 }}>
                                      {dt.full}
                                    </Typography>

                                    {/* Invested: delta + total (only for broker or needsDailyData) */}
                                    {showInvested && (
                                    <Box sx={{ mt: 0.75, overflow: "hidden" }}>
                                      <Typography sx={{ fontSize: "1.05rem", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {`${investedDelta >= 0 ? "+" : ""}${fmt(investedDelta, account.currency)}`}
                                      </Typography>
                                      <Typography sx={{ fontSize: "0.75rem", color: colors.gray400, mt: 0.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        → Total: {fmt(t.invested, account.currency)}
                                      </Typography>
                                    </Box>
                                    )}

                                    {/* Amount/Units: delta + total */}
                                    <Box sx={{ mt: showInvested ? 0.5 : 0.75, overflow: "hidden" }}>
                                      <Typography sx={{ fontSize: showInvested ? "0.8rem" : "1.05rem", fontWeight: showInvested ? 650 : 700, color: showInvested ? unitColor : undefined, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {`${isAdd ? "+" : ""}${showInvested ? `${fmtUnits(delta)} units` : fmt(delta, account.currency)}`}
                                      </Typography>
                                      <Typography sx={{ fontSize: "0.75rem", color: colors.gray400, mt: 0.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        → Total: {showInvested ? `${fmtUnits(t.value)} units` : fmt(t.value, account.currency)}
                                      </Typography>
                                    </Box>
                                  </Box>
                                  {account?.isActive && (<IconButton size="small" onClick={() => setDeleteTxnConfirm(t)} sx={{ color: colors.error, opacity: 0.6, "&:hover": { opacity: 1, bgcolor: alpha(colors.error, 0.08) }, mt: -0.5 }}>
                                    <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                                  </IconButton>)}
                                </Stack>
                              </Paper>
                            </Box>
                          </FadeIn>
                        );
                    })}
                  </Stack>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ── Dialogs ── */}

      {/* Create Holding — Yahoo Finance Search */}
      <Dialog
        open={createHoldingOpen}
        onClose={() => { setCreateHoldingOpen(false); setHoldingSearch(""); setHoldingResults([]); }}
        fullScreen={isMobile}
        fullWidth maxWidth="sm"
        PaperProps={{ sx: { minHeight: isMobile ? undefined : 420 } }}
      >
        <DialogTitle>Add Holding</DialogTitle>
        <DialogContent sx={{ pt: "8px !important", px: 2, pb: 0 }}>
          <TextField
            placeholder="Search company name or symbol..."
            value={holdingSearch}
            onChange={e => setHoldingSearch(e.target.value)}
            fullWidth autoFocus
            size="small"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon sx={{ color: colors.gray400, fontSize: 20 }} />
                  </InputAdornment>
                ),
                endAdornment: isSearching ? (
                  <InputAdornment position="end">
                    <CircularProgress size={18} />
                  </InputAdornment>
                ) : null,
              },
            }}
          />
          <Box sx={{ mt: 1, maxHeight: isMobile ? "calc(100vh - 180px)" : 320, overflowY: "auto" }}>
            {holdingResults.length > 0 ? (
              <List dense disablePadding>
                {holdingResults.map(q => (
                  <ListItem key={q.symbol} disablePadding>
                    <ListItemButton onClick={() => handleCreateHoldingFromQuote(q)} sx={{ borderRadius: 1, py: 1 }}>
                      <ListItemAvatar sx={{ minWidth: 40 }}>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(colors.brand, 0.1), color: colors.brand, fontSize: 12, fontWeight: 700 }}>
                          {q.symbol.slice(0, 2)}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={q.longname || q.shortname || q.symbol}
                        secondary={
                          <span>
                            <strong>{q.symbol}</strong>
                            {q.exchDisp ? ` · ${q.exchDisp}` : ""}
                            {q.typeDisp ? ` · ${q.typeDisp}` : ""}
                          </span>
                        }
                        primaryTypographyProps={{ fontSize: 14, fontWeight: 500, noWrap: true }}
                        secondaryTypographyProps={{ fontSize: 12 }}
                      />
                      <AddCircleRoundedIcon sx={{ color: colors.brand, fontSize: 22, ml: 1 }} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            ) : holdingSearch.trim() && !isSearching ? (
              <Box sx={{ textAlign: "center", py: 5 }}>
                <SearchRoundedIcon sx={{ fontSize: 36, color: colors.gray300, mb: 1 }} />
                <Typography fontWeight={600} sx={{ mb: 0.5 }}>No results found</Typography>
                <Typography variant="body2" color="text.secondary">Try a different company name or symbol</Typography>
              </Box>
            ) : !holdingSearch.trim() ? (
              <Box sx={{ textAlign: "center", py: 5 }}>
                <ShowChartIcon sx={{ fontSize: 36, color: colors.gray300, mb: 1 }} />
                <Typography fontWeight={600} sx={{ mb: 0.5 }}>Search for a stock</Typography>
                <Typography variant="body2" color="text.secondary">e.g. AAPL, RELIANCE, GOOGL, INFY</Typography>
              </Box>
            ) : null}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCreateHoldingOpen(false); setHoldingSearch(""); setHoldingResults([]); }}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Holding */}
      <Dialog open={!!deleteHoldingConfirm} onClose={() => setDeleteHoldingConfirm(null)}>
        <DialogTitle>Delete Holding</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{deleteHoldingConfirm?.name}</strong>? All transactions will also be removed.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteHoldingConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteHolding}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Create Transaction */}
      <Dialog open={createTxnOpen} onClose={() => setCreateTxnOpen(false)} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle>New Transaction</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <Stack spacing={2}>
            <TextField label="Mode" value={txnMode} onChange={e => setTxnMode(e.target.value)} select fullWidth>
              <MenuItem value="add">Add</MenuItem>
              <MenuItem value="update">Update</MenuItem>
            </TextField>
            <TextField label="Amount" type="number" inputMode="decimal" value={txnValue} onChange={e => setTxnValue(e.target.value)} inputProps={{ step: "0.01" }} helperText={txnMode === "add" ? "Amount to add" : "Total amount (overwrites)"} fullWidth />
            {showInvested && <TextField label="Invested" type="number" inputMode="decimal" value={txnInvested} onChange={e => setTxnInvested(e.target.value)} inputProps={{ step: "0.01" }} helperText={txnMode === "add" ? "Investment to add" : "Total invested (overwrites)"} fullWidth />}
            <TextField label="Date" type="date" value={txnDate} onChange={e => { const v = e.target.value; if (v && ((minTxnDate && v < minTxnDate) || v > todayStr)) return; setTxnDate(v); }} error={!!txnDate && ((!!minTxnDate && txnDate < minTxnDate) || txnDate > todayStr)} helperText={minTxnDate ? `Select between ${minTxnDate} and ${todayStr}` : `Up to ${todayStr}`} InputLabelProps={{ shrink: true }} inputProps={{ min: minTxnDate || undefined, max: todayStr }} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateTxnOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateTxn} disabled={!txnDate || !txnValue || (showInvested && !txnInvested) || (!!minTxnDate && txnDate < minTxnDate) || txnDate > todayStr}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Transaction */}
      <Dialog open={!!deleteTxnConfirm} onClose={() => setDeleteTxnConfirm(null)}>
        <DialogTitle>Delete Transaction</DialogTitle>
        <DialogContent>
          <Typography>Delete the transaction from <strong>{deleteTxnConfirm?.txnDate}</strong>?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTxnConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteTxn}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Manage Watchlists Dialog */}
      <Dialog open={wlDialogOpen} onClose={closeWlDialog} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle>Manage Watchlists</DialogTitle>
        <DialogContent>
          {wlDialogLoading ? <ListSkeleton rows={3} /> : allWatchlists.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>No custom watchlists. Create one from the Watchlists page.</Typography>
          ) : (
            <List dense>
              {allWatchlists.map(w => (
                <ListItem key={w.id} disablePadding>
                  <ListItemButton onClick={() => toggleWl(w.id)}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox edge="start" checked={linkedWlIds.has(w.id)} tabIndex={-1} disableRipple />
                    </ListItemIcon>
                    <ListItemText primary={w.name} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={closeWlDialog}>Done</Button>
        </DialogActions>
      </Dialog>

      {/* FAB — hidden for inactive accounts */}
      {account && account.isActive && (
        <Fab onClick={() => { if (isBroker) { setCreateHoldingOpen(true); } else if (!canAddTxn) { showToast("A transaction already exists for today. Try again tomorrow.", "warning"); } else { setCreateTxnOpen(true); } }}
          variant={isMobile ? "circular" : "extended"}
          sx={{
            position: "fixed",
            bottom: 24,
            right: { xs: 16, sm: 24 },
            bgcolor: tc,
            color: colors.pureWhite,
            boxShadow: `0 4px 20px ${alpha(tc, 0.4)}`,
            "&:hover": { bgcolor: alpha(tc, 0.85), boxShadow: `0 6px 28px ${alpha(tc, 0.5)}` },
          }}>
          <AddIcon sx={isMobile ? {} : { mr: 0.5 }} />
          {!isMobile && (isBroker ? "Add Holding" : "Add Transaction")}
        </Fab>
      )}
    </Stack>
  );
}

export default AccountDetail;
