import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, TextField, Button, MenuItem,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, IconButton, Fab, Breadcrumbs, Link as MuiLink,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import ReceiptOutlinedIcon from "@mui/icons-material/ReceiptOutlined";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { useUser } from "../context/UserContext";
import {
  getAccounts, getHoldings, createHolding, deleteHolding,
  getTransactions, createTransaction, deleteTransaction,
  invalidateCache,
} from "../api/client";
import { PageHeader, EmptyState, ErrorState, ListSkeleton, MetricCard, MetricSkeleton, TintedChip, FadeIn } from "../components/shared";
import { tokens } from "../theme";
import type { AccountSummary, HoldingSummary, Transaction } from "../api/types";

const { colors } = tokens;

function fmt(v: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
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
      // For non-broker accounts, we use accountId as holdingId (the backend handles this)
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

  const holdingsTotal = holdings.reduce((s, h) => s + h.currentDayValue, 0);
  const holdingsInvested = holdings.reduce((s, h) => s + h.invested, 0);
  const txnTotalInvested = transactions.reduce((s, t) => s + t.invested, 0);
  const txnTotalValue = transactions.reduce((s, t) => s + t.value, 0);

  return (
    <Stack spacing={{ xs: 2, sm: 3 }}>
      {/* Breadcrumbs */}
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
        <MuiLink underline="hover" color="inherit" sx={{ cursor: "pointer" }} onClick={() => navigate("/accounts")}>
          Accounts
        </MuiLink>
        <Typography color="text.primary">{account?.name || "..."}</Typography>
      </Breadcrumbs>

      {loading ? <ListSkeleton rows={3} /> : account && (
        <>
          <PageHeader
            title={account.name}
            action={
              isBroker
                ? <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateHoldingOpen(true)}>Add Holding</Button>
                : <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateTxnOpen(true)}>Add Transaction</Button>
            }
          />

          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

          {/* ── BROKER: Holdings list ── */}
          {isBroker && (
            <>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                {holdingsLoading ? <><MetricSkeleton /><MetricSkeleton /></> : (
                  <FadeIn>
                    <MetricCard label="Total Value" value={fmt(holdingsTotal, account.currency)} />
                    <MetricCard label="Invested" value={fmt(holdingsInvested, account.currency)} accent={holdingsTotal >= holdingsInvested ? colors.success : colors.error} />
                  </FadeIn>
                )}
              </Box>

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
                  <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
                    {holdings.map((h, i) => {
                      const gain = h.currentDayValue - h.invested;
                      const gainPct = h.invested > 0 ? (gain / h.invested) * 100 : 0;
                      return (
                        <Box key={h.id} sx={{
                          display: "flex", alignItems: "center", gap: 2,
                          px: { xs: 2, sm: 3 }, py: 1.5,
                          borderTop: i > 0 ? `1px solid ${theme.palette.divider}` : "none",
                          cursor: "pointer",
                          transition: "background .15s", "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                        }}
                          onClick={() => navigate(`/accounts/${accountId}/holdings/${h.id}`)}
                        >
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2" noWrap>{h.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{h.symbol} · {h.units} units</Typography>
                          </Box>
                          <Box sx={{ textAlign: "right", minWidth: 110 }}>
                            <Typography variant="subtitle2">{fmt(h.currentDayValue, account.currency)}</Typography>
                            <TintedChip
                              label={`${gain >= 0 ? "+" : ""}${gainPct.toFixed(1)}%`}
                              color={gain >= 0 ? colors.success : colors.error}
                              size="small"
                            />
                          </Box>
                          <Stack direction="row" spacing={0.5} onClick={e => e.stopPropagation()}>
                            <IconButton size="small" onClick={() => setDeleteHoldingConfirm(h)} aria-label={`Delete ${h.name}`}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                          <ChevronRightIcon fontSize="small" color="action" />
                        </Box>
                      );
                    })}
                  </Paper>
                </FadeIn>
              )}
            </>
          )}

          {/* ── NON-BROKER: Transactions list ── */}
          {!isBroker && (
            <>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                {txnLoading ? <><MetricSkeleton /><MetricSkeleton /></> : (
                  <FadeIn>
                    <MetricCard label="Total Invested" value={fmt(txnTotalInvested, account.currency)} />
                    <MetricCard label="Total Value" value={fmt(txnTotalValue, account.currency)} accent={txnTotalValue >= txnTotalInvested ? colors.success : colors.error} />
                  </FadeIn>
                )}
              </Box>

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
                <FadeIn delay={100}>
                  <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
                    {transactions.map((t, i) => {
                      const gain = t.value - t.invested;
                      return (
                        <Box key={t.id} sx={{
                          display: "flex", alignItems: "center", gap: 2,
                          px: { xs: 2, sm: 3 }, py: 1.5,
                          borderTop: i > 0 ? `1px solid ${theme.palette.divider}` : "none",
                          transition: "background .15s", "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                        }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2">{t.txnDate}</Typography>
                            <Typography variant="caption" color="text.secondary">Invested: {fmt(t.invested, account.currency)}</Typography>
                          </Box>
                          <Box sx={{ textAlign: "right", minWidth: 100 }}>
                            <Typography variant="subtitle2">{fmt(t.value, account.currency)}</Typography>
                            <TintedChip
                              label={`${gain >= 0 ? "+" : ""}${fmt(gain, account.currency)}`}
                              color={gain >= 0 ? colors.success : colors.error}
                              size="small"
                            />
                          </Box>
                          <IconButton size="small" onClick={() => setDeleteTxnConfirm(t)} aria-label="Delete transaction">
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      );
                    })}
                  </Paper>
                </FadeIn>
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

      {/* FAB */}
      {isMobile && account && (
        <Fab color="primary" onClick={() => isBroker ? setCreateHoldingOpen(true) : setCreateTxnOpen(true)} sx={{ position: "fixed", bottom: 80, right: 20 }} aria-label="Add">
          <AddIcon />
        </Fab>
      )}
    </Stack>
  );
}

export default AccountDetail;
