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
import ReceiptOutlinedIcon from "@mui/icons-material/ReceiptOutlined";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { useUser } from "../context/UserContext";
import {
  getAccounts, getHoldings, getTransactions, createTransaction, deleteTransaction,
  invalidateCache,
} from "../api/client";
import { PageHeader, EmptyState, ErrorState, ListSkeleton, MetricCard, MetricSkeleton, TintedChip, FadeIn } from "../components/shared";
import { tokens } from "../theme";
import type { AccountSummary, HoldingSummary, Transaction } from "../api/types";

const { colors } = tokens;

function fmt(v: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
}

function HoldingDetail() {
  const { accountId, holdingId } = useParams<{ accountId: string; holdingId: string }>();
  const navigate = useNavigate();
  const { userId } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

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
  const [saving, setSaving] = useState(false);

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
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load transactions"); }
    finally { setTxnLoading(false); }
  }, [numHoldingId]);

  useEffect(() => { loadContext(); }, [loadContext]);
  useEffect(() => { if (holding) loadTransactions(); }, [holding, loadTransactions]);

  const totalInvested = transactions.reduce((s, t) => s + t.invested, 0);
  const totalValue = transactions.reduce((s, t) => s + t.value, 0);
  const currency = account?.currency || "INR";

  const handleCreate = async () => {
    if (!txnDate || !txnInvested || !txnValue) return;
    try {
      setSaving(true);
      await createTransaction({ accountId: numAccountId, holdingId: numHoldingId, txnDate, invested: parseFloat(txnInvested), value: parseFloat(txnValue), mode: txnMode });
      setCreateOpen(false); setTxnDate(""); setTxnInvested(""); setTxnValue(""); setTxnMode("add");
      invalidateCache("transactions"); await loadTransactions();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to create"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try { await deleteTransaction(deleteConfirm.id); setDeleteConfirm(null); invalidateCache("transactions"); await loadTransactions(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to delete"); }
  };

  if (error && !account && !loading) return <ErrorState message={error} onRetry={loadContext} />;

  return (
    <Stack spacing={{ xs: 2, sm: 3 }}>
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
          <PageHeader
            title={`${holding.name} (${holding.symbol})`}
            action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>Add Transaction</Button>}
          />

          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

          {/* Holding summary */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr 1fr" }, gap: 2 }}>
            {txnLoading ? <><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></> : (
              <FadeIn>
                <MetricCard label="Current Value" value={fmt(holding.currentDayValue, currency)} />
                <MetricCard label="Invested" value={fmt(holding.invested, currency)} />
                <MetricCard label="Units" value={String(holding.units)} />
              </FadeIn>
            )}
          </Box>

          {/* Transactions list */}
          {txnLoading ? <ListSkeleton rows={4} /> : transactions.length === 0 ? (
            <Paper>
              <EmptyState
                icon={<ReceiptOutlinedIcon />}
                title="No transactions"
                description="Add your first transaction for this holding."
                action={{ label: "Add Transaction", onClick: () => setCreateOpen(true) }}
              />
            </Paper>
          ) : (
            <>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                <MetricCard label="Total Invested" value={fmt(totalInvested, currency)} />
                <MetricCard label="Total Value" value={fmt(totalValue, currency)} accent={totalValue >= totalInvested ? colors.success : colors.error} />
              </Box>

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
                          <Typography variant="caption" color="text.secondary">Invested: {fmt(t.invested, currency)}</Typography>
                        </Box>
                        <Box sx={{ textAlign: "right", minWidth: 100 }}>
                          <Typography variant="subtitle2">{fmt(t.value, currency)}</Typography>
                          <TintedChip
                            label={`${gain >= 0 ? "+" : ""}${fmt(gain, currency)}`}
                            color={gain >= 0 ? colors.success : colors.error}
                            size="small"
                          />
                        </Box>
                        <IconButton size="small" onClick={() => setDeleteConfirm(t)} aria-label="Delete transaction">
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    );
                  })}
                </Paper>
              </FadeIn>
            </>
          )}
        </>
      )}

      {/* Create Transaction Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullScreen={isMobile} fullWidth maxWidth="sm">
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
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !txnDate || !txnInvested || !txnValue}>Create</Button>
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

      {/* FAB */}
      {isMobile && holding && (
        <Fab color="primary" onClick={() => setCreateOpen(true)} sx={{ position: "fixed", bottom: 80, right: 20 }} aria-label="Add transaction">
          <AddIcon />
        </Fab>
      )}
    </Stack>
  );
}

export default HoldingDetail;
