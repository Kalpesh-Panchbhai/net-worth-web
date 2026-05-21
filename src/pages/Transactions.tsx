import { useEffect, useState, useCallback } from "react";
import {
  Box, Paper, Typography, TextField, Button, MenuItem,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions,
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
import { PageHeader, EmptyState, ErrorState, ListSkeleton, MetricCard, MetricSkeleton, TintedChip, FadeIn } from "../components/shared";
import { tokens } from "../theme";
import type { AccountSummary, HoldingSummary, Transaction } from "../api/types";

const { colors } = tokens;

function fmt(v: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
}

function Transactions() {
  const { userId } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
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
  const [saving, setSaving] = useState(false);

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
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load holdings"); }
  }, [selectedAccountId]);

  const loadTransactions = useCallback(async () => {
    if (!selectedHoldingId) { setTransactions([]); return; }
    try { setTxnLoading(true); setError(null); setTransactions(await getTransactions({ holdingId: selectedHoldingId as number })); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load transactions"); }
    finally { setTxnLoading(false); }
  }, [selectedHoldingId]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { loadHoldings(); }, [loadHoldings]);
  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const totalInvested = transactions.reduce((s, t) => s + t.invested, 0);
  const totalValue = transactions.reduce((s, t) => s + t.value, 0);

  const handleCreate = async () => {
    if (!selectedAccountId || !selectedHoldingId || !formDate || !formInvested || !formValue) return;
    try {
      setSaving(true);
      await createTransaction({
        accountId: selectedAccountId as number, holdingId: selectedHoldingId as number,
        txnDate: formDate, invested: parseFloat(formInvested), value: parseFloat(formValue), mode: formMode,
      });
      setCreateOpen(false); setFormDate(""); setFormInvested(""); setFormValue(""); setFormMode("add");
      invalidateCache("transactions"); await loadTransactions();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to create"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try { await deleteTransaction(deleteConfirm.id); setDeleteConfirm(null); invalidateCache("transactions"); await loadTransactions(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to delete"); }
  };

  if (error && accounts.length === 0 && !loading) return <ErrorState message={error} onRetry={loadAccounts} />;

  return (
    <Stack spacing={{ xs: 2, sm: 3 }}>
      <PageHeader
        title="Transactions"
        action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)} disabled={!selectedHoldingId}>Add Transaction</Button>}
      />

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

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
              <MetricCard label="Total Invested" value={fmt(totalInvested)} />
              <MetricCard label="Total Value" value={fmt(totalValue)} accent={totalValue >= totalInvested ? colors.success : colors.error} />
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
            action={{ label: "Add Transaction", onClick: () => setCreateOpen(true) }}
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
                  flexWrap: "wrap",
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2">{t.txnDate}</Typography>
                    <Typography variant="caption" color="text.secondary">Invested: {fmt(t.invested)}</Typography>
                  </Box>
                  <Box sx={{ textAlign: "right", minWidth: 100 }}>
                    <Typography variant="subtitle2">{fmt(t.value)}</Typography>
                    <TintedChip
                      label={`${gain >= 0 ? "+" : ""}${fmt(gain)}`}
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
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle>New Transaction</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <Stack spacing={2}>
            <TextField label="Date" type="date" value={formDate} onChange={e => setFormDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="Invested" type="number" inputMode="decimal" value={formInvested} onChange={e => setFormInvested(e.target.value)} fullWidth />
            <TextField label="Value" type="number" inputMode="decimal" value={formValue} onChange={e => setFormValue(e.target.value)} fullWidth />
            <TextField label="Mode" value={formMode} onChange={e => setFormMode(e.target.value)} select fullWidth>
              <MenuItem value="add">Add</MenuItem>
              <MenuItem value="subtract">Subtract</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !formDate || !formInvested || !formValue}>Create</Button>
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
        <Fab color="primary" onClick={() => setCreateOpen(true)} sx={{ position: "fixed", bottom: 80, right: 20 }} aria-label="Add transaction">
          <AddIcon />
        </Fab>
      )}
    </Stack>
  );
}

export default Transactions;
