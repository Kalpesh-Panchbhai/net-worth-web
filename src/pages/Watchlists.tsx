import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, TextField, Button,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, IconButton, Fab, Avatar,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import InputAdornment from "@mui/material/InputAdornment";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import AllInclusiveRoundedIcon from "@mui/icons-material/AllInclusiveRounded";
import { useUser } from "../context/UserContext";
import {
  getWatchlists, createWatchlist, updateWatchlist, deleteWatchlist,
  invalidateCache,
} from "../api/client";
import { EmptyState, ErrorState, ListSkeleton, FadeIn } from "../components/shared";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import XirrBadge from "../components/XirrBadge";
import type { WatchlistSummary } from "../api/types";
import { formatCurrency as fmt } from "../utils/format";

function Watchlists() {
  const { userId, preferredCurrency, dataVersion, refreshAll } = useUser();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, shadow } = useTokens();
  const { showToast } = useToast();
  const [watchlists, setWatchlists] = useState<WatchlistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editWl, setEditWl] = useState<WatchlistSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<WatchlistSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Re-runs on `dataVersion` so a display-currency change or a refresh refetches in place.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError(null);
        const data = await getWatchlists(userId);
        if (!cancelled) setWatchlists(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, dataVersion]);

  const handleCreate = async () => {
    if (!userId || !newName.trim()) return;
    const trimmed = newName.trim();
    const prev = watchlists;
    const tempId = -Date.now();
    const optimistic: WatchlistSummary = {
      id: tempId, userId, name: trimmed,
      currentDayValue: 0, previousDayValue: 0, invested: 0, gain: 0, dayChange: 0,
      xirr: null, displayCurrency: preferredCurrency,
    };
    setWatchlists(w => [...w, optimistic]);
    setCreateOpen(false); setNewName("");
    try {
      const created = await createWatchlist(userId, trimmed);
      setWatchlists(w => w.map(wl => wl.id === tempId ? { ...optimistic, ...created } : wl));
      invalidateCache("/watchlists", "/account-watchlists");
      showToast(`Watchlist "${trimmed}" created`);
    } catch (err) {
      setWatchlists(prev);
      showToast(err instanceof Error ? err.message : "Failed to create watchlist", "error");
    }
  };

  const handleUpdate = async () => {
    if (!editWl || !editName.trim()) return;
    const name = editName.trim();
    const prev = watchlists;
    setWatchlists(w => w.map(wl => wl.id === editWl.id ? { ...wl, name } : wl));
    setEditWl(null);
    try {
      await updateWatchlist(editWl.id, name);
      invalidateCache("/watchlists", "/account-watchlists");
      showToast(`Watchlist "${name}" updated`);
    } catch (err) {
      setWatchlists(prev);
      showToast(err instanceof Error ? err.message : "Failed to update watchlist", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const { id, name } = deleteConfirm;
    const prev = watchlists;
    setWatchlists(w => w.filter(wl => wl.id !== id));
    setDeleteConfirm(null);
    try {
      await deleteWatchlist(id);
      invalidateCache("/watchlists", "/account-watchlists");
      showToast(`Watchlist "${name}" deleted`);
    } catch (err) {
      setWatchlists(prev);
      showToast(err instanceof Error ? err.message : "Failed to delete watchlist", "error");
    }
  };

  // Filter and sort. Copy before sorting: the un-filtered branch hands back the state array itself.
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const matches = q ? watchlists.filter(w => w.name.toLowerCase().includes(q)) : watchlists;
    return [...matches].sort((a, b) => {
      if (a.name === "All") return -1;
      if (b.name === "All") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [watchlists, searchQuery]);

  if (error && watchlists.length === 0 && !loading) return <ErrorState message={error} onRetry={refreshAll} />;

  const isDark = theme.palette.mode === "dark";
  const cardMuted = isDark ? alpha(colors.pureWhite, 0.5) : colors.gray400;
  const cardSubtle = isDark ? alpha(colors.pureWhite, 0.08) : colors.gray100;
  const cardInvested = isDark ? "#60A5FA" : colors.brand;
  const cardSuccess = isDark ? "#34D399" : colors.success;
  const cardError = isDark ? "#F87171" : colors.error;

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
      {/* Search toolbar */}
      {!loading && watchlists.length > 0 && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
          <TextField
            size="small" placeholder="Search by name…" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, color: colors.gray400 }} /></InputAdornment> }}
            sx={{ flex: 1, maxWidth: { sm: 320 } }}
          />
        </Stack>
      )}

      {loading ? <ListSkeleton rows={3} /> : watchlists.length === 0 ? (
        <Paper>
          <EmptyState
            icon={<VisibilityOutlinedIcon />}
            title="No watchlists"
            description="Create a watchlist to group and track selected accounts together."
            action={{ label: "Add Watchlist", onClick: () => setCreateOpen(true) }}
          />
        </Paper>
      ) : filtered.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">No watchlists match "{searchQuery}"</Typography>
        </Paper>
      ) : (
        <FadeIn delay={100}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gridAutoRows: "1fr", gap: 2 }}>
            {filtered.map((w, i) => {
              const gainPct = w.invested > 0 ? (w.gain / w.invested) * 100 : 0;
              const dayPct = w.previousDayValue > 0 ? (w.dayChange / w.previousDayValue) * 100 : 0;
              const isAll = w.name === "All";
              const accentColor = isAll ? colors.brand : colors.accent;
              return (
                <FadeIn key={w.id} delay={i * 40}>
                  <Paper
                    onClick={() => navigate(`/watchlists/${w.id}`)}
                    sx={{
                      p: 2.5, cursor: "pointer",
                      borderRadius: 3,
                      borderLeft: `4px solid ${accentColor}`,
                      transition: "all 0.2s ease",
                      "&:hover": { boxShadow: shadow.hover, transform: "translateY(-2px)" },
                      height: "100%", display: "flex", flexDirection: "column",
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                      <Avatar sx={{
                        width: 36, height: 36, borderRadius: 2,
                        bgcolor: alpha(accentColor, 0.1),
                        color: accentColor,
                      }}>
                        {isAll ? <AllInclusiveRoundedIcon sx={{ fontSize: 20 }} /> : <VisibilityRoundedIcon sx={{ fontSize: 20 }} />}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 650, fontSize: "0.9rem", lineHeight: 1.3 }} noWrap>{w.name}</Typography>
                      </Box>
                      <XirrBadge value={w.xirr} size="sm" />
                      {!isAll && (
                        <Stack direction="row" spacing={0} onClick={e => e.stopPropagation()}>
                          <IconButton size="small" onClick={() => { setEditWl(w); setEditName(w.name); }} sx={{ color: colors.brand, opacity: 0.6, "&:hover": { opacity: 1, bgcolor: alpha(colors.brand, 0.08) } }}>
                            <EditOutlinedIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                          <IconButton size="small" onClick={() => setDeleteConfirm(w)} sx={{ color: colors.error, opacity: 0.6, "&:hover": { opacity: 1, bgcolor: alpha(colors.error, 0.08) } }}>
                            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Stack>
                      )}
                    </Box>

                    <Box sx={{ px: 1.5, py: 1, borderRadius: 1.5, bgcolor: cardSubtle, display: "inline-block", mb: 1.5, alignSelf: "flex-start" }}>
                      <Typography sx={{ fontSize: "0.6rem", fontWeight: 500, color: cardMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.15 }}>
                        Value
                      </Typography>
                      <Typography sx={{ fontSize: "1.25rem", fontWeight: 750, letterSpacing: "-0.02em" }}>
                        {fmt(w.currentDayValue, w.displayCurrency)}
                      </Typography>
                    </Box>

                    <Stack direction="row" sx={{ gap: { xs: 0.75, sm: 1 }, flexWrap: "wrap", mt: "auto" }}>
                      {w.invested > 0 && (
                        <Box sx={{ flex: 1, minWidth: { xs: 70, sm: 80 }, p: 1, borderRadius: 1.5, bgcolor: alpha(cardInvested, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
                          <Typography sx={{ fontSize: "0.6rem", fontWeight: 500, color: cardMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
                            Invested
                          </Typography>
                          <Typography noWrap sx={{ fontSize: "0.8rem", fontWeight: 700, color: cardInvested }}>
                            {fmt(w.invested, w.displayCurrency)}
                          </Typography>
                        </Box>
                      )}
                      {w.invested > 0 && (
                        <Box sx={{ flex: 1, minWidth: { xs: 70, sm: 80 }, p: 1, borderRadius: 1.5, bgcolor: alpha(w.gain >= 0 ? cardSuccess : cardError, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
                          <Typography sx={{ fontSize: "0.6rem", fontWeight: 500, color: cardMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
                            P&L
                          </Typography>
                          <Typography noWrap sx={{ fontSize: "0.8rem", fontWeight: 700, color: w.gain >= 0 ? cardSuccess : cardError }}>
                            {w.gain >= 0 ? "+" : ""}{fmt(w.gain, w.displayCurrency)}
                          </Typography>
                          <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, color: w.gain >= 0 ? cardSuccess : cardError, opacity: 0.8 }}>
                            {w.gain >= 0 ? "+" : ""}{gainPct.toFixed(1)}%
                          </Typography>
                        </Box>
                      )}
                      <Box sx={{ flex: 1, minWidth: { xs: 70, sm: 80 }, p: 1, borderRadius: 1.5, bgcolor: alpha(w.dayChange >= 0 ? cardSuccess : cardError, isDark ? 0.1 : 0.06), overflow: "hidden" }}>
                        <Typography sx={{ fontSize: "0.6rem", fontWeight: 500, color: cardMuted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>
                          Today
                        </Typography>
                        <Typography noWrap sx={{ fontSize: "0.8rem", fontWeight: 700, color: w.dayChange >= 0 ? cardSuccess : cardError }}>
                          {w.dayChange >= 0 ? "+" : ""}{fmt(w.dayChange, w.displayCurrency)}
                        </Typography>
                        <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, color: w.dayChange >= 0 ? cardSuccess : cardError, opacity: 0.8 }}>
                          {w.dayChange >= 0 ? "+" : ""}{dayPct.toFixed(2)}%
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>
                </FadeIn>
              );
            })}
          </Box>
        </FadeIn>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle>New Watchlist</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <TextField label="Name" value={newName} onChange={e => setNewName(e.target.value)} fullWidth autoFocus />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editWl} onClose={() => setEditWl(null)} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle>Edit Watchlist</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <TextField label="Name" value={editName} onChange={e => setEditName(e.target.value)} fullWidth autoFocus />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditWl(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdate} disabled={!editName.trim()}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Watchlist</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{deleteConfirm?.name}</strong>?</Typography>
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
          bottom: { xs: "calc(24px + env(safe-area-inset-bottom, 0px))", sm: 24 },
          right: { xs: 16, sm: 24 },
          bgcolor: colors.accent,
          color: colors.pureWhite,
          boxShadow: `0 4px 20px ${alpha(colors.accent, 0.4)}`,
          "&:hover": { bgcolor: colors.accentDark, boxShadow: `0 6px 28px ${alpha(colors.accent, 0.5)}` },
        }}>
        <AddIcon sx={isMobile ? {} : { mr: 0.5 }} />
        {!isMobile && "Add Watchlist"}
      </Fab>
    </Stack>
  );
}

export default Watchlists;
