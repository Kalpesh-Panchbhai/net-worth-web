import { useEffect, useState, useCallback } from "react";
import {
  Box, Paper, Typography, TextField, Button, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, IconButton, Fab,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ReceiptOutlinedIcon from "@mui/icons-material/ReceiptOutlined";
import { useUser } from "../context/UserContext";
import {
  getAccounts, getHoldings, getTransactions, createTransaction, deleteTransaction, invalidateCache,
} from "../api/client";
import { PageHeader, EmptyState, ErrorState, ListSkeleton, MetricCard, MetricSkeleton, FadeIn } from "../components/shared";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import type { AccountSummary, HoldingSummary, Transaction } from "../api/types";

function fmt(v: number, currency = "INR"): string {
  const hasDecimals = v % 1 !== 0;
  const abs = Math.abs(v);
  const formatted = new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: hasDecimals ? 2 : 0 }).format(abs);
  return v < 0 ? `-${formatted}` : formatted;
}

function fmtUnits(v: number): string {
  return v.toFixed(3);
}

function Transactions() {
  const { userId } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors } = useTokens();
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [holdings, setHoldings] = useState<HoldingSummary[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | "">("");
  const [selectedHoldingId, setSelectedHoldingId] = useState<number | "">("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [txnLoading, setTxnLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [formDate, setFormDate] = useState("");
  const [formInvested, setFormInvested] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formMode, setFormMode] = useState("add");
  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<Transaction | null>(null);

  const loadAccounts = useCallback(async () => {
    if (!userId) return;
    try { setLoading(true); setError(null); const a = await getAccounts(userId); setAccounts(a); if (a.length > 0 && selectedAccountId === "") setSelectedAccountId(a[0].id); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [userId]);

  const loadHoldings = useCallback(async () => {
    if (!selectedAccountId) { setHoldings([]); setSelectedHoldingId(""); return; }
    try {
      const h = await getHoldings(selectedAccountId as number);
      setHoldings(h);
      if (h.length > 0) setSelectedHoldingId(h[0].id); else setSelectedHoldingId("");
    } catch (err) { showToast(err instanceof Error ? err.message : "Failed to load holdings", "error"); }
  }, [selectedAccountId]);

  const loadTransactions = useCallback(async () => {
    if (!selectedHoldingId) { setTransactions([]); return; }
    try { setTxnLoading(true); setError(null); setTransactions(await getTransactions({ holdingId: selectedHoldingId as number })); }
    catch (err) { showToast(err instanceof Error ? err.message : "Failed to load transactions", "error"); }
    finally { setTxnLoading(false); }
  }, [selectedHoldingId]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { loadHoldings(); }, [loadHoldings]);
  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const selAcct = accounts.find(a => a.id === selectedAccountId);
  const isBroker = selAcct?.type === "BROKER";
  const showInvested = isBroker || (selAcct?.needsDailyData ?? false);
  const totalInvested = transactions.reduce((s, t) => s + t.invested, 0);
  const totalValue = transactions.reduce((s, t) => s + t.value, 0);

  // Date restrictions
  const lastTxnDate = transactions.length > 0 ? transactions[0].txnDate : "";
  const _now = new Date();
  const todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
  const minTxnDate = lastTxnDate ? (() => { const d = new Date(lastTxnDate + "T00:00:00"); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })() : "";
  const canAddTxn = !minTxnDate || minTxnDate <= todayStr;

  const handleCreate = async () => {
    if (!selectedAccountId || !selectedHoldingId || !formDate || !formValue || (showInvested && !formInvested)) return;
    let invested = showInvested ? parseFloat(parseFloat(formInvested).toFixed(2)) : parseFloat(parseFloat(formValue).toFixed(2));
    let value = parseFloat(parseFloat(formValue).toFixed(isBroker ? 3 : 2));
    // Add mode: add to last transaction's cumulative values
    if (formMode === "add" && transactions.length > 0) {
      const last = transactions[0];
      invested = parseFloat((last.invested + invested).toFixed(2));
      value = parseFloat((last.value + value).toFixed(isBroker ? 3 : 2));
    }
    const date = formDate;
    const accountId = selectedAccountId as number; const holdingId = selectedHoldingId as number;
    const prev = transactions;
    const tempId = -Date.now();
    const optimistic: Transaction = { id: tempId, accountId, holdingId, txnDate: date, invested, value };
    setTransactions(t => [optimistic, ...t]);
    setCreateOpen(false); setFormDate(""); setFormInvested(""); setFormValue(""); setFormMode("add");
    try {
      const created = await createTransaction({ accountId, holdingId, txnDate: date, invested, value, mode: "update" });
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
    const { id, txnDate } = deleteConfirm;
    const prev = transactions;
    setTransactions(t => t.filter(txn => txn.id !== id));
    setDeleteConfirm(null);
    try {
      await deleteTransaction(id);
      invalidateCache("transactions");
      showToast(`Transaction on ${txnDate} deleted`);
    } catch (err) {
      setTransactions(prev);
      showToast(err instanceof Error ? err.message : "Failed to delete transaction", "error");
    }
  };

  if (error && accounts.length === 0 && !loading) return <ErrorState message={error} onRetry={loadAccounts} />;

  return (
    <Stack spacing={{ xs: 2, sm: 3 }}>
      <PageHeader
        title="Transactions"
        action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => { if (!canAddTxn) { showToast("A transaction already exists for today. Try again tomorrow.", "warning"); return; } setCreateOpen(true); }} disabled={!selectedHoldingId}>Add Transaction</Button>}
      />


      {/* Selectors */}
      {!loading && accounts.length > 0 && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            select label="Account" value={selectedAccountId}
            onChange={e => { setSelectedAccountId(Number(e.target.value)); }}
            fullWidth size="small"
          >
            {accounts.map(a => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
          </TextField>
          {holdings.length > 0 && (
            <TextField
              select label="Holding" value={selectedHoldingId}
              onChange={e => setSelectedHoldingId(Number(e.target.value))}
              fullWidth size="small"
            >
              {holdings.map(h => <MenuItem key={h.id} value={h.id}>{h.name} ({h.symbol})</MenuItem>)}
            </TextField>
          )}
        </Stack>
      )}

      {/* Summary */}
      {selectedHoldingId && (
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          {txnLoading ? <><MetricSkeleton /><MetricSkeleton /></> : (
            <FadeIn>
              {showInvested && <MetricCard label="Total Invested" value={fmt(totalInvested)} />}
              <MetricCard label="Total Value" value={fmt(totalValue)} accent={showInvested ? (totalValue >= totalInvested ? colors.success : colors.error) : undefined} />
            </FadeIn>
          )}
        </Box>
      )}

      {loading || txnLoading ? <ListSkeleton rows={4} /> : !selectedHoldingId ? (
        <Paper>
          <EmptyState icon={<ReceiptOutlinedIcon />} title="No holdings selected" description="Select an account and holding to view transactions." />
        </Paper>
      ) : transactions.length === 0 ? (
        <Paper>
          <EmptyState
            icon={<ReceiptOutlinedIcon />}
            title="No transactions"
            description="Add your first transaction for this holding."
            action={{ label: "Add Transaction", onClick: () => { if (!canAddTxn) { showToast("A transaction already exists for today. Try again tomorrow.", "warning"); return; } setCreateOpen(true); } }}
          />
        </Paper>
      ) : (
        <FadeIn delay={100}>
          <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
            {transactions.map((t, i) => {
                const prevValue = i < transactions.length - 1 ? transactions[i + 1].value : 0;
                const prevInvested = i < transactions.length - 1 ? transactions[i + 1].invested : 0;
                const delta = t.value - prevValue;
                const investedDelta = t.invested - prevInvested;
                const isAdd = delta >= 0;
                const unitColor = isAdd ? colors.success : colors.error;
                return (
                  <Box key={t.id} sx={{
                    display: "flex", alignItems: "center", gap: 2,
                    px: { xs: 2, sm: 3 }, py: 1.5,
                    borderTop: i > 0 ? `1px solid ${theme.palette.divider}` : "none",
                    transition: "background .15s", "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                  }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2">{t.txnDate}</Typography>
                      {showInvested && (
                      <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ mt: 0.25 }}>
                        <Typography sx={{ fontSize: "0.95rem", fontWeight: 650 }}>
                          {investedDelta >= 0 ? "+" : ""}{fmt(investedDelta, selAcct?.currency)}
                        </Typography>
                        <Typography sx={{ fontSize: "0.72rem", color: colors.gray400 }}>
                          → {fmt(t.invested, selAcct?.currency)}
                        </Typography>
                      </Stack>
                      )}
                      <Stack direction="row" spacing={0.75} alignItems={showInvested ? "center" : "baseline"} sx={{ mt: 0.25 }}>
                        <Typography sx={{ fontSize: showInvested ? "0.78rem" : "0.95rem", fontWeight: showInvested ? 650 : 650, color: showInvested ? unitColor : undefined }}>
                          {isAdd ? "+" : ""}{showInvested ? `${fmtUnits(delta)} units` : fmt(delta, selAcct?.currency)}
                        </Typography>
                        <Typography sx={{ fontSize: showInvested ? "0.65rem" : "0.72rem", color: colors.gray400 }}>→</Typography>
                        <Typography sx={{ fontSize: showInvested ? "0.78rem" : "0.72rem", fontWeight: 600, color: colors.gray500 }}>
                          {showInvested ? `Total: ${fmtUnits(t.value)}` : fmt(t.value, selAcct?.currency)}
                        </Typography>
                      </Stack>
                    </Box>
                    <IconButton size="small" onClick={() => setDeleteConfirm(t)} aria-label="Delete transaction" sx={{ color: colors.error, opacity: 0.6, "&:hover": { opacity: 1, bgcolor: alpha(colors.error, 0.08) } }}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>
                );
            })}
          </Paper>
        </FadeIn>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle>New Transaction</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <Stack spacing={2}>
            <TextField label="Mode" value={formMode} onChange={e => setFormMode(e.target.value)} select fullWidth>
              <MenuItem value="add">Add</MenuItem>
              <MenuItem value="update">Update</MenuItem>
            </TextField>
            <TextField label={isBroker ? "Units" : "Amount"} type="number" inputMode="decimal" value={formValue} onChange={e => setFormValue(e.target.value)} inputProps={{ step: isBroker ? "0.001" : "0.01" }} helperText={formMode === "add" ? (isBroker ? "Units to add" : "Amount to add") : (isBroker ? "Total units (overwrites)" : "Total amount (overwrites)")} fullWidth />
            {showInvested && <TextField label="Invested" type="number" inputMode="decimal" value={formInvested} onChange={e => setFormInvested(e.target.value)} inputProps={{ step: "0.01" }} helperText={formMode === "add" ? "Investment to add" : "Total invested (overwrites)"} fullWidth />}
            <TextField label="Date" type="date" value={formDate} onChange={e => { const v = e.target.value; if (v && ((minTxnDate && v < minTxnDate) || v > todayStr)) return; setFormDate(v); }} error={!!formDate && ((!!minTxnDate && formDate < minTxnDate) || formDate > todayStr)} helperText={minTxnDate ? `Select between ${minTxnDate} and ${todayStr}` : `Up to ${todayStr}`} InputLabelProps={{ shrink: true }} inputProps={{ min: minTxnDate || undefined, max: todayStr }} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!formDate || !formValue || (showInvested && !formInvested) || (!!minTxnDate && formDate < minTxnDate) || formDate > todayStr}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm */}
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

      {isMobile && selectedHoldingId && (
        <Fab onClick={() => { if (!canAddTxn) { showToast("A transaction already exists for today. Try again tomorrow.", "warning"); return; } setCreateOpen(true); }} sx={{ position: "fixed", bottom: 80, right: 20, bgcolor: colors.brand, color: colors.pureWhite, boxShadow: `0 4px 20px ${alpha(colors.brand, 0.4)}`, "&:hover": { bgcolor: colors.brandDark, boxShadow: `0 6px 28px ${alpha(colors.brand, 0.5)}` } }} aria-label="Add transaction">
          <AddIcon />
        </Fab>
      )}
    </Stack>
  );
}

export default Transactions;
