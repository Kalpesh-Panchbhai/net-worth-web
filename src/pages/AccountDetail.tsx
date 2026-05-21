import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, TextField, Button, MenuItem, Avatar,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, IconButton, Fab, Breadcrumbs, Link as MuiLink,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import ReceiptOutlinedIcon from "@mui/icons-material/ReceiptOutlined";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { useUser } from "../context/UserContext";
import {
  getAccounts, getHoldings, createHolding, deleteHolding,
  getTransactions, createTransaction, deleteTransaction,
  invalidateCache,
} from "../api/client";
import { EmptyState, ErrorState, ListSkeleton, TintedChip, FadeIn } from "../components/shared";
import { tokens } from "../theme";
import type { AccountSummary, HoldingSummary, Transaction } from "../api/types";

const { colors, shadow, typeColors } = tokens;

const TYPE_LABELS: Record<string, string> = {
  BROKER: "Broker", SAVINGS: "Savings", CREDIT_CARD: "Credit Card", LOAN: "Loan", OTHER: "Other",
};
const HERO_GRADIENTS: Record<string, string> = {
  BROKER:      "linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)",
  SAVINGS:     "linear-gradient(135deg, #059669 0%, #10B981 100%)",
  CREDIT_CARD: "linear-gradient(135deg, #DC2626 0%, #F97316 100%)",
  LOAN:        "linear-gradient(135deg, #D97706 0%, #F59E0B 100%)",
  OTHER:       "linear-gradient(135deg, #475569 0%, #64748B 100%)",
};

function fmt(v: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
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

  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Holdings (broker accounts)
  const [holdings, setHoldings] = useState<HoldingSummary[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [createHoldingOpen, setCreateHoldingOpen] = useState(false);
  const [newHoldingName, setNewHoldingName] = useState("");
  const [newHoldingSymbol, setNewHoldingSymbol] = useState("");
  const [deleteHoldingConfirm, setDeleteHoldingConfirm] = useState<HoldingSummary | null>(null);

  // Transactions (non-broker accounts)
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txnLoading, setTxnLoading] = useState(false);
  const [createTxnOpen, setCreateTxnOpen] = useState(false);
  const [txnDate, setTxnDate] = useState("");
  const [txnInvested, setTxnInvested] = useState("");
  const [txnValue, setTxnValue] = useState("");
  const [txnMode, setTxnMode] = useState("add");
  const [deleteTxnConfirm, setDeleteTxnConfirm] = useState<Transaction | null>(null);

  const [saving, setSaving] = useState(false);

  const isBroker = account?.type === "BROKER";
  const numAccountId = Number(accountId);

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
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load holdings"); }
    finally { setHoldingsLoading(false); }
  }, [isBroker, numAccountId]);

  const loadTransactions = useCallback(async () => {
    if (isBroker || !numAccountId) return;
    try { setTxnLoading(true); setTransactions(await getTransactions({ accountId: numAccountId })); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load transactions"); }
    finally { setTxnLoading(false); }
  }, [isBroker, numAccountId]);

  useEffect(() => { loadAccount(); }, [loadAccount]);
  useEffect(() => { if (account) { if (isBroker) loadHoldings(); else loadTransactions(); } }, [account, isBroker, loadHoldings, loadTransactions]);

  // Holdings actions
  const handleCreateHolding = async () => {
    if (!newHoldingName.trim() || !newHoldingSymbol.trim()) return;
    try {
      setSaving(true);
      await createHolding({ accountId: numAccountId, name: newHoldingName.trim(), symbol: newHoldingSymbol.trim() });
      setCreateHoldingOpen(false); setNewHoldingName(""); setNewHoldingSymbol("");
      invalidateCache("holdings"); await loadHoldings();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to create"); }
    finally { setSaving(false); }
  };

  const handleDeleteHolding = async () => {
    if (!deleteHoldingConfirm) return;
    try { await deleteHolding(deleteHoldingConfirm.id); setDeleteHoldingConfirm(null); invalidateCache("holdings"); await loadHoldings(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to delete"); }
  };

  // Transaction actions
  const handleCreateTxn = async () => {
    if (!txnDate || !txnInvested || !txnValue) return;
    try {
      setSaving(true);
      await createTransaction({ accountId: numAccountId, holdingId: numAccountId, txnDate, invested: parseFloat(txnInvested), value: parseFloat(txnValue), mode: txnMode });
      setCreateTxnOpen(false); setTxnDate(""); setTxnInvested(""); setTxnValue(""); setTxnMode("add");
      invalidateCache("transactions"); await loadTransactions();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to create"); }
    finally { setSaving(false); }
  };

  const handleDeleteTxn = async () => {
    if (!deleteTxnConfirm) return;
    try { await deleteTransaction(deleteTxnConfirm.id); setDeleteTxnConfirm(null); invalidateCache("transactions"); await loadTransactions(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to delete"); }
  };

  if (error && !account && !loading) return <ErrorState message={error} onRetry={loadAccount} />;

  const acctGain = account ? account.currentDayValue - account.invested : 0;
  const acctGainPct = account && account.invested > 0 ? (acctGain / account.invested) * 100 : 0;
  const heroGradient = account ? HERO_GRADIENTS[account.type] || HERO_GRADIENTS.OTHER : HERO_GRADIENTS.OTHER;
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

      {loading ? <ListSkeleton rows={3} /> : account && (
        <>
          {/* ── Account Hero Card ── */}
          <FadeIn>
            <Paper sx={{
              p: { xs: 3, sm: 4 }, borderRadius: 4, border: "none",
              background: heroGradient, color: colors.white,
              position: "relative", overflow: "hidden",
              boxShadow: `0 8px 32px ${alpha(tc, 0.3)}`,
            }}>
              <Box sx={{ position: "absolute", top: -50, right: -50, width: 180, height: 180, borderRadius: "50%", bgcolor: alpha(colors.white, 0.06) }} />
              <Box sx={{ position: "absolute", bottom: -30, right: 80, width: 100, height: 100, borderRadius: "50%", bgcolor: alpha(colors.white, 0.04) }} />

              <Box sx={{ position: "relative", zIndex: 1 }}>
                <Typography sx={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.75, mb: 0.5 }}>
                  {TYPE_LABELS[account.type] || account.type} · {account.currency}
                </Typography>
                <Typography sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" }, fontWeight: 700, mb: 1.5, opacity: 0.95 }}>
                  {account.name}
                </Typography>
                <Typography sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem" }, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                  {fmt(account.currentDayValue, account.currency)}
                </Typography>
              </Box>

              <Stack direction="row" spacing={1.5} sx={{ mt: 2, position: "relative", zIndex: 1 }} flexWrap="wrap">
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.5, borderRadius: 2, bgcolor: alpha(colors.white, 0.12), fontSize: "0.78rem", fontWeight: 600 }}>
                  Invested: {fmt(account.invested, account.currency)}
                </Box>
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.5, borderRadius: 2, bgcolor: alpha(colors.white, acctGain >= 0 ? 0.15 : 0.12), fontSize: "0.78rem", fontWeight: 600 }}>
                  {acctGain >= 0 ? <TrendingUpIcon sx={{ fontSize: 14 }} /> : <TrendingDownIcon sx={{ fontSize: 14 }} />}
                  {acctGain >= 0 ? "+" : ""}{fmt(acctGain, account.currency)} ({acctGainPct >= 0 ? "+" : ""}{acctGainPct.toFixed(1)}%)
                </Box>
              </Stack>
            </Paper>
          </FadeIn>

          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

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
                      return (
                        <FadeIn key={h.id} delay={i * 40}>
                          <Paper
                            onClick={() => navigate(`/accounts/${accountId}/holdings/${h.id}`)}
                            sx={{
                              p: 2.5, cursor: "pointer", borderRadius: 3,
                              transition: "all 0.2s ease",
                              "&:hover": { boxShadow: shadow.hover, transform: "translateY(-2px)" },
                            }}
                          >
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                              <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", minWidth: 0 }}>
                                <Avatar sx={{ width: 40, height: 40, bgcolor: alpha(colors.brand, 0.08), color: colors.brand, fontSize: "0.7rem", fontWeight: 800, borderRadius: 2.5 }}>
                                  {h.symbol.slice(0, 3)}
                                </Avatar>
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography sx={{ fontWeight: 650, fontSize: "0.9rem", lineHeight: 1.2 }} noWrap>{h.name}</Typography>
                                  <Typography variant="caption" sx={{ color: colors.gray400 }}>{h.symbol} · {h.units} units</Typography>
                                </Box>
                              </Box>
                              <Stack direction="row" spacing={0} onClick={e => e.stopPropagation()} sx={{ ml: 1 }}>
                                <IconButton size="small" onClick={() => setDeleteHoldingConfirm(h)} sx={{ color: colors.gray400 }}>
                                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                                <ChevronRightRoundedIcon fontSize="small" sx={{ color: colors.gray300, mt: 0.5 }} />
                              </Stack>
                            </Stack>
                            <Typography sx={{ fontSize: "1.25rem", fontWeight: 750, letterSpacing: "-0.02em", mt: 1.5, mb: 0.5 }}>
                              {fmt(h.currentDayValue, account.currency)}
                            </Typography>
                            <TintedChip
                              label={`${gain >= 0 ? "+" : ""}${gainPct.toFixed(1)}% · ${gain >= 0 ? "+" : ""}${fmt(gain, account.currency)}`}
                              color={gain >= 0 ? colors.success : colors.error}
                              size="small"
                            />
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
                    action={{ label: "Add Transaction", onClick: () => setCreateTxnOpen(true) }}
                  />
                </Paper>
              ) : (
                <>
                  <Typography variant="subtitle1" sx={{ color: colors.gray500 }}>
                    {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
                  </Typography>
                  <Stack spacing={0}>
                    {transactions.map((t, i) => {
                      const gain = t.value - t.invested;
                      const gainPct = t.invested > 0 ? (gain / t.invested) * 100 : 0;
                      const dt = parseTxnDate(t.txnDate);
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
                                bgcolor: gain >= 0 ? alpha(colors.success, 0.08) : alpha(colors.error, 0.08),
                                display: "flex", flexDirection: "column",
                                alignItems: "center", justifyContent: "center",
                              }}>
                                <Typography sx={{ fontSize: "1rem", fontWeight: 750, lineHeight: 1, color: gain >= 0 ? colors.success : colors.error }}>
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
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, color: colors.gray500 }}>
                                      {dt.full}
                                    </Typography>
                                  </Stack>
                                  <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                                    <Box>
                                      <Typography variant="caption" sx={{ color: colors.gray400, display: "block", lineHeight: 1 }}>Invested</Typography>
                                      <Typography sx={{ fontSize: "0.95rem", fontWeight: 650, mt: 0.25 }}>{fmt(t.invested, account.currency)}</Typography>
                                    </Box>
                                    <Box sx={{ color: colors.gray300, display: "flex", alignItems: "center" }}>→</Box>
                                    <Box>
                                      <Typography variant="caption" sx={{ color: colors.gray400, display: "block", lineHeight: 1 }}>Units</Typography>
                                      <Typography sx={{ fontSize: "0.95rem", fontWeight: 650, mt: 0.25 }}>{fmt(t.value, account.currency)}</Typography>
                                    </Box>
                                  </Stack>
                                </Box>
                                <Stack alignItems="flex-end" spacing={0.5}>
                                  <IconButton size="small" onClick={() => setDeleteTxnConfirm(t)} sx={{ color: colors.gray400, mt: -0.5 }}>
                                    <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                  <TintedChip
                                    label={`${gain >= 0 ? "+" : ""}${fmt(gain, account.currency)}`}
                                    color={gain >= 0 ? colors.success : colors.error}
                                    size="small"
                                  />
                                  <Typography variant="caption" sx={{ fontWeight: 600, color: gain >= 0 ? colors.success : colors.error }}>
                                    {gainPct >= 0 ? "+" : ""}{gainPct.toFixed(1)}%
                                  </Typography>
                                </Stack>
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

      {/* Create Holding */}
      <Dialog open={createHoldingOpen} onClose={() => setCreateHoldingOpen(false)} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle>New Holding</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <Stack spacing={2}>
            <TextField label="Name" value={newHoldingName} onChange={e => setNewHoldingName(e.target.value)} fullWidth autoFocus />
            <TextField label="Symbol" value={newHoldingSymbol} onChange={e => setNewHoldingSymbol(e.target.value)} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateHoldingOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateHolding} disabled={saving || !newHoldingName.trim() || !newHoldingSymbol.trim()}>Create</Button>
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
            <TextField label="Date" type="date" value={txnDate} onChange={e => setTxnDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="Invested" type="number" inputMode="decimal" value={txnInvested} onChange={e => setTxnInvested(e.target.value)} fullWidth />
            <TextField label="Value" type="number" inputMode="decimal" value={txnValue} onChange={e => setTxnValue(e.target.value)} fullWidth />
            <TextField label="Mode" value={txnMode} onChange={e => setTxnMode(e.target.value)} select fullWidth>
              <MenuItem value="add">Add</MenuItem>
              <MenuItem value="subtract">Subtract</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateTxnOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateTxn} disabled={saving || !txnDate || !txnInvested || !txnValue}>Create</Button>
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

      {/* FAB — hidden for inactive accounts */}
      {account && account.isActive && (
        <Fab onClick={() => isBroker ? setCreateHoldingOpen(true) : setCreateTxnOpen(true)}
          variant={isMobile ? "circular" : "extended"}
          sx={{
            position: "fixed",
            bottom: 24,
            right: { xs: 16, sm: 24 },
            background: heroGradient,
            color: colors.white,
            boxShadow: `0 4px 20px ${alpha(tc, 0.4)}`,
            "&:hover": { filter: "brightness(0.9)", boxShadow: `0 6px 28px ${alpha(tc, 0.5)}` },
          }}>
          <AddIcon sx={isMobile ? {} : { mr: 0.5 }} />
          {!isMobile && (isBroker ? "Add Holding" : "Add Transaction")}
        </Fab>
      )}
    </Stack>
  );
}

export default AccountDetail;
