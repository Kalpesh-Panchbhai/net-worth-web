import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, Button, Chip,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, Breadcrumbs, Link as MuiLink,
  Checkbox, List, ListItem, ListItemButton, ListItemText, ListItemIcon,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import LinkIcon from "@mui/icons-material/Link";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import { useUser } from "../context/UserContext";
import {
  getWatchlists, getWatchlistAccounts, getAccounts,
  linkWatchlistAccount, unlinkWatchlistAccount,
  invalidateCache,
} from "../api/client";
import { PageHeader, EmptyState, ErrorState, ListSkeleton, MetricCard, TintedChip, FadeIn } from "../components/shared";
import { tokens } from "../theme";
import type { WatchlistSummary, AccountSummary } from "../api/types";

const { colors } = tokens;

const TYPE_LABELS: Record<string, string> = {
  BROKER: "Broker", SAVINGS: "Savings", CREDIT_CARD: "Credit Card", LOAN: "Loan", OTHER: "Other",
};

function fmt(v: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
}

function WatchlistDetail() {
  const { watchlistId } = useParams<{ watchlistId: string }>();
  const navigate = useNavigate();
  const { userId } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [watchlist, setWatchlist] = useState<WatchlistSummary | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Link/Unlink dialog
  const [linkOpen, setLinkOpen] = useState(false);
  const [allAccounts, setAllAccounts] = useState<AccountSummary[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<number>>(new Set());
  const [linkLoading, setLinkLoading] = useState(false);

  const numWatchlistId = Number(watchlistId);

  const loadWatchlist = useCallback(async () => {
    if (!userId || !watchlistId) return;
    try {
      setLoading(true); setError(null);
      const [wls, accs] = await Promise.all([
        getWatchlists(userId),
        getWatchlistAccounts(numWatchlistId),
      ]);
      const found = wls.find(w => w.id === numWatchlistId);
      if (found) setWatchlist(found); else setError("Watchlist not found");
      setLinkedAccounts(accs);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [userId, watchlistId]);

  useEffect(() => { loadWatchlist(); }, [loadWatchlist]);

  const totalValue = linkedAccounts.reduce((s, a) => s + a.currentDayValue, 0);
  const totalInvested = linkedAccounts.reduce((s, a) => s + a.invested, 0);

  const openLinkDialog = async () => {
    if (!userId) return;
    setLinkOpen(true); setLinkLoading(true);
    try {
      const [accs, linked] = await Promise.all([getAccounts(userId), getWatchlistAccounts(numWatchlistId)]);
      setAllAccounts(accs);
      setLinkedIds(new Set(linked.map(a => a.id)));
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load accounts"); }
    finally { setLinkLoading(false); }
  };

  const toggleAccount = async (accountId: number) => {
    const isLinked = linkedIds.has(accountId);
    try {
      if (isLinked) {
        await unlinkWatchlistAccount(numWatchlistId, accountId);
        setLinkedIds(prev => { const n = new Set(prev); n.delete(accountId); return n; });
      } else {
        await linkWatchlistAccount(numWatchlistId, accountId);
        setLinkedIds(prev => new Set(prev).add(accountId));
      }
      invalidateCache("watchlist"); invalidateCache("account-watchlist");
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to update link"); }
  };

  const closeLinkDialog = () => {
    setLinkOpen(false);
    invalidateCache("watchlist"); invalidateCache("account");
    loadWatchlist();
  };

  if (error && !watchlist && !loading) return <ErrorState message={error} onRetry={loadWatchlist} />;

  return (
    <Stack spacing={{ xs: 2, sm: 3 }}>
      {/* Breadcrumbs */}
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
        <MuiLink underline="hover" color="inherit" sx={{ cursor: "pointer" }} onClick={() => navigate("/watchlists")}>
          Watchlists
        </MuiLink>
        <Typography color="text.primary">{watchlist?.name || "..."}</Typography>
      </Breadcrumbs>

      {loading ? <ListSkeleton rows={3} /> : watchlist && (
        <>
          <PageHeader
            title={watchlist.name}
            action={
              <Button variant="contained" startIcon={<LinkIcon />} onClick={openLinkDialog}>
                Link Accounts
              </Button>
            }
          />

          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

          {/* Summary */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr 1fr" }, gap: 2 }}>
            <FadeIn>
              <MetricCard label="Total Value" value={fmt(totalValue)} />
              <MetricCard label="Invested" value={fmt(totalInvested)} />
              <MetricCard label="Accounts" value={String(linkedAccounts.length)} />
            </FadeIn>
          </Box>

          {/* Linked accounts list */}
          {linkedAccounts.length === 0 ? (
            <Paper>
              <EmptyState
                icon={<AccountBalanceWalletOutlinedIcon />}
                title="No accounts linked"
                description="Link accounts to this watchlist to track them together."
                action={{ label: "Link Accounts", onClick: openLinkDialog }}
              />
            </Paper>
          ) : (
            <FadeIn delay={100}>
              <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
                {linkedAccounts.map((a, i) => {
                  const gain = a.currentDayValue - a.invested;
                  const gainPct = a.invested > 0 ? (gain / a.invested) * 100 : 0;
                  return (
                    <Box key={a.id} sx={{
                      display: "flex", alignItems: "center", gap: 2,
                      px: { xs: 2, sm: 3 }, py: 1.5,
                      borderTop: i > 0 ? `1px solid ${theme.palette.divider}` : "none",
                      cursor: "pointer",
                      transition: "background .15s", "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                      flexWrap: "wrap",
                    }}
                      onClick={() => navigate(`/accounts/${a.id}`)}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" noWrap>{a.name}</Typography>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                          <Chip label={TYPE_LABELS[a.type] || a.type} size="small" variant="outlined" />
                          <Chip label={a.currency} size="small" variant="outlined" />
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
                      <ChevronRightIcon fontSize="small" color="action" />
                    </Box>
                  );
                })}
              </Paper>
            </FadeIn>
          )}
        </>
      )}

      {/* Link Accounts Dialog */}
      <Dialog open={linkOpen} onClose={closeLinkDialog} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle>Link Accounts to {watchlist?.name}</DialogTitle>
        <DialogContent>
          {linkLoading ? <ListSkeleton rows={3} /> : allAccounts.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>No accounts available. Create an account first.</Typography>
          ) : (
            <List dense>
              {allAccounts.map(a => (
                <ListItem key={a.id} disablePadding>
                  <ListItemButton onClick={() => toggleAccount(a.id)}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox edge="start" checked={linkedIds.has(a.id)} tabIndex={-1} disableRipple />
                    </ListItemIcon>
                    <ListItemText primary={a.name} secondary={`${TYPE_LABELS[a.type] || a.type} · ${a.currency}`} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={closeLinkDialog}>Done</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default WatchlistDetail;
