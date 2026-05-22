import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, Button, Avatar, Fab, TextField, Collapse,
  Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Switch,
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
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import InputAdornment from "@mui/material/InputAdornment";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { useUser } from "../context/UserContext";
import {
  getWatchlists, getWatchlistAccounts, getAccounts,
  linkWatchlistAccount, unlinkWatchlistAccount,
  invalidateCache,
} from "../api/client";
import { EmptyState, ErrorState, ListSkeleton, FadeIn } from "../components/shared";
import EntityChart from "../components/EntityChart";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import type { WatchlistSummary, AccountSummary, AccountType } from "../api/types";

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
  const hasDecimals = v % 1 !== 0;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: hasDecimals ? 2 : 0 }).format(v);
}

function WatchlistDetail() {
  const { watchlistId } = useParams<{ watchlistId: string }>();
  const navigate = useNavigate();
  const { userId } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, shadow, typeColors, gradients } = useTokens();

  const { showToast } = useToast();
  const [watchlist, setWatchlist] = useState<WatchlistSummary | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [groupByType, setGroupByType] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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
  const totalPrev = linkedAccounts.reduce((s, a) => s + a.previousDayValue, 0);
  const totalDayChg = totalValue - totalPrev;
  const totalDayPct = totalPrev > 0 ? (totalDayChg / totalPrev) * 100 : 0;

  const openLinkDialog = async () => {
    if (!userId) return;
    setLinkOpen(true); setLinkLoading(true);
    try {
      const [accs, linked] = await Promise.all([getAccounts(userId), getWatchlistAccounts(numWatchlistId)]);
      setAllAccounts(accs);
      setLinkedIds(new Set(linked.map(a => a.id)));
    } catch (err) { showToast(err instanceof Error ? err.message : "Failed to load accounts", "error"); }
    finally { setLinkLoading(false); }
  };

  const toggleAccount = async (accountId: number) => {
    const isLinked = linkedIds.has(accountId);
    const acctName = allAccounts.find(a => a.id === accountId)?.name || "Account";
    try {
      if (isLinked) {
        await unlinkWatchlistAccount(numWatchlistId, accountId);
        setLinkedIds(prev => { const n = new Set(prev); n.delete(accountId); return n; });
        showToast(`"${acctName}" unlinked`);
      } else {
        await linkWatchlistAccount(numWatchlistId, accountId);
        setLinkedIds(prev => new Set(prev).add(accountId));
        showToast(`"${acctName}" linked`);
      }
      invalidateCache("watchlist"); invalidateCache("account-watchlist");
    } catch (err) { showToast(err instanceof Error ? err.message : "Failed to update link", "error"); }
  };

  const closeLinkDialog = () => {
    setLinkOpen(false);
    invalidateCache("watchlist"); invalidateCache("account");
    loadWatchlist();
  };

  // Filter, sort, group
  const sq = searchQuery.toLowerCase().trim();
  const filtered = (sq
    ? linkedAccounts.filter(a => a.name.toLowerCase().includes(sq) || (TYPE_LABELS[a.type] || a.type).toLowerCase().includes(sq))
    : linkedAccounts
  ).sort((a, b) => groupByType
    ? (TYPE_LABELS[a.type] || a.type).localeCompare(TYPE_LABELS[b.type] || b.type) || a.name.localeCompare(b.name)
    : a.name.localeCompare(b.name)
  );

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
            p: 2.5, cursor: "pointer", borderRadius: 3,
            borderLeft: `4px solid ${tc}`,
            transition: "all 0.2s ease",
            "&:hover": { boxShadow: shadow.hover, transform: "translateY(-2px)" },
            opacity: a.isActive ? 1 : 0.6,
            height: "100%", display: "flex", flexDirection: "column",
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
                {!a.isActive && " · Inactive"}
              </Typography>
            </Box>
          </Stack>
          <Typography sx={{ fontSize: "1.25rem", fontWeight: 750, letterSpacing: "-0.02em", mb: 0.25 }}>
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

  if (error && !watchlist && !loading) return <ErrorState message={error} onRetry={loadWatchlist} />;

  const isAll = watchlist?.name === "All";
  const heroGradient = isAll ? gradients.hero : gradients.accentCard;

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
              background: heroGradient, color: colors.pureWhite,
              position: "relative", overflow: "hidden",
              boxShadow: `0 8px 32px ${alpha(isAll ? colors.brand : colors.accent, 0.3)}`,
            }}>
              <Box sx={{ position: "absolute", top: -50, right: -50, width: 180, height: 180, borderRadius: "50%", bgcolor: alpha(colors.pureWhite, 0.06) }} />
              <Box sx={{ position: "absolute", bottom: -30, right: 80, width: 100, height: 100, borderRadius: "50%", bgcolor: alpha(colors.pureWhite, 0.04) }} />

              <Box sx={{ position: "relative", zIndex: 1 }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                  <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(colors.pureWhite, 0.2), color: colors.pureWhite, borderRadius: 2 }}>
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

              {(() => {
                const hasInvestable = linkedAccounts.some(a => a.type === "BROKER" || a.needsDailyData);
                return (
                <Stack direction="row" spacing={1.5} sx={{ mt: 2, position: "relative", zIndex: 1 }} flexWrap="wrap">
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


          {/* ── Chart ── */}
          <FadeIn delay={80}>
            <EntityChart entityType="watchlist" entityId={numWatchlistId} accentColor={isAll ? colors.brand : colors.accent} showInvested={linkedAccounts.some(a => a.type === "BROKER" || a.needsDailyData)} />
          </FadeIn>

          {/* Search + Group toolbar */}
          {linkedAccounts.length > 0 && (
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
                  const isGroupCollapsed = !!collapsed[type];
                  return (
                    <FadeIn key={type} delay={si * 40}>
                      <Paper sx={{ borderRadius: 3, overflow: "hidden", border: `1px solid ${colors.gray200}` }} elevation={0}>
                        <Box
                          onClick={() => setCollapsed(prev => ({ ...prev, [type]: !prev[type] }))}
                          sx={{
                            px: { xs: 2, sm: 3 }, py: 1.5,
                            bgcolor: alpha(tc, 0.05),
                            borderBottom: isGroupCollapsed ? "none" : `1px solid ${colors.gray200}`,
                            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1,
                            cursor: "pointer", userSelect: "none",
                            "&:hover": { bgcolor: alpha(tc, 0.08) },
                            transition: "background-color 0.15s ease",
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                            {isGroupCollapsed
                              ? <ExpandMoreRoundedIcon sx={{ fontSize: 20, color: colors.gray400 }} />
                              : <ExpandLessRoundedIcon sx={{ fontSize: 20, color: colors.gray400 }} />}
                            <Avatar sx={{ width: 28, height: 28, bgcolor: alpha(tc, 0.12), color: tc, fontSize: "0.6rem" }}>
                              {TYPE_ICONS[type] || <MoreHorizRoundedIcon sx={{ fontSize: 16 }} />}
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
                        <Collapse in={!isGroupCollapsed}>
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
        </>
      )}

      {/* FAB - Link Accounts */}
      {!isAll && watchlist && (
        <Fab onClick={openLinkDialog}
          variant={isMobile ? "circular" : "extended"}
          sx={{
            position: "fixed",
            bottom: 24,
            right: { xs: 16, sm: 24 },
            bgcolor: isAll ? colors.brand : colors.accent,
            color: colors.pureWhite,
            boxShadow: `0 4px 20px ${alpha(isAll ? colors.brand : colors.accent, 0.4)}`,
            "&:hover": { bgcolor: isAll ? colors.brandDark : colors.accentDark, boxShadow: `0 6px 28px ${alpha(isAll ? colors.brand : colors.accent, 0.5)}` },
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
