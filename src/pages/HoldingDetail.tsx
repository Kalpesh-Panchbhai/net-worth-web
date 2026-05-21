import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, TextField, Button, MenuItem, Avatar,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, IconButton, Fab, Breadcrumbs, Link as MuiLink,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ReceiptOutlinedIcon from "@mui/icons-material/ReceiptOutlined";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import { useUser } from "../context/UserContext";
import {
  getAccounts, getHoldings, getTransactions, createTransaction, deleteTransaction,
  invalidateCache,
} from "../api/client";
import { EmptyState, ErrorState, ListSkeleton, TintedChip, FadeIn } from "../components/shared";
import { tokens } from "../theme";
import type { AccountSummary, HoldingSummary, Transaction } from "../api/types";

const { colors, shadow } = tokens;

function fmt(v: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
}

function parseTxnDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return {
    day: d.getDate(),
    month: d.toLocaleDateString("en-IN", { month: "short" }),
    year: d.getFullYear(),
    full: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
  };
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

  const holdingGain = holding ? holding.currentDayValue - holding.invested : 0;
  const holdingGainPct = holding && holding.invested > 0 ? (holdingGain / holding.invested) * 100 : 0;

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
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
          {/* ── Holding Hero Card ── */}
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
                  <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(colors.white, 0.2), color: colors.white, fontSize: "0.65rem", fontWeight: 800, borderRadius: 2 }}>
                    {holding.symbol.slice(0, 3)}
                  </Avatar>
                  <Box>
                    <Typography sx={{ fontSize: { xs: "1rem", sm: "1.15rem" }, fontWeight: 700, opacity: 0.95, lineHeight: 1.2 }}>
                      {holding.name}
                    </Typography>
                    <Typography sx={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.65 }}>
                      {holding.symbol} · {holding.units} units
                    </Typography>
                  </Box>
                </Stack>
                <Typography sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem" }, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, mt: 1 }}>
                  {fmt(holding.currentDayValue, currency)}
                </Typography>
              </Box>

              <Stack direction="row" spacing={1.5} sx={{ mt: 2, position: "relative", zIndex: 1 }} flexWrap="wrap">
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.5, borderRadius: 2, bgcolor: alpha(colors.white, 0.12), fontSize: "0.78rem", fontWeight: 600 }}>
                  Invested: {fmt(holding.invested, currency)}
                </Box>
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.5, borderRadius: 2, bgcolor: alpha(colors.white, holdingGain >= 0 ? 0.15 : 0.12), fontSize: "0.78rem", fontWeight: 600 }}>
                  {holdingGain >= 0 ? <TrendingUpIcon sx={{ fontSize: 14 }} /> : <TrendingDownIcon sx={{ fontSize: 14 }} />}
                  {holdingGain >= 0 ? "+" : ""}{fmt(holdingGain, currency)} ({holdingGainPct >= 0 ? "+" : ""}{holdingGainPct.toFixed(1)}%)
                </Box>
              </Stack>
            </Paper>
          </FadeIn>

          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

          {/* ── Transaction timeline ── */}
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
              <Typography variant="subtitle1" sx={{ color: colors.gray500 }}>
                {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
              </Typography>
              <Stack spacing={0}>
                {transactions.map((t, i) => {
                  const gain = t.value - t.invested;
                  const gainPct = t.invested > 0 ? (gain / t.invested) * 100 : 0;
                  const dt = parseTxnDate(t.txnDate);
                  return (
                    <FadeIn key={t.id} delay={i * 30}>
                      <Box sx={{ display: "flex", gap: { xs: 1.5, sm: 2.5 }, alignItems: "flex-start", position: "relative" }}>
                        {/* Timeline connector */}
                        {i < transactions.length - 1 && (
                          <Box sx={{
                            position: "absolute", left: 23, top: 52,
                            width: 2, bottom: -4,
                            bgcolor: colors.gray200,
                          }} />
                        )}
                        {/* Date bubble */}
                        <Box sx={{
                          width: 48, minWidth: 48, pt: 1.5,
                          display: "flex", flexDirection: "column", alignItems: "center",
                          position: "relative", zIndex: 1,
                        }}>
                          <Box sx={{
                            width: 48, height: 48, borderRadius: 3,
                            bgcolor: gain >= 0 ? alpha(colors.success, 0.08) : alpha(colors.error, 0.08),
                            display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center",
                          }}>
                            <Typography sx={{ fontSize: "1rem", fontWeight: 750, lineHeight: 1, color: gain >= 0 ? colors.success : colors.error }}>
                              {dt.day}
                            </Typography>
                            <Typography sx={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", color: colors.gray500, lineHeight: 1, mt: 0.25 }}>
                              {dt.month}
                            </Typography>
                          </Box>
                        </Box>
                        {/* Transaction card */}
                        <Paper sx={{
                          flex: 1, p: 2, my: 0.75, borderRadius: 3,
                          transition: "all 0.2s ease",
                          "&:hover": { boxShadow: shadow.md },
                        }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, color: colors.gray500 }}>
                                {dt.full}
                              </Typography>
                              <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                                <Box>
                                  <Typography variant="caption" sx={{ color: colors.gray400, display: "block", lineHeight: 1 }}>Invested</Typography>
                                  <Typography sx={{ fontSize: "0.95rem", fontWeight: 650, mt: 0.25 }}>{fmt(t.invested, currency)}</Typography>
                                </Box>
                                <Box sx={{ color: colors.gray300, display: "flex", alignItems: "center" }}>→</Box>
                                <Box>
                                  <Typography variant="caption" sx={{ color: colors.gray400, display: "block", lineHeight: 1 }}>Units</Typography>
                                  <Typography sx={{ fontSize: "0.95rem", fontWeight: 650, mt: 0.25 }}>{fmt(t.value, currency)}</Typography>
                                </Box>
                              </Stack>
                            </Box>
                            <Stack alignItems="flex-end" spacing={0.5}>
                              <IconButton size="small" onClick={() => setDeleteConfirm(t)} sx={{ color: colors.gray400, mt: -0.5 }}>
                                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                              <TintedChip
                                label={`${gain >= 0 ? "+" : ""}${fmt(gain, currency)}`}
                                color={gain >= 0 ? colors.success : colors.error}
                                size="small"
                              />
                              <Typography variant="caption" sx={{ fontWeight: 600, color: gain >= 0 ? colors.success : colors.error }}>
                                {gainPct >= 0 ? "+" : ""}{gainPct.toFixed(1)}%
                              </Typography>
                            </Stack>
                          </Stack>
                        </Paper>
                      </Box>
                    </FadeIn>
                  );
                })}
              </Stack>
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

      {/* FAB — hidden for inactive accounts */}
      {holding && account?.isActive && (
        <Fab onClick={() => setCreateOpen(true)}
          variant={isMobile ? "circular" : "extended"}
          sx={{
            position: "fixed",
            bottom: 24,
            right: { xs: 16, sm: 24 },
            background: "linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)",
            color: colors.white,
            boxShadow: `0 4px 20px ${alpha(colors.brand, 0.4)}`,
            "&:hover": { filter: "brightness(0.9)", boxShadow: `0 6px 28px ${alpha(colors.brand, 0.5)}` },
          }}>
          <AddIcon sx={isMobile ? {} : { mr: 0.5 }} />
          {!isMobile && "Add Transaction"}
        </Fab>
      )}
    </Stack>
  );
}

export default HoldingDetail;
