import { useEffect, useState, useCallback } from "react";
import {
  Box, Paper, Typography, TextField, Button,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, IconButton, Fab, Checkbox, List, ListItem, ListItemButton, ListItemText, ListItemIcon,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import LinkIcon from "@mui/icons-material/Link";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { useUser } from "../context/UserContext";
import {
  getWatchlists, createWatchlist, updateWatchlist, deleteWatchlist,
  getWatchlistAccounts, getAccounts, linkWatchlistAccount, unlinkWatchlistAccount,
  invalidateCache,
} from "../api/client";
import { PageHeader, EmptyState, ErrorState, ListSkeleton, MetricCard, MetricSkeleton, TintedChip, FadeIn } from "../components/shared";
import { tokens } from "../theme";
import type { WatchlistSummary, AccountSummary } from "../api/types";

const { colors } = tokens;

function fmt(v: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
}

function Watchlists() {
  const { userId } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [watchlists, setWatchlists] = useState<WatchlistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit name
  const [editWl, setEditWl] = useState<WatchlistSummary | null>(null);
  const [editName, setEditName] = useState("");

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState<WatchlistSummary | null>(null);

  // Link/Unlink accounts
  const [linkWl, setLinkWl] = useState<WatchlistSummary | null>(null);
  const [allAccounts, setAllAccounts] = useState<AccountSummary[]>([]);
  const [linkedAccountIds, setLinkedAccountIds] = useState<Set<number>>(new Set());
  const [linkLoading, setLinkLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try { setLoading(true); setError(null); setWatchlists(await getWatchlists(userId)); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const totalValue = watchlists.reduce((s, w) => s + w.currentDayValue, 0);
  const totalInvested = watchlists.reduce((s, w) => s + w.invested, 0);

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
      setEditWl(null);
      invalidateCache("watchlists"); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to update"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try { await deleteWatchlist(deleteConfirm.id); setDeleteConfirm(null); invalidateCache("watchlists"); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to delete"); }
  };

  const openLink = async (wl: WatchlistSummary) => {
    if (!userId) return;
    setLinkWl(wl); setLinkLoading(true);
    try {
      const [accs, linked] = await Promise.all([getAccounts(userId), getWatchlistAccounts(wl.id)]);
      setAllAccounts(accs);
      setLinkedAccountIds(new Set(linked.map(a => a.id)));
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load accounts"); }
    finally { setLinkLoading(false); }
  };

  const toggleAccount = async (accountId: number) => {
    if (!linkWl) return;
    const isLinked = linkedAccountIds.has(accountId);
    try {
      if (isLinked) {
        await unlinkWatchlistAccount(linkWl.id, accountId);
        setLinkedAccountIds(prev => { const n = new Set(prev); n.delete(accountId); return n; });
      } else {
        await linkWatchlistAccount(linkWl.id, accountId);
        setLinkedAccountIds(prev => new Set(prev).add(accountId));
      }
      invalidateCache("watchlist"); invalidateCache("account-watchlist");
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to update link"); }
  };

  if (error && watchlists.length === 0 && !loading) return <ErrorState message={error} onRetry={load} />;

  return (
    <Stack spacing={{ xs: 2, sm: 3 }}>
      <PageHeader
        title="Watchlists"
        action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>Add Watchlist</Button>}
      />

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* Summary */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr 1fr" }, gap: 2 }}>
        {loading ? <><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></> : (
          <FadeIn>
            <MetricCard label="Total Value" value={fmt(totalValue)} />
            <MetricCard label="Invested" value={fmt(totalInvested)} />
            <MetricCard label="Watchlists" value={String(watchlists.length)} />
          </FadeIn>
        )}
      </Box>

      {loading ? <ListSkeleton rows={4} /> : watchlists.length === 0 ? (
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
          <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
            {watchlists.map((w, i) => {
              const gain = w.currentDayValue - w.invested;
              const gainPct = w.invested > 0 ? (gain / w.invested) * 100 : 0;
              return (
                <Box key={w.id} sx={{
                  display: "flex", alignItems: "center", gap: 2,
                  px: { xs: 2, sm: 3 }, py: 1.5,
                  borderTop: i > 0 ? `1px solid ${theme.palette.divider}` : "none",
                  transition: "background .15s", "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                  flexWrap: "wrap",
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>{w.name}</Typography>
                  </Box>
                  <Box sx={{ textAlign: "right", minWidth: 120 }}>
                    <Typography variant="subtitle2">{fmt(w.currentDayValue)}</Typography>
                    <TintedChip
                      label={`${gain >= 0 ? "+" : ""}${gainPct.toFixed(1)}%`}
                      color={gain >= 0 ? colors.success : colors.error}
                      size="small"
                    />
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    <IconButton size="small" onClick={() => openLink(w)} aria-label={`Link accounts to ${w.name}`}>
                      <LinkIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => { setEditWl(w); setEditName(w.name); }} aria-label={`Edit ${w.name}`}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => setDeleteConfirm(w)} aria-label={`Delete ${w.name}`}>
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

      {/* Link Accounts Dialog */}
      <Dialog open={!!linkWl} onClose={() => { setLinkWl(null); invalidateCache("watchlists"); load(); }} fullScreen={isMobile} fullWidth maxWidth="sm">
        <DialogTitle>Link Accounts to {linkWl?.name}</DialogTitle>
        <DialogContent>
          {linkLoading ? <ListSkeleton rows={3} /> : allAccounts.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>No accounts available. Create an account first.</Typography>
          ) : (
            <List dense>
              {allAccounts.map(a => (
                <ListItem key={a.id} disablePadding>
                  <ListItemButton onClick={() => toggleAccount(a.id)}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox edge="start" checked={linkedAccountIds.has(a.id)} tabIndex={-1} disableRipple />
                    </ListItemIcon>
                    <ListItemText primary={a.name} secondary={`${a.type} · ${a.currency}`} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => { setLinkWl(null); invalidateCache("watchlists"); load(); }}>Done</Button>
        </DialogActions>
      </Dialog>

      {isMobile && (
        <Fab color="primary" onClick={() => setCreateOpen(true)} sx={{ position: "fixed", bottom: 80, right: 20 }} aria-label="Add watchlist">
          <AddIcon />
        </Fab>
      )}
    </Stack>
  );
}

export default Watchlists;
