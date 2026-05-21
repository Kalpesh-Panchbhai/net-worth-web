import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, Button, Avatar, Fab,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, Breadcrumbs, Link as MuiLink,
  Checkbox, List, ListItem, ListItemButton, ListItemText, ListItemIcon,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import LinkIcon from "@mui/icons-material/Link";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import AllInclusiveRoundedIcon from "@mui/icons-material/AllInclusiveRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { useUser } from "../context/UserContext";
import {
  getWatchlists, getWatchlistAccounts, getAccounts,
  linkWatchlistAccount, unlinkWatchlistAccount,
  invalidateCache,
} from "../api/client";
import { EmptyState, ErrorState, ListSkeleton, TintedChip, FadeIn } from "../components/shared";
import { tokens } from "../theme";
import type { WatchlistSummary, AccountSummary } from "../api/types";

const { colors, shadow, typeColors } = tokens;

const TYPE_LABELS: Record<string, string> = {
  BROKER: "Broker", SAVINGS: "Savings", CREDIT_CARD: "Credit Card", LOAN: "Loan", OTHER: "Other",
};
const TYPE_ICONS: Record<string, React.ReactNode> = {
  BROKER: <ShowChartRoundedIcon sx={{ fontSize: 18 }} />,
  SAVINGS: <SavingsRoundedIcon sx={{ fontSize: 18 }} />,
  CREDIT_CARD: <CreditCardRoundedIcon sx={{ fontSize: 18 }} />,
  LOAN: <AccountBalanceRoundedIcon sx={{ fontSize: 18 }} />,
  OTHER: <MoreHorizRoundedIcon sx={{ fontSize: 18 }} />,
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
  const totalGain = totalValue - totalInvested;
  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

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

  const isAll = watchlist?.name === "All";
  const heroGradient = isAll
    ? "linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)"
    : "linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)";

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
      {/* Breadcrumbs */}
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
        <MuiLink underline="hover" color="inherit" sx={{ cursor: "pointer" }} onClick={() => navigate("/watchlists")}>
          Watchlists
        </MuiLink>
        <Typography color="text.primary">{watchlist?.name || "..."}</Typography>
      </Breadcrumbs>

      {loading ? <ListSkeleton rows={3} /> : watchlist && (
        <>
          {/* ── Watchlist Hero Card ── */}
          <FadeIn>
            <Paper sx={{
              p: { xs: 3, sm: 4 }, borderRadius: 4, border: "none",
              background: heroGradient, color: colors.white,
              position: "relative", overflow: "hidden",
              boxShadow: `0 8px 32px ${alpha(isAll ? colors.brand : colors.accent, 0.3)}`,
            }}>
              <Box sx={{ position: "absolute", top: -50, right: -50, width: 180, height: 180, borderRadius: "50%", bgcolor: alpha(colors.white, 0.06) }} />
              <Box sx={{ position: "absolute", bottom: -30, right: 80, width: 100, height: 100, borderRadius: "50%", bgcolor: alpha(colors.white, 0.04) }} />

              <Box sx={{ position: "relative", zIndex: 1 }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                  <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(colors.white, 0.2), color: colors.white, borderRadius: 2 }}>
                    {isAll ? <AllInclusiveRoundedIcon sx={{ fontSize: 20 }} /> : <VisibilityRoundedIcon sx={{ fontSize: 20 }} />}
                  </Avatar>
                  <Box>
                    <Typography sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" }, fontWeight: 700, opacity: 0.95, lineHeight: 1.2 }}>
                      {watchlist.name}
                    </Typography>
                    <Typography sx={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.65 }}>
                      {linkedAccounts.length} account{linkedAccounts.length !== 1 ? "s" : ""}
                    </Typography>
                  </Box>
                </Stack>
                <Typography sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem" }, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                  {fmt(totalValue)}
                </Typography>
              </Box>

              <Stack direction="row" spacing={1.5} sx={{ mt: 2, position: "relative", zIndex: 1 }} flexWrap="wrap">
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

          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

          {/* ── Linked account cards ── */}
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
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
              {linkedAccounts.map((a, i) => {
                const gain = a.currentDayValue - a.invested;
                const gainPct = a.invested > 0 ? (gain / a.invested) * 100 : 0;
                const tc = typeColors[a.type] || colors.gray500;
                return (
                  <FadeIn key={a.id} delay={i * 40}>
                    <Paper
                      onClick={() => navigate(`/accounts/${a.id}`)}
                      sx={{
                        p: 2.5, cursor: "pointer", borderRadius: 3,
                        borderLeft: `4px solid ${tc}`,
                        transition: "all 0.2s ease",
                        "&:hover": { boxShadow: shadow.hover, transform: "translateY(-2px)" },
                      }}
                    >
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                        <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(tc, 0.1), color: tc, borderRadius: 2 }}>
                          {TYPE_ICONS[a.type] || <MoreHorizRoundedIcon sx={{ fontSize: 18 }} />}
                        </Avatar>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography sx={{ fontWeight: 650, fontSize: "0.9rem", lineHeight: 1.2 }} noWrap>{a.name}</Typography>
                          <Typography variant="caption" sx={{ color: colors.gray400 }}>
                            {TYPE_LABELS[a.type] || a.type} · {a.currency}
                          </Typography>
                        </Box>
                      </Stack>
                      <Typography sx={{ fontSize: "1.25rem", fontWeight: 750, letterSpacing: "-0.02em", mb: 0.5 }}>
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
          )}
        </>
      )}

      {/* FAB - Link Accounts */}
      {!isAll && watchlist && (
        <Fab onClick={openLinkDialog}
          variant={isMobile ? "circular" : "extended"}
          sx={{
            position: "fixed",
            bottom: { xs: 80, sm: 24 },
            right: { xs: 16, sm: 24 },
            background: heroGradient,
            color: colors.white,
            boxShadow: `0 4px 20px ${alpha(colors.accent, 0.4)}`,
            "&:hover": { filter: "brightness(0.9)", boxShadow: `0 6px 28px ${alpha(colors.accent, 0.5)}` },
          }}>
          <LinkIcon sx={isMobile ? {} : { mr: 0.5 }} />
          {!isMobile && "Link Accounts"}
        </Fab>
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
