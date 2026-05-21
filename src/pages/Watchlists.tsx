import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, TextField, Button,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, IconButton, Fab, Avatar,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
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
import { EmptyState, ErrorState, ListSkeleton, TintedChip, FadeIn } from "../components/shared";
import { tokens } from "../theme";
import type { WatchlistSummary } from "../api/types";

const { colors, shadow } = tokens;

function fmt(v: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
}

function Watchlists() {
  const { userId } = useUser();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [watchlists, setWatchlists] = useState<WatchlistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editWl, setEditWl] = useState<WatchlistSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<WatchlistSummary | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try { setLoading(true); setError(null); setWatchlists(await getWatchlists(userId)); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!userId || !newName.trim()) return;
    try {
      setSaving(true);
      await createWatchlist(userId, newName.trim());
      setCreateOpen(false); setNewName("");
      invalidateCache("watchlists"); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to create"); }
    finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    if (!editWl || !editName.trim()) return;
    try {
      setSaving(true);
      await updateWatchlist(editWl.id, editName.trim());
      setEditWl(null); invalidateCache("watchlists"); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to update"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try { await deleteWatchlist(deleteConfirm.id); setDeleteConfirm(null); invalidateCache("watchlists"); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to delete"); }
  };

  if (error && watchlists.length === 0 && !loading) return <ErrorState message={error} onRetry={load} />;

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {loading ? <ListSkeleton rows={3} /> : watchlists.length === 0 ? (
        <Paper>
          <EmptyState
            icon={<VisibilityOutlinedIcon />}
            title="No watchlists"
            description="Create a watchlist to group and track selected accounts together."
            action={{ label: "Add Watchlist", onClick: () => setCreateOpen(true) }}
          />
        </Paper>
      ) : (
        <FadeIn delay={100}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            {watchlists.map((w, i) => {
              const gain = w.currentDayValue - w.invested;
              const gainPct = w.invested > 0 ? (gain / w.invested) * 100 : 0;
              const isAll = w.name === "All";
              return (
                <FadeIn key={w.id} delay={i * 40}>
                  <Paper
                    onClick={() => navigate(`/watchlists/${w.id}`)}
                    sx={{
                      p: 2.5, cursor: "pointer",
                      borderRadius: 3,
                      borderLeft: `4px solid ${isAll ? colors.brand : colors.accent}`,
                      transition: "all 0.2s ease",
                      "&:hover": { boxShadow: shadow.hover, transform: "translateY(-2px)" },
                      position: "relative",
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, mb: 2 }}>
                      <Avatar sx={{
                        width: 36, height: 36,
                        bgcolor: alpha(isAll ? colors.brand : colors.accent, 0.1),
                        color: isAll ? colors.brand : colors.accent,
                      }}>
                        {isAll ? <AllInclusiveRoundedIcon sx={{ fontSize: 20 }} /> : <VisibilityRoundedIcon sx={{ fontSize: 20 }} />}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 650, fontSize: "0.9rem", lineHeight: 1.3 }} noWrap>{w.name}</Typography>
                        <Typography variant="caption" sx={{ color: colors.gray400 }}>
                          {isAll ? "All accounts" : "Custom watchlist"}
                        </Typography>
                      </Box>
                      {!isAll && (
                        <Stack direction="row" spacing={0} onClick={e => e.stopPropagation()}>
                          <IconButton size="small" onClick={() => { setEditWl(w); setEditName(w.name); }} sx={{ color: colors.gray400 }}>
                            <EditOutlinedIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                          <IconButton size="small" onClick={() => setDeleteConfirm(w)} sx={{ color: colors.gray400 }}>
                            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Stack>
                      )}
                    </Box>

                    <Typography sx={{ fontSize: "1.35rem", fontWeight: 750, letterSpacing: "-0.02em", mb: 0.5 }}>
                      {fmt(w.currentDayValue)}
                    </Typography>
                    <TintedChip
                      label={`${gain >= 0 ? "+" : ""}${gainPct.toFixed(1)}% · ${gain >= 0 ? "+" : ""}${fmt(gain)}`}
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
        <DialogTitle>New Watchlist</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <TextField label="Name" value={newName} onChange={e => setNewName(e.target.value)} fullWidth autoFocus />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !newName.trim()}>Create</Button>
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
          <Button variant="contained" onClick={handleUpdate} disabled={saving || !editName.trim()}>Save</Button>
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
          bottom: { xs: 80, sm: 24 },
          right: { xs: 16, sm: 24 },
          background: "linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)",
          color: colors.white,
          boxShadow: `0 4px 20px ${alpha(colors.accent, 0.4)}`,
          "&:hover": { background: "linear-gradient(135deg, #6D28D9 0%, #7C3AED 100%)", boxShadow: `0 6px 28px ${alpha(colors.accent, 0.5)}` },
        }}>
        <AddIcon sx={isMobile ? {} : { mr: 0.5 }} />
        {!isMobile && "Add Watchlist"}
      </Fab>
    </Stack>
  );
}

export default Watchlists;
