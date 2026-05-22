import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, TextField, Button, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, Collapse,
  FormControlLabel, Switch, Stack, IconButton, Fab, Avatar,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import InputAdornment from "@mui/material/InputAdornment";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import { useUser } from "../context/UserContext";
import {
  getAccounts, createAccount, updateAccount, deleteAccount, invalidateCache,
} from "../api/client";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import { EmptyState, ErrorState, ListSkeleton, FadeIn } from "../components/shared";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import type { AccountSummary, AccountType } from "../api/types";
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
  const hasDecimals = v % 1 !== 0;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: hasDecimals ? 2 : 0 }).format(v);
}

function Accounts() {
  const { userId } = useUser();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, typeColors, shadow, gradients } = useTokens();
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<AccountType>("BROKER");
  const [newCurrency, setNewCurrency] = useState("INR");
  const [newActive, setNewActive] = useState(true);
  const [newDailyData, setNewDailyData] = useState(false);
  const [editAccount, setEditAccount] = useState<AccountSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<AccountSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupByType, setGroupByType] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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
  const totalPrev = accounts.reduce((s, a) => s + a.previousDayValue, 0);
  const totalDayChg = totalValue - totalPrev;
  const totalDayPct = totalPrev > 0 ? (totalDayChg / totalPrev) * 100 : 0;

  const handleCreate = async () => {
    if (!userId || !newName.trim()) return;
    const trimmed = newName.trim();
    const type = newType; const currency = newCurrency; const isActive = newActive; const needsDailyData = newDailyData;
    const prev = accounts;
    const tempId = -Date.now();
    const optimistic: AccountSummary = { id: tempId, userId, name: trimmed, type, isActive, needsDailyData, currency, currentDayValue: 0, previousDayValue: 0, invested: 0 };
    setAccounts(a => [...a, optimistic]);
    setCreateOpen(false); setNewName(""); setNewType("BROKER"); setNewCurrency("INR"); setNewActive(true); setNewDailyData(false);
    try {
      const created = await createAccount({ userId, name: trimmed, type, currency, isActive, needsDailyData });
      setAccounts(a => a.map(acc => acc.id === tempId ? { ...optimistic, ...created } : acc));
      invalidateCache("accounts");
      showToast(`Account "${trimmed}" created`);
    } catch (err) {
      setAccounts(prev);
      showToast(err instanceof Error ? err.message : "Failed to create account", "error");
    }
  };

  const handleUpdate = async () => {
    if (!editAccount) return;
    const name = editName.trim() || editAccount.name;
    const prev = accounts;
    setAccounts(a => a.map(acc => acc.id === editAccount.id ? { ...acc, name, isActive: editActive } : acc));
    setEditAccount(null);
    try {
      await updateAccount(editAccount.id, { name: editName.trim() || undefined, isActive: editActive });
      invalidateCache("accounts");
      showToast(`Account "${name}" updated`);
    } catch (err) {
      setAccounts(prev);
      showToast(err instanceof Error ? err.message : "Failed to update account", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const { id, name } = deleteConfirm;
    const prev = accounts;
    setAccounts(a => a.filter(acc => acc.id !== id));
    setDeleteConfirm(null);
    try {
      await deleteAccount(id);
      invalidateCache("accounts");
      showToast(`Account "${name}" deleted`);
    } catch (err) {
      setAccounts(prev);
      showToast(err instanceof Error ? err.message : "Failed to delete account", "error");
    }
  };

  const openEdit = (a: AccountSummary) => { setEditAccount(a); setEditName(a.name); setEditActive(a.isActive); };

  // Filter accounts by search query
  const q = searchQuery.toLowerCase().trim();
  const filtered = (q
    ? accounts.filter(a => a.name.toLowerCase().includes(q) || (TYPE_LABELS[a.type as AccountType] || a.type).toLowerCase().includes(q))
    : accounts
  ).sort((a, b) => groupByType
    ? (TYPE_LABELS[a.type as AccountType] || a.type).localeCompare(TYPE_LABELS[b.type as AccountType] || b.type) || a.name.localeCompare(b.name)
    : a.name.localeCompare(b.name)
  );

  // Group by type if enabled
  const grouped: Record<string, AccountSummary[]> = {};
  if (groupByType) {
    for (const a of filtered) {
      const key = a.type;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(a);
    }
  }

  const AccountCard = ({ a, i }: { a: AccountSummary; i: number }) => {
    const gain = a.currentDayValue - a.invested;
    const gainPct = a.invested > 0 ? (gain / a.invested) * 100 : 0;
    const dayChg = a.currentDayValue - a.previousDayValue;
    const dayPct = a.previousDayValue > 0 ? (dayChg / a.previousDayValue) * 100 : 0;
    const tc = typeColors[a.type] || colors.gray500;
    return (
      <FadeIn delay={i * 40}>
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
            height: "100%", display: "flex", flexDirection: "column",
          }}
        >
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
              <IconButton size="small" onClick={() => openEdit(a)} sx={{ color: colors.brand, opacity: 0.6, "&:hover": { opacity: 1, bgcolor: alpha(colors.brand, 0.08) } }}>
                <EditOutlinedIcon sx={{ fontSize: 16 }} />
              </IconButton>
              <IconButton size="small" onClick={() => setDeleteConfirm(a)} sx={{ color: colors.error, opacity: 0.6, "&:hover": { opacity: 1, bgcolor: alpha(colors.error, 0.08) } }}>
                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Stack>
          </Box>
          <Typography sx={{ fontSize: "1.35rem", fontWeight: 750, letterSpacing: "-0.02em", mb: 0.25 }}>
            {fmt(a.currentDayValue, a.currency)}
          </Typography>
          {(a.type === "BROKER" || a.needsDailyData) && (
            <Typography sx={{ fontSize: 11, color: colors.gray400, mb: 0.5 }}>
              Invested: {fmt(a.invested, a.currency)}
            </Typography>
          )}
          <Stack spacing={0.5} sx={{ mt: 0.5, alignSelf: "flex-start" }}>
            {(a.type === "BROKER" || a.needsDailyData) && a.invested > 0 && (
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: gain >= 0 ? colors.success : colors.error, display: "flex", alignItems: "center", gap: 0.5 }}>
                <Box component="span" sx={{ fontSize: 9, fontWeight: 700, bgcolor: alpha(gain >= 0 ? colors.success : colors.error, 0.12), px: 0.6, py: 0.1, borderRadius: 0.5 }}>P&L</Box>
                {gain >= 0 ? "+" : ""}{gainPct.toFixed(1)}% · {gain >= 0 ? "+" : ""}{fmt(gain, a.currency)}
              </Typography>
            )}
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: dayChg >= 0 ? colors.success : colors.error, display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box component="span" sx={{ fontSize: 9, fontWeight: 700, bgcolor: alpha(dayChg >= 0 ? colors.success : colors.error, 0.12), px: 0.6, py: 0.1, borderRadius: 0.5 }}>1D</Box>
              {dayChg >= 0 ? "+" : ""}{dayPct.toFixed(2)}% · {dayChg >= 0 ? "+" : ""}{fmt(dayChg, a.currency)}
            </Typography>
          </Stack>
        </Paper>
      </FadeIn>
    );
  };

  if (error && accounts.length === 0 && !loading) return <ErrorState message={error} onRetry={load} />;

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
      {/* ── Hero Card ── */}
      {!loading && (
        <FadeIn>
          <Paper sx={{
            p: { xs: 3, sm: 4 }, borderRadius: 4, border: "none",
            background: gradients.hero,
            color: colors.pureWhite, position: "relative", overflow: "hidden",
            boxShadow: `0 8px 32px ${alpha(colors.brand, 0.3)}`,
          }}>
            <Box sx={{ position: "absolute", top: -50, right: -50, width: 180, height: 180, borderRadius: "50%", bgcolor: alpha(colors.pureWhite, 0.06) }} />
            <Box sx={{ position: "absolute", bottom: -30, right: 80, width: 100, height: 100, borderRadius: "50%", bgcolor: alpha(colors.pureWhite, 0.04) }} />

            <Box sx={{ position: "relative", zIndex: 1 }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(colors.pureWhite, 0.2), color: colors.pureWhite, borderRadius: 2 }}>
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

            {(() => {
              const hasInvestable = accounts.some(a => a.type === "BROKER" || a.needsDailyData);
              return (
              <Stack direction="row" spacing={1.5} sx={{ mt: 2, position: "relative", zIndex: 1 }} flexWrap="wrap" useFlexGap>
                {hasInvestable && (
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.5, borderRadius: 2, bgcolor: alpha(colors.pureWhite, 0.12), fontSize: "0.78rem", fontWeight: 600 }}>
                    Invested: {fmt(totalInvested)}
                  </Box>
                )}
                {hasInvestable && totalInvested > 0 && (
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.5, borderRadius: 2, bgcolor: alpha(colors.pureWhite, totalGain >= 0 ? 0.15 : 0.12), fontSize: "0.78rem", fontWeight: 600 }}>
                    {totalGain >= 0 ? <TrendingUpIcon sx={{ fontSize: 14 }} /> : <TrendingDownIcon sx={{ fontSize: 14 }} />}
                    {totalGain >= 0 ? "+" : ""}{fmt(totalGain)} ({totalGainPct >= 0 ? "+" : ""}{totalGainPct.toFixed(1)}%)
                  </Box>
                )}
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.5, borderRadius: 2, bgcolor: alpha(colors.pureWhite, 0.12), fontSize: "0.78rem", fontWeight: 600 }}>
                  1D {totalDayChg >= 0 ? "+" : ""}{fmt(totalDayChg)} ({totalDayPct >= 0 ? "+" : ""}{totalDayPct.toFixed(1)}%)
                </Box>
              </Stack>
              );
            })()}
          </Paper>
        </FadeIn>
      )}

      {/* Search + Group toolbar */}
      {!loading && accounts.length > 0 && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
          <TextField
            size="small" placeholder="Search by name or type…" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, color: colors.gray400 }} /></InputAdornment> }}
            sx={{ flex: 1, maxWidth: { sm: 320 } }}
          />
          <FormControlLabel
            control={<Switch checked={groupByType} onChange={e => setGroupByType(e.target.checked)} size="small" />}
            label={<Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.8rem" }}>Group by type</Typography>}
          />
        </Stack>
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
      ) : filtered.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">No accounts match "{searchQuery}"</Typography>
        </Paper>
      ) : groupByType ? (
        <FadeIn delay={100}>
          <Stack spacing={2}>
            {Object.entries(grouped).map(([type, group], si) => {
              const tc = typeColors[type] || colors.gray500;
              const groupTotal = group.reduce((s, a) => s + a.currentDayValue, 0);
              const groupInvested = group.reduce((s, a) => s + a.invested, 0);
              const groupGain = groupTotal - groupInvested;
              const groupGainPct = groupInvested > 0 ? (groupGain / groupInvested) * 100 : 0;
              const groupPrev = group.reduce((s, a) => s + a.previousDayValue, 0);
              const groupDayChg = groupTotal - groupPrev;
              const groupDayPct = groupPrev > 0 ? (groupDayChg / groupPrev) * 100 : 0;
              const isCollapsed = !!collapsed[type];
              return (
                <FadeIn key={type} delay={si * 40}>
                  <Paper sx={{ borderRadius: 3, overflow: "hidden", border: `1px solid ${colors.gray200}` }} elevation={0}>
                    <Box
                      onClick={() => setCollapsed(prev => ({ ...prev, [type]: !prev[type] }))}
                      sx={{
                        px: { xs: 2, sm: 3 }, py: 1.5,
                        bgcolor: alpha(tc, 0.05),
                        borderBottom: isCollapsed ? "none" : `1px solid ${colors.gray200}`,
                        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1,
                        cursor: "pointer", userSelect: "none",
                        "&:hover": { bgcolor: alpha(tc, 0.08) },
                        transition: "background-color 0.15s ease",
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                        {isCollapsed
                          ? <ExpandMoreRoundedIcon sx={{ fontSize: 20, color: colors.gray400 }} />
                          : <ExpandLessRoundedIcon sx={{ fontSize: 20, color: colors.gray400 }} />}
                        <Avatar sx={{ width: 28, height: 28, bgcolor: alpha(tc, 0.12), color: tc, fontSize: "0.6rem" }}>
                          {TYPE_ICONS[type] || TYPE_ICONS.OTHER}
                        </Avatar>
                        <Typography sx={{ fontWeight: 700, fontSize: "0.95rem" }} noWrap>
                          {TYPE_LABELS[type as AccountType] || type}
                        </Typography>
                        <Typography variant="caption" sx={{ color: colors.gray400 }}>
                          {group.length} account{group.length !== 1 ? "s" : ""}
                        </Typography>
                      </Box>
                      <Stack alignItems="flex-end" spacing={0.25}>
                        <Typography sx={{ fontWeight: 750, fontSize: "1rem", letterSpacing: "-0.02em" }}>
                          {fmt(groupTotal)}
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          {group.some(a => a.type === "BROKER" || a.needsDailyData) && groupInvested > 0 && (
                            <Typography sx={{ fontSize: 10, fontWeight: 600, color: groupGain >= 0 ? colors.success : colors.error, display: "flex", alignItems: "center", gap: 0.4 }}>
                              <Box component="span" sx={{ fontSize: 8, fontWeight: 700, bgcolor: alpha(groupGain >= 0 ? colors.success : colors.error, 0.12), px: 0.5, py: 0.1, borderRadius: 0.5 }}>P&L</Box>
                              {groupGain >= 0 ? "+" : ""}{groupGainPct.toFixed(1)}%
                            </Typography>
                          )}
                          <Typography sx={{ fontSize: 10, fontWeight: 600, color: groupDayChg >= 0 ? colors.success : colors.error, display: "flex", alignItems: "center", gap: 0.4 }}>
                            <Box component="span" sx={{ fontSize: 8, fontWeight: 700, bgcolor: alpha(groupDayChg >= 0 ? colors.success : colors.error, 0.12), px: 0.5, py: 0.1, borderRadius: 0.5 }}>1D</Box>
                            {groupDayChg >= 0 ? "+" : ""}{groupDayPct.toFixed(1)}%
                          </Typography>
                        </Stack>
                      </Stack>
                    </Box>
                    <Collapse in={!isCollapsed}>
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gridAutoRows: "1fr", gap: 2, p: 2 }}>
                        {group.map((a, i) => <AccountCard key={a.id} a={a} i={i} />)}
                      </Box>
                    </Collapse>
                  </Paper>
                </FadeIn>
              );
            })}
          </Stack>
        </FadeIn>
      ) : (
        <FadeIn delay={100}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gridAutoRows: "1fr", gap: 2 }}>
            {filtered.map((a, i) => <AccountCard key={a.id} a={a} i={i} />)}
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
          <Button variant="contained" onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
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
          <Button variant="contained" onClick={handleUpdate} disabled={!editName.trim()}>Save</Button>
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
          bgcolor: colors.brand,
          color: colors.pureWhite,
          boxShadow: `0 4px 20px ${alpha(colors.brand, 0.4)}`,
          "&:hover": { bgcolor: colors.brandDark, boxShadow: `0 6px 28px ${alpha(colors.brand, 0.5)}` },
        }}>
        <AddIcon sx={isMobile ? {} : { mr: 0.5 }} />
        {!isMobile && "Add Account"}
      </Fab>
    </Stack>
  );
}

export default Accounts;
