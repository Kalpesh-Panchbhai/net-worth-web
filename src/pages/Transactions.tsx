import { useEffect, useState, useCallback, useMemo } from "react";
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
  getAccounts, getHoldings, getTransactions, createTransaction, deleteTransaction, invalidateMoneyCaches,
} from "../api/client";
import { PageHeader, EmptyState, ErrorState, ListSkeleton, MetricCard, MetricSkeleton, FadeIn } from "../components/shared";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import type { AccountSummary, HoldingSummary, Transaction } from "../api/types";
import { formatCurrency as fmt, formatUnits as fmtUnits } from "../utils/format";

function Transactions() {
  const { userId, preferredCurrency, dataVersion, refreshAll } = useUser();
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

  const loadAccounts = useCallback(async (isActive: () => boolean = () => true) => {
    if (!userId) return;
    try {
      setLoading(true); setError(null);
      const a = await getAccounts(userId);
      if (!isActive()) return;
      setAccounts(a);
      // A reload must not move the user off the account they picked.
      if (a.length > 0) setSelectedAccountId(prev => prev === "" ? a[0].id : prev);
    }
    catch (err) { if (isActive()) setError(err instanceof Error ? err.message : "Failed to load"); }
    finally { if (isActive()) setLoading(false); }
  }, [userId, dataVersion]);

  const loadHoldings = useCallback(async (isActive: () => boolean = () => true) => {
    if (!selectedAccountId) { setHoldings([]); setSelectedHoldingId(""); return; }
    try {
      const h = await getHoldings(selectedAccountId as number);
      if (!isActive()) return;
      setHoldings(h);
      setSelectedHoldingId(prev => h.some(hld => hld.id === prev) ? prev : (h.length > 0 ? h[0].id : ""));
    } catch (err) { if (isActive()) showToast(err instanceof Error ? err.message : "Failed to load holdings", "error"); }
  }, [selectedAccountId, dataVersion]);

  const loadTransactions = useCallback(async (isActive: () => boolean = () => true) => {
    if (!selectedHoldingId) { setTransactions([]); return; }
    try {
      setTxnLoading(true); setError(null);
      const t = await getTransactions({ holdingId: selectedHoldingId as number });
      if (isActive()) setTransactions(t);
    }
    catch (err) { if (isActive()) showToast(err instanceof Error ? err.message : "Failed to load transactions", "error"); }
    finally { if (isActive()) setTxnLoading(false); }
  }, [selectedHoldingId, dataVersion]);

  useEffect(() => {
    let cancelled = false;
    loadAccounts(() => !cancelled);
    return () => { cancelled = true; };
  }, [loadAccounts]);

  useEffect(() => {
    let cancelled = false;
    loadHoldings(() => !cancelled);
    return () => { cancelled = true; };
  }, [loadHoldings]);

  useEffect(() => {
    let cancelled = false;
    loadTransactions(() => !cancelled);
    return () => { cancelled = true; };
  }, [loadTransactions]);

  const selAcct = useMemo(() => accounts.find(a => a.id === selectedAccountId), [accounts, selectedAccountId]);
  const selHolding = useMemo(() => holdings.find(h => h.id === selectedHoldingId), [holdings, selectedHoldingId]);
  const isBroker = selAcct?.type === "BROKER";
  const showInvested = isBroker || (selAcct?.needsDailyData ?? false);
  // invested/value are cumulative per-holding snapshots — each row already contains the previous
  // one — so the newest row (the list is newest-first) is the total, not the sum of the column.
  const latestTxn = transactions.length > 0 ? transactions[0] : null;
  const totalInvested = latestTxn?.invested ?? 0;
  const totalValue = latestTxn?.value ?? 0;
  const txnCurrency = latestTxn?.displayCurrency ?? preferredCurrency;

  const rows = useMemo(() => transactions.map((t, i) => {
    const prev = i < transactions.length - 1 ? transactions[i + 1] : null;
    // Server-converted, each at its own transaction date; the local subtraction is only a
    // fallback for the unconverted row a create echoes back.
    return {
      t,
      delta: t.valueDelta ?? t.value - (prev?.value ?? 0),
      investedDelta: t.investedDelta ?? t.invested - (prev?.invested ?? 0),
    };
  }), [transactions]);

  // Date restrictions
  const lastTxnDate = transactions.length > 0 ? transactions[0].txnDate : "";
  const _now = new Date();
  const todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
  const minTxnDate = lastTxnDate ? (() => { const d = new Date(lastTxnDate + "T00:00:00"); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })() : "";
  const canAddTxn = !minTxnDate || minTxnDate <= todayStr;

  const handleCreate = async () => {
    if (!selAcct || !selHolding || !formDate || !formValue || (showInvested && !formInvested)) return;
    // Send exactly what was typed, in the account's own currency, and let the server do the
    // running total for "add" mode. Adding to the previous row here would add the entered native
    // amount to a cumulative figure the API already converted into the display currency, and that
    // mixed number would be stored as the native cost basis.
    const invested = showInvested ? parseFloat(parseFloat(formInvested).toFixed(2)) : parseFloat(parseFloat(formValue).toFixed(2));
    const value = parseFloat(parseFloat(formValue).toFixed(isBroker ? 3 : 2));
    const date = formDate;
    const accountId = selAcct.id; const holdingId = selHolding.id;
    const prev = transactions;
    const tempId = -Date.now();
    const last = transactions[0];
    // Optimistic only: mirrors the row the server will return, whose sum is authoritative.
    const optimistic: Transaction = {
      id: tempId, accountId, holdingId, txnDate: date,
      invested: formMode === "add" && last ? invested + last.invested : invested,
      value: formMode === "add" && last ? value + last.value : value,
      displayCurrency: last?.displayCurrency ?? selAcct.currency,
      valueInUnits: selHolding.unitsAreShares,
    };
    setTransactions(t => [optimistic, ...t]);
    setCreateOpen(false); setFormDate(""); setFormInvested(""); setFormValue(""); setFormMode("add");
    try {
      await createTransaction({ accountId, holdingId, txnDate: date, invested, value, mode: formMode });
      invalidateMoneyCaches();
      // Refetch rather than splicing the response in: the created row is echoed in the account's
      // NATIVE currency and carries no converted deltas.
      refreshAll();
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
      invalidateMoneyCaches();
      showToast(`Transaction on ${txnDate} deleted`);
    } catch (err) {
      setTransactions(prev);
      showToast(err instanceof Error ? err.message : "Failed to delete transaction", "error");
    }
  };

  if (error && accounts.length === 0 && !loading) return <ErrorState message={error} onRetry={() => loadAccounts()} />;

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
              {showInvested && <MetricCard label="Total Invested" value={fmt(totalInvested, txnCurrency)} />}
              <MetricCard label="Total Value" value={latestTxn?.valueInUnits ? `${fmtUnits(totalValue)} units` : fmt(totalValue, txnCurrency)} accent={showInvested ? (totalValue >= totalInvested ? colors.success : colors.error) : undefined} />
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
            {rows.map(({ t, delta, investedDelta }, i) => {
                const isAdd = delta >= 0;
                const unitColor = isAdd ? colors.success : colors.error;
                return (
                  <Box key={t.id} sx={{
                    display: "flex", alignItems: "center", gap: 2,
                    px: { xs: 1.5, sm: 3 }, py: 1.5,
                    borderTop: i > 0 ? `1px solid ${theme.palette.divider}` : "none",
                    transition: "background .15s", "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                  }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2">{t.txnDate}</Typography>
                      {showInvested && (
                      <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ mt: 0.25 }}>
                        <Typography sx={{ fontSize: "0.95rem", fontWeight: 650 }}>
                          {investedDelta >= 0 ? "+" : ""}{fmt(investedDelta, t.displayCurrency)}
                        </Typography>
                        <Typography sx={{ fontSize: "0.72rem", color: colors.gray400 }}>
                          → {fmt(t.invested, t.displayCurrency)}
                        </Typography>
                      </Stack>
                      )}
                      <Stack direction="row" spacing={0.75} alignItems={showInvested ? "center" : "baseline"} sx={{ mt: 0.25 }}>
                        <Typography sx={{ fontSize: showInvested ? "0.78rem" : "0.95rem", fontWeight: showInvested ? 650 : 650, color: showInvested ? unitColor : undefined }}>
                          {isAdd ? "+" : ""}{t.valueInUnits ? `${fmtUnits(delta)} units` : fmt(delta, t.displayCurrency)}
                        </Typography>
                        <Typography sx={{ fontSize: showInvested ? "0.65rem" : "0.72rem", color: colors.gray400 }}>→</Typography>
                        <Typography sx={{ fontSize: showInvested ? "0.78rem" : "0.72rem", fontWeight: 600, color: colors.gray500 }}>
                          {t.valueInUnits ? `Total: ${fmtUnits(t.value)}` : fmt(t.value, t.displayCurrency)}
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
            <TextField label={isBroker ? "Units" : `Amount (${selAcct?.currency ?? ""})`} type="number" inputMode="decimal" value={formValue} onChange={e => setFormValue(e.target.value)} inputProps={{ step: isBroker ? "0.001" : "0.01" }} helperText={formMode === "add" ? (isBroker ? "Units to add" : "Amount to add") : (isBroker ? "Total units (overwrites)" : "Total amount (overwrites)")} fullWidth />
            {showInvested && <TextField label={`Invested (${selAcct?.currency ?? ""})`} type="number" inputMode="decimal" value={formInvested} onChange={e => setFormInvested(e.target.value)} inputProps={{ step: "0.01" }} helperText={formMode === "add" ? "Investment to add" : "Total invested (overwrites)"} fullWidth />}
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
        <Fab onClick={() => { if (!canAddTxn) { showToast("A transaction already exists for today. Try again tomorrow.", "warning"); return; } setCreateOpen(true); }} sx={{ position: "fixed", bottom: { xs: "calc(80px + env(safe-area-inset-bottom, 0px))", sm: 80 }, right: 20, bgcolor: colors.brand, color: colors.pureWhite, boxShadow: `0 4px 20px ${alpha(colors.brand, 0.4)}`, "&:hover": { bgcolor: colors.brandDark, boxShadow: `0 6px 28px ${alpha(colors.brand, 0.5)}` } }} aria-label="Add transaction">
          <AddIcon />
        </Fab>
      )}
    </Stack>
  );
}

export default Transactions;
