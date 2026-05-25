import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, TextField, Button, MenuItem, Avatar,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, IconButton, Fab, Breadcrumbs, Link as MuiLink,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ReceiptOutlinedIcon from "@mui/icons-material/ReceiptOutlined";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import { useUser } from "../context/UserContext";
import {
  getAccounts, getHoldings, getTransactions, createTransaction, deleteTransaction,
  invalidateCache,
} from "../api/client";
import { EmptyState, ErrorState, ListSkeleton, FadeIn } from "../components/shared";
import EntityChart from "../components/EntityChart";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import type { AccountSummary, HoldingSummary, Transaction } from "../api/types";

function fmt(v: number, currency = "INR"): string {
  const hasDecimals = v % 1 !== 0;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: hasDecimals ? 2 : 0 }).format(v);
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

function HoldingDetail() {
  const { accountId, holdingId } = useParams<{ accountId: string; holdingId: string }>();
  const navigate = useNavigate();
  const { userId } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, shadow } = useTokens();
  const { showToast } = useToast();

  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [holding, setHolding] = useState<HoldingSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [txnLoading, setTxnLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create transaction
  const [createOpen, setCreateOpen] = useState(false);
  const [txnDate, setTxnDate] = useState("");
  const [txnInvested, setTxnInvested] = useState("");
  const [txnValue, setTxnValue] = useState("");
  const [txnMode, setTxnMode] = useState("add");
  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<Transaction | null>(null);

  const numAccountId = Number(accountId);
  const numHoldingId = Number(holdingId);

  const loadContext = useCallback(async () => {
    if (!userId || !accountId || !holdingId) return;
    try {
      setLoading(true); setError(null);
      const [accounts, holdings] = await Promise.all([getAccounts(userId), getHoldings(numAccountId)]);
      const foundAccount = accounts.find(a => a.id === numAccountId);
      const foundHolding = holdings.find(h => h.id === numHoldingId);
      if (foundAccount) setAccount(foundAccount); else setError("Account not found");
      if (foundHolding) setHolding(foundHolding); else setError("Holding not found");
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [userId, accountId, holdingId]);

  const loadTransactions = useCallback(async () => {
    if (!numHoldingId) return;
    try { setTxnLoading(true); setTransactions(await getTransactions({ holdingId: numHoldingId })); }
    catch (err) { showToast(err instanceof Error ? err.message : "Failed to load transactions", "error"); }
    finally { setTxnLoading(false); }
  }, [numHoldingId]);

  useEffect(() => { loadContext(); }, [loadContext]);
  useEffect(() => { if (holding) loadTransactions(); }, [holding, loadTransactions]);

  const currency = account?.currency || "INR";

  // Last transaction date (newest first) — used to restrict date input
  const lastTxnDate = transactions.length > 0 ? transactions[0].txnDate : "";
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const minDate = lastTxnDate ? (() => { const d = new Date(lastTxnDate + "T00:00:00"); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })() : "";
  const canAddTxn = !minDate || minDate <= today;

  const handleCreate = async () => {
    if (!txnDate || !txnInvested || !txnValue) return;
    let invested = parseFloat(parseFloat(txnInvested).toFixed(2));
    let value = parseFloat(parseFloat(txnValue).toFixed(3));
    // Add mode: add to last transaction's cumulative values
    if (txnMode === "add" && transactions.length > 0) {
      const last = transactions[0];
      invested = parseFloat((last.invested + invested).toFixed(2));
      value = parseFloat((last.value + value).toFixed(3));
    }
    const date = txnDate;
    const prev = transactions;
    const tempId = -Date.now();
    const optimistic: Transaction = { id: tempId, accountId: numAccountId, holdingId: numHoldingId, txnDate: date, invested, value };
    setTransactions(t => [optimistic, ...t]);
    setCreateOpen(false); setTxnDate(""); setTxnInvested(""); setTxnValue(""); setTxnMode("add");
    try {
      const created = await createTransaction({ accountId: numAccountId, holdingId: numHoldingId, txnDate: date, invested, value, mode: "update" });
      setTransactions(t => t.map(txn => txn.id === tempId ? created : txn));
      invalidateCache("transactions");
      showToast(`Transaction on ${date} created`);
    } catch (err) {
      setTransactions(prev);
      showToast(err instanceof Error ? err.message : "Failed to create transaction", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const { id, txnDate: date } = deleteConfirm;
    const prev = transactions;
    setTransactions(t => t.filter(txn => txn.id !== id));
    setDeleteConfirm(null);
    try {
      await deleteTransaction(id);
      invalidateCache("transactions");
      showToast(`Transaction on ${date} deleted`);
    } catch (err) {
      setTransactions(prev);
      showToast(err instanceof Error ? err.message : "Failed to delete transaction", "error");
    }
  };

  if (error && !account && !loading) return <ErrorState message={error} onRetry={loadContext} />;

  const holdingGain = holding ? holding.currentDayValue - holding.invested : 0;
  const holdingGainPct = holding && holding.invested > 0 ? (holdingGain / holding.invested) * 100 : 0;
  const holdingDayChg = holding ? holding.currentDayValue - holding.previousDayValue : 0;
  const holdingDayPct = holding && holding.previousDayValue > 0 ? (holdingDayChg / holding.previousDayValue) * 100 : 0;

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
      {/* Breadcrumbs */}
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
        <MuiLink underline="hover" color="inherit" sx={{ cursor: "pointer" }} onClick={() => navigate("/accounts")}>
          Accounts
        </MuiLink>
        <MuiLink underline="hover" color="inherit" sx={{ cursor: "pointer" }} onClick={() => navigate(`/accounts/${accountId}`)}>
          {account?.name || "..."}
        </MuiLink>
        <Typography color="text.primary">{holding?.name || "..."}</Typography>
      </Breadcrumbs>

      {loading ? <ListSkeleton rows={3} /> : holding && (
        <>
          {/* ── Holding Hero Card ── */}
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
                ...(account && !account.isActive && { opacity: 0.75, filter: "saturate(0.5)" }),
              }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                  <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(colors.brand, 0.1), color: colors.brand, fontSize: "0.65rem", fontWeight: 800, borderRadius: 2 }}>
                    {holding.symbol.slice(0, 3)}
                  </Avatar>
                  <Box>
                    <Typography sx={{ fontSize: { xs: "1rem", sm: "1.15rem" }, fontWeight: 700, color: heroText, lineHeight: 1.2 }}>
                      {holding.name}
                    </Typography>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <Typography sx={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: heroMuted }}>
                        {holding.symbol} · {fmtUnits(holding.units)} units
                      </Typography>
                      {account && !account.isActive && (
                        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, px: 1, py: 0.2, borderRadius: 1.5, bgcolor: heroSubtle, fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: heroMuted }}>
                          <PauseCircleOutlineIcon sx={{ fontSize: 11 }} /> Inactive
                        </Box>
                      )}
                    </Stack>
                  </Box>
                </Stack>

                <Box sx={{ px: 2, py: 1.5, borderRadius: 2, bgcolor: heroSubtle, display: "inline-block" }}>
                  <Typography sx={{ fontSize: "0.7rem", fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
                    Current Value
                  </Typography>
                  <Typography sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem" }, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, color: heroText }}>
                    {fmt(holding.currentDayValue, currency)}
                  </Typography>
                </Box>

                <Stack direction="row" sx={{ mt: 2.5, gap: { xs: 1, sm: 2 }, flexWrap: "wrap" }}>
                  <Box sx={{ flex: "1 1 auto", minWidth: { xs: "calc(50% - 8px)", sm: 120 }, p: 1.5, borderRadius: 2, bgcolor: alpha(heroInvested, isDark ? 0.1 : 0.06) }}>
                    <Typography sx={{ fontSize: "0.65rem", fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.5 }}>
                      Invested
                    </Typography>
                    <Typography sx={{ fontSize: "0.95rem", fontWeight: 700, color: heroInvested }}>
                      {fmt(holding.invested, currency)}
                    </Typography>
                  </Box>
                  {holding.invested > 0 && (
                    <Box sx={{ flex: "1 1 auto", minWidth: { xs: "calc(50% - 8px)", sm: 120 }, p: 1.5, borderRadius: 2, bgcolor: alpha(holdingGain >= 0 ? heroSuccess : heroError, isDark ? 0.1 : 0.06) }}>
                      <Typography sx={{ fontSize: "0.65rem", fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.5 }}>
                        Total P&L
                      </Typography>
                      <Typography noWrap sx={{ fontSize: { xs: "0.8rem", sm: "0.95rem" }, fontWeight: 700, color: holdingGain >= 0 ? heroSuccess : heroError }}>
                        {holdingGain >= 0 ? "+" : ""}{fmt(holdingGain, currency)}
                      </Typography>
                      <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, color: holdingGain >= 0 ? heroSuccess : heroError, opacity: 0.8 }}>
                        {holdingGainPct >= 0 ? "+" : ""}{holdingGainPct.toFixed(1)}%
                      </Typography>
                    </Box>
                  )}
                  <Box sx={{ flex: "1 1 auto", minWidth: { xs: "calc(50% - 8px)", sm: 120 }, p: 1.5, borderRadius: 2, bgcolor: alpha(holdingDayChg >= 0 ? heroSuccess : heroError, isDark ? 0.1 : 0.06) }}>
                    <Typography sx={{ fontSize: "0.65rem", fontWeight: 500, color: heroMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.5 }}>
                      Today
                    </Typography>
                    <Typography noWrap sx={{ fontSize: { xs: "0.8rem", sm: "0.95rem" }, fontWeight: 700, color: holdingDayChg >= 0 ? heroSuccess : heroError }}>
                      {holdingDayChg >= 0 ? "+" : ""}{fmt(holdingDayChg, currency)}
                    </Typography>
                    <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, color: holdingDayChg >= 0 ? heroSuccess : heroError, opacity: 0.8 }}>
                      {holdingDayPct >= 0 ? "+" : ""}{holdingDayPct.toFixed(1)}%
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
              );
            })()}
          </FadeIn>


          {/* ── Chart ── */}
          <FadeIn delay={80}>
            <EntityChart entityType="holding" entityId={numHoldingId} accentColor={colors.brand} currency={currency} showInvested={true} />
          </FadeIn>

          {/* ── Transaction timeline ── */}
          {txnLoading ? <ListSkeleton rows={4} /> : transactions.length === 0 ? (
            <Paper>
              <EmptyState
                icon={<ReceiptOutlinedIcon />}
                title="No transactions"
                description="Add your first transaction for this holding."
                action={{ label: "Add Transaction", onClick: () => { if (!canAddTxn) { showToast("A transaction already exists for today. Try again tomorrow.", "warning"); return; } setCreateOpen(true); } }}
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
                                <Stack direction="row" alignItems="center" spacing={1}>
                                  <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, color: colors.gray500 }}>
                                    {dt.full}
                                  </Typography>
                                </Stack>

                                {/* Invested: delta + total */}
                                <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mt: 0.75 }}>
                                  <Typography sx={{ fontSize: "1.05rem", fontWeight: 700 }}>
                                    {investedDelta >= 0 ? "+" : ""}{fmt(investedDelta, currency)}
                                  </Typography>
                                  <Typography sx={{ fontSize: "0.78rem", color: colors.gray400 }}>
                                    → Total: {fmt(t.invested, currency)}
                                  </Typography>
                                </Stack>

                                {/* Units: delta + total */}
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                                  <Typography sx={{ fontSize: "0.8rem", fontWeight: 650, color: unitColor }}>
                                    {isAdd ? "+" : ""}{fmtUnits(delta)} units
                                  </Typography>
                                  <Typography sx={{ fontSize: "0.7rem", color: colors.gray400 }}>→</Typography>
                                  <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, color: colors.gray500 }}>
                                    Total: {fmtUnits(t.value)} units
                                  </Typography>
                                </Stack>
                              </Box>
                              {account?.isActive && (<IconButton size="small" onClick={() => setDeleteConfirm(t)} sx={{ color: colors.error, opacity: 0.6, "&:hover": { opacity: 1, bgcolor: alpha(colors.error, 0.08) }, mt: -0.5 }}>
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

      {/* Create Transaction Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle>New Transaction</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <Stack spacing={2}>
            <TextField label="Mode" value={txnMode} onChange={e => setTxnMode(e.target.value)} select fullWidth>
              <MenuItem value="add">Add</MenuItem>
              <MenuItem value="update">Update</MenuItem>
            </TextField>
            <TextField label="Units" type="number" inputMode="decimal" value={txnValue} onChange={e => setTxnValue(e.target.value)} inputProps={{ step: "0.001" }} helperText={txnMode === "add" ? "Units to add" : "Total units (overwrites)"} fullWidth />
            <TextField label="Invested" type="number" inputMode="decimal" value={txnInvested} onChange={e => setTxnInvested(e.target.value)} inputProps={{ step: "0.01" }} helperText={txnMode === "add" ? "Amount to add" : "Total invested (overwrites)"} fullWidth />
            <TextField label="Date" type="date" value={txnDate} onChange={e => { const v = e.target.value; if (v && ((minDate && v < minDate) || v > today)) return; setTxnDate(v); }} error={!!txnDate && ((!!minDate && txnDate < minDate) || txnDate > today)} helperText={minDate ? `Select between ${minDate} and ${today}` : `Up to ${today}`} InputLabelProps={{ shrink: true }} inputProps={{ min: minDate || undefined, max: today }} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!txnDate || !txnInvested || !txnValue || (!!minDate && txnDate < minDate) || txnDate > today}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Transaction Dialog */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Transaction</DialogTitle>
        <DialogContent>
          <Typography>Delete the transaction from <strong>{deleteConfirm?.txnDate}</strong>?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* FAB — hidden for inactive accounts */}
      {holding && account?.isActive && (
        <Fab onClick={() => { if (!canAddTxn) { showToast("A transaction already exists for today. Try again tomorrow.", "warning"); return; } setCreateOpen(true); }}
          variant={isMobile ? "circular" : "extended"}
          sx={{
            position: "fixed",
            bottom: 24,
            right: { xs: 16, sm: 24 },
            bgcolor: colors.brand,
            color: colors.pureWhite,
            boxShadow: `0 4px 20px ${alpha(colors.brand, 0.4)}`,
            "&:hover": { bgcolor: colors.brandDark, boxShadow: `0 6px 28px ${alpha(colors.brand, 0.5)}` },
          }}>
          <AddIcon sx={isMobile ? {} : { mr: 0.5 }} />
          {!isMobile && "Add Transaction"}
        </Fab>
      )}
    </Stack>
  );
}

export default HoldingDetail;
