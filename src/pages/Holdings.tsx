import { useEffect, useState, useCallback } from "react";
import {
  Box, Paper, Typography, TextField, Button,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, IconButton, Fab, MenuItem,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import { useUser } from "../context/UserContext";
import {
  getAccounts, getHoldings, createHolding, deleteHolding, invalidateCache,
} from "../api/client";
import { PageHeader, EmptyState, ErrorState, ListSkeleton, MetricCard, MetricSkeleton, TintedChip, FadeIn } from "../components/shared";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import type { AccountSummary, HoldingSummary } from "../api/types";

function fmt(v: number, currency = "INR"): string {
  const abs = Math.abs(v);
  const formatted = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(abs);
  return v < 0 ? `-${formatted}` : formatted;
}

function fmtUnits(v: number): string {
  return v.toFixed(3);
}

function Holdings() {
  const { userId } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors } = useTokens();
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | "">("");
  const [holdings, setHoldings] = useState<HoldingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSymbol, setNewSymbol] = useState("");
  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<HoldingSummary | null>(null);

  const loadAccounts = useCallback(async () => {
    if (!userId) return;
    try { setLoading(true); setError(null); const a = await getAccounts(userId); setAccounts(a); if (a.length > 0 && selectedAccountId === "") setSelectedAccountId(a[0].id); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load accounts"); }
    finally { setLoading(false); }
  }, [userId]);

  const loadHoldings = useCallback(async () => {
    if (!selectedAccountId) { setHoldings([]); return; }
    try { setHoldingsLoading(true); setError(null); setHoldings(await getHoldings(selectedAccountId as number)); }
    catch (err) { showToast(err instanceof Error ? err.message : "Failed to load holdings", "error"); }
    finally { setHoldingsLoading(false); }
  }, [selectedAccountId]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { loadHoldings(); }, [loadHoldings]);

  const totalValue = holdings.reduce((s, h) => s + h.currentDayValue, 0);
  const totalInvested = holdings.reduce((s, h) => s + h.invested, 0);

  const handleCreate = async () => {
    if (!selectedAccountId || !newName.trim() || !newSymbol.trim()) return;
    const trimmed = newName.trim();
    const symbol = newSymbol.trim();
    const accountId = selectedAccountId as number;
    const prev = holdings;
    const tempId = -Date.now();
    const optimistic: HoldingSummary = { id: tempId, accountId, name: trimmed, symbol, units: 0, currentDayValue: 0, previousDayValue: 0, invested: 0 };
    setHoldings(h => [...h, optimistic]);
    setCreateOpen(false); setNewName(""); setNewSymbol("");
    try {
      const created = await createHolding({ accountId, name: trimmed, symbol });
      setHoldings(h => h.map(hld => hld.id === tempId ? { ...optimistic, ...created } : hld));
      invalidateCache("holdings");
      showToast(`Holding "${trimmed}" created`);
    } catch (err) {
      setHoldings(prev);
      showToast(err instanceof Error ? err.message : "Failed to create holding", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const { id, name } = deleteConfirm;
    const prev = holdings;
    setHoldings(h => h.filter(hld => hld.id !== id));
    setDeleteConfirm(null);
    try {
      await deleteHolding(id);
      invalidateCache("holdings");
      showToast(`Holding "${name}" deleted`);
    } catch (err) {
      setHoldings(prev);
      showToast(err instanceof Error ? err.message : "Failed to delete holding", "error");
    }
  };

  if (error && accounts.length === 0 && !loading) return <ErrorState message={error} onRetry={loadAccounts} />;

  return (
    <Stack spacing={{ xs: 2, sm: 3 }}>
      <PageHeader
        title="Holdings"
        action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)} disabled={!selectedAccountId}>Add Holding</Button>}
      />


      {/* Account selector */}
      {!loading && accounts.length > 0 && (
        <TextField
          select label="Account" value={selectedAccountId}
          onChange={e => setSelectedAccountId(Number(e.target.value))}
          fullWidth size="small"
        >
          {accounts.map(a => <MenuItem key={a.id} value={a.id}>{a.name} ({a.type})</MenuItem>)}
        </TextField>
      )}

      {/* Summary metrics */}
      {selectedAccountId && (
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          {holdingsLoading ? <><MetricSkeleton /><MetricSkeleton /></> : (
            <FadeIn>
              <MetricCard label="Total Value" value={fmt(totalValue)} />
              <MetricCard label="Invested" value={fmt(totalInvested)} accent={totalValue >= totalInvested ? colors.success : colors.error} />
            </FadeIn>
          )}
        </Box>
      )}

      {loading || holdingsLoading ? <ListSkeleton rows={4} /> : !selectedAccountId ? (
        <Paper>
          <EmptyState icon={<ShowChartIcon />} title="No accounts" description="Create an account first to manage holdings." />
        </Paper>
      ) : holdings.length === 0 ? (
        <Paper>
          <EmptyState
            icon={<ShowChartIcon />}
            title="No holdings"
            description="Add your first holding to this account."
            action={{ label: "Add Holding", onClick: () => setCreateOpen(true) }}
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
                  transition: "background .15s", "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                  flexWrap: "wrap",
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>{h.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{h.symbol} · {fmtUnits(h.units)} units</Typography>
                  </Box>
                  <Box sx={{ textAlign: "right", minWidth: 110 }}>
                    <Typography variant="subtitle2">{fmt(h.currentDayValue)}</Typography>
                    <TintedChip
                      label={`${gain >= 0 ? "+" : ""}${gainPct.toFixed(1)}%`}
                      color={gain >= 0 ? colors.success : colors.error}
                      size="small"
                    />
                  </Box>
                  <IconButton size="small" onClick={() => setDeleteConfirm(h)} aria-label={`Delete ${h.name}`} sx={{ color: colors.error, opacity: 0.6, "&:hover": { opacity: 1, bgcolor: alpha(colors.error, 0.08) } }}>
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
        <DialogTitle>New Holding</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <Stack spacing={2}>
            <TextField label="Name" value={newName} onChange={e => setNewName(e.target.value)} fullWidth autoFocus />
            <TextField label="Symbol" value={newSymbol} onChange={e => setNewSymbol(e.target.value)} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newName.trim() || !newSymbol.trim()}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Holding</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{deleteConfirm?.name}</strong> ({deleteConfirm?.symbol})? All transactions for this holding will also be removed.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>

      {isMobile && selectedAccountId && (
        <Fab onClick={() => setCreateOpen(true)} sx={{ position: "fixed", bottom: 80, right: 20, bgcolor: colors.brand, color: colors.pureWhite, boxShadow: `0 4px 20px ${alpha(colors.brand, 0.4)}`, "&:hover": { bgcolor: colors.brandDark, boxShadow: `0 6px 28px ${alpha(colors.brand, 0.5)}` } }} aria-label="Add holding">
          <AddIcon />
        </Fab>
      )}
    </Stack>
  );
}

export default Holdings;
