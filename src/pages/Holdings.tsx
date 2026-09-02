import { useEffect, useState, useCallback, useMemo } from "react";
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
  getAccounts, getHoldings, createHolding, deleteHolding, invalidateMoneyCaches,
} from "../api/client";
import { PageHeader, EmptyState, ErrorState, ListSkeleton, MetricCard, MetricSkeleton, TintedChip, FadeIn } from "../components/shared";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import type { AccountSummary, HoldingSummary } from "../api/types";
import { formatCurrency, formatUnits as fmtUnits } from "../utils/format";

// Holdings summaries are shown as whole numbers (no decimals).
const fmt = (v: number, currency?: string) => formatCurrency(v, currency, { maxDecimals: 0 });

function Holdings() {
  const { userId, preferredCurrency, dataVersion } = useUser();
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
    catch (err) { if (isActive()) setError(err instanceof Error ? err.message : "Failed to load accounts"); }
    finally { if (isActive()) setLoading(false); }
  }, [userId, dataVersion]);

  const loadHoldings = useCallback(async (isActive: () => boolean = () => true) => {
    if (!selectedAccountId) { setHoldings([]); return; }
    try {
      setHoldingsLoading(true); setError(null);
      const h = await getHoldings(selectedAccountId as number);
      if (isActive()) setHoldings(h);
    }
    catch (err) { if (isActive()) showToast(err instanceof Error ? err.message : "Failed to load holdings", "error"); }
    finally { if (isActive()) setHoldingsLoading(false); }
  }, [selectedAccountId, dataVersion]);

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

  const selectedAccount = useMemo(
    () => accounts.find(a => a.id === selectedAccountId),
    [accounts, selectedAccountId],
  );
  const accountCurrency = selectedAccount?.currency;

  // One pass for both totals. Only rows sharing the label being rendered are summed: a row left
  // in its own native currency because no FX rate resolved must not be added into a total shown
  // in the display currency.
  const { totalValue, totalInvested, rowCurrency } = useMemo(() => {
    const currency = holdings[0]?.displayCurrency ?? preferredCurrency;
    let value = 0, invested = 0;
    for (const h of holdings) {
      if (h.displayCurrency !== currency) continue;
      value += h.currentDayValue;
      invested += h.invested;
    }
    return { totalValue: value, totalInvested: invested, rowCurrency: currency };
  }, [holdings, preferredCurrency]);

  const handleCreate = async () => {
    if (!selectedAccountId || !newName.trim() || !newSymbol.trim()) return;
    const trimmed = newName.trim();
    const symbol = newSymbol.trim();
    const accountId = selectedAccountId as number;
    const prev = holdings;
    const tempId = -Date.now();
    const optimistic: HoldingSummary = { id: tempId, accountId, name: trimmed, symbol, units: 0, unitsAreShares: selectedAccount?.type === "BROKER", currentDayValue: 0, previousDayValue: 0, invested: 0, gain: 0, dayChange: 0, xirr: null, displayCurrency: rowCurrency };
    setHoldings(h => [...h, optimistic]);
    setCreateOpen(false); setNewName(""); setNewSymbol("");
    try {
      const created = await createHolding({ accountId, name: trimmed, symbol });
      setHoldings(h => h.map(hld => hld.id === tempId ? { ...optimistic, ...created } : hld));
      invalidateMoneyCaches();
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
      invalidateMoneyCaches();
      showToast(`Holding "${name}" deleted`);
    } catch (err) {
      setHoldings(prev);
      showToast(err instanceof Error ? err.message : "Failed to delete holding", "error");
    }
  };

  if (error && accounts.length === 0 && !loading) return <ErrorState message={error} onRetry={() => loadAccounts()} />;

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
              <MetricCard label="Total Value" value={fmt(totalValue, rowCurrency)} />
              <MetricCard label="Invested" value={fmt(totalInvested, rowCurrency)} accent={totalValue >= totalInvested ? colors.success : colors.error} />
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
              const gainPct = h.invested > 0 ? (h.gain / h.invested) * 100 : 0;
              return (
                <Box key={h.id} sx={{
                  display: "flex", alignItems: "center", gap: 2,
                  px: { xs: 1.5, sm: 3 }, py: 1.5,
                  borderTop: i > 0 ? `1px solid ${theme.palette.divider}` : "none",
                  transition: "background .15s", "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                  flexWrap: "wrap",
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>{h.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{h.symbol} · {h.unitsAreShares ? `${fmtUnits(h.units)} units` : fmt(h.units, accountCurrency)}</Typography>
                  </Box>
                  <Box sx={{ textAlign: "right", minWidth: { xs: 90, sm: 110 } }}>
                    <Typography variant="subtitle2">{fmt(h.currentDayValue, h.displayCurrency)}</Typography>
                    {h.invested > 0 && (
                      <Typography variant="caption" sx={{ fontWeight: 600, color: h.gain >= 0 ? colors.success : colors.error }}>
                        {h.gain >= 0 ? "+" : ""}{fmt(h.gain, h.displayCurrency)}
                      </Typography>
                    )}
                    <TintedChip
                      label={`${h.gain >= 0 ? "+" : ""}${gainPct.toFixed(1)}%`}
                      color={h.gain >= 0 ? colors.success : colors.error}
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
        <Fab onClick={() => setCreateOpen(true)} sx={{ position: "fixed", bottom: { xs: "calc(80px + env(safe-area-inset-bottom, 0px))", sm: 80 }, right: 20, bgcolor: colors.brand, color: colors.pureWhite, boxShadow: `0 4px 20px ${alpha(colors.brand, 0.4)}`, "&:hover": { bgcolor: colors.brandDark, boxShadow: `0 6px 28px ${alpha(colors.brand, 0.5)}` } }} aria-label="Add holding">
          <AddIcon />
        </Fab>
      )}
    </Stack>
  );
}

export default Holdings;
