import { useEffect, useState, useCallback } from "react";
import {
  Box, Paper, Typography, TextField, Button, MenuItem,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControlLabel, Switch, Stack, IconButton, Chip, Fab,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import { useUser } from "../context/UserContext";
import {
  getAccounts, createAccount, updateAccount, deleteAccount, invalidateCache,
} from "../api/client";
import { PageHeader, EmptyState, ErrorState, ListSkeleton, MetricCard, MetricSkeleton, TintedChip, FadeIn } from "../components/shared";
import { tokens } from "../theme";
import type { AccountSummary, AccountType } from "../api/types";

const { colors } = tokens;
const ACCOUNT_TYPES: AccountType[] = ["BROKER", "SAVINGS", "CREDIT_CARD", "LOAN", "OTHER"];
const TYPE_LABELS: Record<AccountType, string> = {
  BROKER: "Broker", SAVINGS: "Savings", CREDIT_CARD: "Credit Card", LOAN: "Loan", OTHER: "Other",
};

function fmt(v: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
}

function Accounts() {
  const { userId } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<AccountType>("BROKER");
  const [newCurrency, setNewCurrency] = useState("INR");
  const [newActive, setNewActive] = useState(true);
  const [newDailyData, setNewDailyData] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit dialog
  const [editAccount, setEditAccount] = useState<AccountSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [editActive, setEditActive] = useState(true);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<AccountSummary | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try { setLoading(true); setError(null); setAccounts(await getAccounts(userId)); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const totalValue = accounts.reduce((s, a) => s + a.currentDayValue, 0);
  const totalInvested = accounts.reduce((s, a) => s + a.invested, 0);
  const activeCount = accounts.filter(a => a.isActive).length;

  const handleCreate = async () => {
    if (!userId || !newName.trim()) return;
    try {
      setSaving(true);
      await createAccount({ userId, name: newName.trim(), type: newType, currency: newCurrency, isActive: newActive, needsDailyData: newDailyData });
      setCreateOpen(false); setNewName(""); setNewType("BROKER"); setNewCurrency("INR"); setNewActive(true); setNewDailyData(false);
      invalidateCache("accounts"); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to create"); }
    finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    if (!editAccount) return;
    try {
      setSaving(true);
      await updateAccount(editAccount.id, { name: editName.trim() || undefined, isActive: editActive });
      setEditAccount(null);
      invalidateCache("accounts"); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to update"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try { await deleteAccount(deleteConfirm.id); setDeleteConfirm(null); invalidateCache("accounts"); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to delete"); }
  };

  const openEdit = (a: AccountSummary) => { setEditAccount(a); setEditName(a.name); setEditActive(a.isActive); };

  if (error && accounts.length === 0 && !loading) return <ErrorState message={error} onRetry={load} />;

  return (
    <Stack spacing={{ xs: 2, sm: 3 }}>
      <PageHeader
        title="Accounts"
        action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>Add Account</Button>}
      />

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* Summary metrics */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr 1fr" }, gap: 2 }}>
        {loading ? <><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></> : (
          <FadeIn>
            <MetricCard label="Total Value" value={fmt(totalValue)} />
            <MetricCard label="Invested" value={fmt(totalInvested)} />
            <MetricCard label="Active" value={`${activeCount} / ${accounts.length}`} />
          </FadeIn>
        )}
      </Box>

      {loading ? <ListSkeleton rows={4} /> : accounts.length === 0 ? (
        <Paper>
          <EmptyState
            icon={<AccountBalanceWalletOutlinedIcon />}
            title="No accounts"
            description="Create your first account to start tracking your net worth."
            action={{ label: "Add Account", onClick: () => setCreateOpen(true) }}
          />
        </Paper>
      ) : (
        <FadeIn delay={100}>
          <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
            {accounts.map((a, i) => {
              const gain = a.currentDayValue - a.invested;
              const gainPct = a.invested > 0 ? (gain / a.invested) * 100 : 0;
              return (
                <Box key={a.id} sx={{
                  display: "flex", alignItems: "center", gap: 2,
                  px: { xs: 2, sm: 3 }, py: 1.5,
                  borderTop: i > 0 ? `1px solid ${theme.palette.divider}` : "none",
                  transition: "background .15s", "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                  flexWrap: "wrap",
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>{a.name}</Typography>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                      <Chip label={TYPE_LABELS[a.type as AccountType] || a.type} size="small" variant="outlined" />
                      <Chip label={a.currency} size="small" variant="outlined" />
                      {!a.isActive && <Chip label="Inactive" size="small" color="warning" variant="outlined" />}
                    </Stack>
                  </Box>
                  <Box sx={{ textAlign: "right", minWidth: 120 }}>
                    <Typography variant="subtitle2">{fmt(a.currentDayValue, a.currency)}</Typography>
                    <TintedChip
                      label={`${gain >= 0 ? "+" : ""}${gainPct.toFixed(1)}%`}
                      color={gain >= 0 ? colors.success : colors.error}
                      size="small"
                    />
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    <IconButton size="small" onClick={() => openEdit(a)} aria-label={`Edit ${a.name}`}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => setDeleteConfirm(a)} aria-label={`Delete ${a.name}`}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Box>
              );
            })}
          </Paper>
        </FadeIn>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle>New Account</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <Stack spacing={2}>
            <TextField label="Name" value={newName} onChange={e => setNewName(e.target.value)} fullWidth autoFocus />
            <TextField label="Type" value={newType} onChange={e => setNewType(e.target.value as AccountType)} select fullWidth>
              {ACCOUNT_TYPES.map(t => <MenuItem key={t} value={t}>{TYPE_LABELS[t]}</MenuItem>)}
            </TextField>
            <TextField label="Currency" value={newCurrency} onChange={e => setNewCurrency(e.target.value)} fullWidth />
            <FormControlLabel control={<Switch checked={newActive} onChange={e => setNewActive(e.target.checked)} />} label="Active" />
            <FormControlLabel control={<Switch checked={newDailyData} onChange={e => setNewDailyData(e.target.checked)} />} label="Needs Daily Data" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !newName.trim()}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editAccount} onClose={() => setEditAccount(null)} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle>Edit Account</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <Stack spacing={2}>
            <TextField label="Name" value={editName} onChange={e => setEditName(e.target.value)} fullWidth autoFocus />
            <FormControlLabel control={<Switch checked={editActive} onChange={e => setEditActive(e.target.checked)} />} label="Active" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditAccount(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdate} disabled={saving}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Account</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{deleteConfirm?.name}</strong>? This will remove all associated holdings and transactions.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>

      {isMobile && (
        <Fab color="primary" onClick={() => setCreateOpen(true)} sx={{ position: "fixed", bottom: 80, right: 20 }} aria-label="Add account">
          <AddIcon />
        </Fab>
      )}
    </Stack>
  );
}

export default Accounts;
