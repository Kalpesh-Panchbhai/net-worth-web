import { useEffect, useState, useCallback } from "react";
import {
  Box, Paper, Typography, TextField, Button, Fab,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControlLabel, Switch, Stack, Avatar, IconButton,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import AddIcon from "@mui/icons-material/Add";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import LocalOfferRoundedIcon from "@mui/icons-material/LocalOfferRounded";
import { useUser } from "../context/UserContext";
import { getIncomeTags, createIncomeTag, setDefaultIncomeTag, invalidateCache } from "../api/client";
import { EmptyState, ErrorState, ListSkeleton, TintedChip, FadeIn } from "../components/shared";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import type { IncomeTag } from "../api/types";

function IncomeTags() {
  const { userId } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, shadow, gradients, accentPalette } = useTokens();
  const { showToast } = useToast();
  const [tags, setTags] = useState<IncomeTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDefault, setNewDefault] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try { setLoading(true); setError(null); setTags(await getIncomeTags(userId)); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!userId || !newName.trim()) return;
    const trimmed = newName.trim();
    const isDefault = newDefault;
    const prev = tags;
    const tempId = -Date.now();
    const optimistic = { id: tempId, userId, name: trimmed, isDefault };
    setTags(t => isDefault ? [...t.map(tag => ({ ...tag, isDefault: false })), optimistic] : [...t, optimistic]);
    setDialogOpen(false); setNewName(""); setNewDefault(false);
    try {
      const created = await createIncomeTag(userId, trimmed, isDefault);
      setTags(t => t.map(tag => tag.id === tempId ? created : tag));
      invalidateCache("income-tags");
      showToast(`Tag "${trimmed}" created`);
    } catch (err) {
      setTags(prev);
      showToast(err instanceof Error ? err.message : "Failed to create tag", "error");
    }
  };

  const handleSetDefault = async (id: number, name: string) => {
    const prev = tags;
    setTags(t => t.map(tag => ({ ...tag, isDefault: tag.id === id })));
    try {
      await setDefaultIncomeTag(id);
      invalidateCache("income-tags");
      showToast(`"${name}" set as default tag`);
    } catch (err) {
      setTags(prev);
      showToast(err instanceof Error ? err.message : "Failed to set default", "error");
    }
  };

  if (error && tags.length === 0 && !loading) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
      {/* ── Hero Card ── */}
      {!loading && (
        <FadeIn>
          <Paper sx={{
            p: { xs: 3, sm: 4 }, borderRadius: 4, border: "none",
            background: gradients.accentCard,
            color: colors.pureWhite, position: "relative", overflow: "hidden",
            boxShadow: `0 8px 32px ${alpha(colors.accent, 0.3)}`,
          }}>
            <Box sx={{ position: "absolute", top: -50, right: -50, width: 180, height: 180, borderRadius: "50%", bgcolor: alpha(colors.pureWhite, 0.06) }} />
            <Box sx={{ position: "absolute", bottom: -30, right: 80, width: 100, height: 100, borderRadius: "50%", bgcolor: alpha(colors.pureWhite, 0.04) }} />
            <Box sx={{ position: "relative", zIndex: 1 }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(colors.pureWhite, 0.2), color: colors.pureWhite, borderRadius: 2 }}>
                  <LocalOfferRoundedIcon sx={{ fontSize: 20 }} />
                </Avatar>
                <Typography sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" }, fontWeight: 700, opacity: 0.95 }}>Income Tags</Typography>
              </Stack>
              <Typography sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem" }, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, mt: 1 }}>
                {tags.length}
              </Typography>
              <Typography sx={{ fontSize: "0.78rem", fontWeight: 600, opacity: 0.65, mt: 0.5 }}>
                tag{tags.length !== 1 ? "s" : ""} configured
              </Typography>
            </Box>
          </Paper>
        </FadeIn>
      )}

      {loading ? <ListSkeleton rows={4} /> : tags.length === 0 ? (
        <Paper>
          <EmptyState
            icon={<LocalOfferOutlinedIcon />}
            title="No income tags"
            description="Create your first tag to label and organize your income records."
            action={{ label: "Add Tag", onClick: () => setDialogOpen(true) }}
          />
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {tags.map((tag, i) => {
            const accent = accentPalette[i % accentPalette.length];
            return (
              <FadeIn key={tag.id} delay={i * 40}>
                <Paper sx={{
                  p: 2.5, borderRadius: 3,
                  borderLeft: `4px solid ${accent}`,
                  transition: "all 0.2s ease",
                  "&:hover": { boxShadow: shadow.hover, transform: "translateY(-2px)" },
                }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar sx={{ width: 40, height: 40, fontSize: "0.85rem", fontWeight: 700, bgcolor: alpha(accent, 0.1), color: accent, borderRadius: 2 }}>
                      {tag.name.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 650, fontSize: "0.95rem" }} noWrap>{tag.name}</Typography>
                      {tag.isDefault ? (
                        <TintedChip label="Default" color={colors.brand} icon={<CheckCircleRoundedIcon />} size="small" />
                      ) : (
                        <IconButton onClick={() => handleSetDefault(tag.id, tag.name)} size="small" sx={{ color: colors.gray400, "&:hover": { color: colors.accent }, ml: -0.5 }}>
                          <RadioButtonUncheckedIcon sx={{ fontSize: 16 }} />
                          <Typography variant="caption" sx={{ ml: 0.5, color: colors.gray400 }}>Set default</Typography>
                        </IconButton>
                      )}
                    </Box>
                  </Stack>
                </Paper>
              </FadeIn>
            );
          })}
        </Stack>
      )}

      {/* FAB */}
      <Fab onClick={() => setDialogOpen(true)}
        variant={isMobile ? "circular" : "extended"}
        sx={{
          position: "fixed",
          bottom: 24,
          right: { xs: 16, sm: 24 },
          bgcolor: colors.accent,
          color: colors.pureWhite,
          boxShadow: `0 4px 20px ${alpha(colors.accent, 0.4)}`,
          "&:hover": { bgcolor: colors.accentDark, boxShadow: `0 6px 28px ${alpha(colors.accent, 0.5)}` },
        }}>
        <AddIcon sx={isMobile ? {} : { mr: 0.5 }} />
        {!isMobile && "Add Tag"}
      </Fab>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>New income tag</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: "16px !important" }}>
          <TextField autoFocus label="Tag name" placeholder="e.g. Bonus, Dividend" fullWidth
            value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            inputProps={{ autoComplete: "off" }} />
          <FormControlLabel
            control={<Switch checked={newDefault} onChange={(e) => setNewDefault(e.target.checked)} />}
            label="Set as default" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} variant="contained" disabled={!newName.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default IncomeTags;
