import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, TextField, Button, MenuItem,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControlLabel, Switch, Stack, IconButton, Fab, Avatar,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import { useUser } from "../context/UserContext";
import {
  getAccounts, createAccount, updateAccount, deleteAccount, invalidateCache,
} from "../api/client";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import { EmptyState, ErrorState, ListSkeleton, TintedChip, FadeIn } from "../components/shared";
import { tokens } from "../theme";
import type { AccountSummary, AccountType } from "../api/types";

const { colors, typeColors, shadow } = tokens;
const ACCOUNT_TYPES: AccountType[] = ["BROKER", "SAVINGS", "CREDIT_CARD", "LOAN", "OTHER"];
const TYPE_LABELS: Record<AccountType, string> = {
  BROKER: "Broker", SAVINGS: "Savings", CREDIT_CARD: "Credit Card", LOAN: "Loan", OTHER: "Other",
};
const TYPE_ICONS: Record<string, React.ReactNode> = {
  BROKER: <ShowChartRoundedIcon sx={{ fontSize: 20 }} />,
  SAVINGS: <SavingsRoundedIcon sx={{ fontSize: 20 }} />,
  CREDIT_CARD: <CreditCardRoundedIcon sx={{ fontSize: 20 }} />,
  LOAN: <AccountBalanceRoundedIcon sx={{ fontSize: 20 }} />,
  OTHER: <MoreHorizRoundedIcon sx={{ fontSize: 20 }} />,
};

function fmt(v: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
}

function Accounts() {
  const { userId } = useUser();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<AccountType>("BROKER");
  const [newCurrency, setNewCurrency] = useState("INR");
  const [newActive, setNewActive] = useState(true);
  const [newDailyData, setNewDailyData] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editAccount, setEditAccount] = useState<AccountSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [editActive, setEditActive] = useState(true);
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
  const totalGain = totalValue - totalInvested;
  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

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
      setEditAccount(null); invalidateCache("accounts"); await load();
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
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* ── Hero Card ── */}
      {!loading && (
        <FadeIn>
          <Paper sx={{
            p: { xs: 3, sm: 4 }, borderRadius: 4, border: "none",
            background: "linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)",
            color: colors.white, position: "relative", overflow: "hidden",
            boxShadow: `0 8px 32px ${alpha(colors.brand, 0.3)}`,
          }}>
            <Box sx={{ position: "absolute", top: -50, right: -50, width: 180, height: 180, borderRadius: "50%", bgcolor: alpha(colors.white, 0.06) }} />
            <Box sx={{ position: "absolute", bottom: -30, right: 80, width: 100, height: 100, borderRadius: "50%", bgcolor: alpha(colors.white, 0.04) }} />

            <Box sx={{ position: "relative", zIndex: 1 }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(colors.white, 0.2), color: colors.white, borderRadius: 2 }}>
                  <AccountBalanceWalletRoundedIcon sx={{ fontSize: 20 }} />
                </Avatar>
                <Typography sx={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.75 }}>
                  Accounts · {accounts.length} total
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem" }, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                {fmt(totalValue)}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1.5} sx={{ mt: 2, position: "relative", zIndex: 1 }} flexWrap="wrap" useFlexGap>
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.5, borderRadius: 2, bgcolor: alpha(colors.white, 0.12), fontSize: "0.78rem", fontWeight: 600 }}>
                Invested: {fmt(totalInvested)}
              </Box>
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.5, borderRadius: 2, bgcolor: alpha(colors.white, totalGain >= 0 ? 0.15 : 0.12), fontSize: "0.78rem", fontWeight: 600 }}>
                {totalGain >= 0 ? <TrendingUpIcon sx={{ fontSize: 14 }} /> : <TrendingDownIcon sx={{ fontSize: 14 }} />}
                {totalGain >= 0 ? "+" : ""}{fmt(totalGain)} ({totalGainPct >= 0 ? "+" : ""}{totalGainPct.toFixed(1)}%)
              </Box>
            </Stack>
          </Paper>
        </FadeIn>
      )}

      {/* Account cards grid */}
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
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            {accounts.map((a, i) => {
              const gain = a.currentDayValue - a.invested;
              const gainPct = a.invested > 0 ? (gain / a.invested) * 100 : 0;
              const tc = typeColors[a.type] || colors.gray500;
              return (
                <FadeIn key={a.id} delay={i * 40}>
                  <Paper
                    onClick={() => navigate(`/accounts/${a.id}`)}
                    sx={{
                      p: 2.5, cursor: "pointer",
                      borderRadius: 3,
                      borderLeft: `4px solid ${tc}`,
                      transition: "all 0.2s ease",
                      "&:hover": { boxShadow: shadow.hover, transform: "translateY(-2px)" },
                      opacity: a.isActive ? 1 : 0.6,
                      position: "relative",
                    }}
                  >
                    {/* Header */}
                    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, mb: 2 }}>
                      <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(tc, 0.1), color: tc }}>
                        {TYPE_ICONS[a.type] || TYPE_ICONS.OTHER}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 650, fontSize: "0.9rem", lineHeight: 1.3 }} noWrap>{a.name}</Typography>
                        <Typography variant="caption" sx={{ color: colors.gray400 }}>
                          {TYPE_LABELS[a.type as AccountType] || a.type} · {a.currency}
                          {!a.isActive && " · Inactive"}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0} onClick={e => e.stopPropagation()}>
                        <IconButton size="small" onClick={() => openEdit(a)} sx={{ color: colors.gray400 }}>
                          <EditOutlinedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                        <IconButton size="small" onClick={() => setDeleteConfirm(a)} sx={{ color: colors.gray400 }}>
                          <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Stack>
                    </Box>

                    {/* Value */}
                    <Typography sx={{ fontSize: "1.35rem", fontWeight: 750, letterSpacing: "-0.02em", mb: 0.5 }}>
                      {fmt(a.currentDayValue, a.currency)}
                    </Typography>
                    <TintedChip
                      label={`${gain >= 0 ? "+" : ""}${gainPct.toFixed(1)}% · ${gain >= 0 ? "+" : ""}${fmt(gain, a.currency)}`}
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

      <Fab onClick={() => setCreateOpen(true)}
        variant={isMobile ? "circular" : "extended"}
        sx={{
          position: "fixed",
          bottom: 24,
          right: { xs: 16, sm: 24 },
          background: "linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)",
          color: colors.white,
          boxShadow: `0 4px 20px ${alpha(colors.brand, 0.4)}`,
          "&:hover": { background: "linear-gradient(135deg, #1D4ED8 0%, #6D28D9 100%)", boxShadow: `0 6px 28px ${alpha(colors.brand, 0.5)}` },
        }}>
        <AddIcon sx={isMobile ? {} : { mr: 0.5 }} />
        {!isMobile && "Add Account"}
      </Fab>
    </Stack>
  );
}

export default Accounts;
