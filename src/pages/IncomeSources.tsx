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
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import { useUser } from "../context/UserContext";
import { getIncomeSources, createIncomeSource, setDefaultIncomeSource, invalidateCache } from "../api/client";
import { EmptyState, ErrorState, ListSkeleton, TintedChip, FadeIn } from "../components/shared";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import type { IncomeSource } from "../api/types";

function IncomeSources() {
  const { userId } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, shadow, gradients, accentPalette } = useTokens();
  const { showToast } = useToast();
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDefault, setNewDefault] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try { setLoading(true); setError(null); setSources(await getIncomeSources(userId)); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!userId || !newName.trim()) return;
    const trimmed = newName.trim();
    const isDefault = newDefault;
    const prev = sources;
    const tempId = -Date.now();
    const optimistic = { id: tempId, userId, name: trimmed, isDefault };
    setSources(s => isDefault ? [...s.map(src => ({ ...src, isDefault: false })), optimistic] : [...s, optimistic]);
    setDialogOpen(false); setNewName(""); setNewDefault(false);
    try {
      const created = await createIncomeSource(userId, trimmed, isDefault);
      setSources(s => s.map(src => src.id === tempId ? created : src));
      invalidateCache("/income-sources");
      showToast(`Source "${trimmed}" created`);
    } catch (err) {
      setSources(prev);
      showToast(err instanceof Error ? err.message : "Failed to create source", "error");
    }
  };

  const handleSetDefault = async (id: number, name: string) => {
    const prev = sources;
    setSources(s => s.map(src => ({ ...src, isDefault: src.id === id })));
    try {
      await setDefaultIncomeSource(id);
      invalidateCache("/income-sources");
      showToast(`"${name}" set as default source`);
    } catch (err) {
      setSources(prev);
      showToast(err instanceof Error ? err.message : "Failed to set default", "error");
    }
  };

  if (error && sources.length === 0 && !loading) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
      {/* ── Hero Card ── */}
      {!loading && (
        <FadeIn>
          <Paper sx={{
            p: { xs: 2.5, sm: 4 }, borderRadius: 4, border: "none",
            background: gradients.hero,
            color: colors.pureWhite, position: "relative", overflow: "hidden",
            boxShadow: `0 8px 32px ${alpha(colors.brand, 0.3)}`,
          }}>
            <Box sx={{ position: "absolute", top: -50, right: -50, width: 180, height: 180, borderRadius: "50%", bgcolor: alpha(colors.pureWhite, 0.06) }} />
            <Box sx={{ position: "absolute", bottom: -30, right: 80, width: 100, height: 100, borderRadius: "50%", bgcolor: alpha(colors.pureWhite, 0.04) }} />
            <Box sx={{ position: "relative", zIndex: 1 }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(colors.pureWhite, 0.2), color: colors.pureWhite, borderRadius: 2 }}>
                  <AccountBalanceRoundedIcon sx={{ fontSize: 20 }} />
                </Avatar>
                <Typography sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" }, fontWeight: 700, opacity: 0.95 }}>Income Sources</Typography>
              </Stack>
              <Typography sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem" }, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, mt: 1 }}>
                {sources.length}
              </Typography>
              <Typography sx={{ fontSize: "0.78rem", fontWeight: 600, opacity: 0.65, mt: 0.5 }}>
                source{sources.length !== 1 ? "s" : ""} configured
              </Typography>
            </Box>
          </Paper>
        </FadeIn>
      )}

      {loading ? <ListSkeleton rows={4} /> : sources.length === 0 ? (
        <Paper>
          <EmptyState
            icon={<AccountBalanceOutlinedIcon />}
            title="No income sources"
            description="Create your first income source to categorize where your money comes from."
            action={{ label: "Add Source", onClick: () => setDialogOpen(true) }}
          />
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {sources.map((source, i) => {
            const accent = accentPalette[i % accentPalette.length];
            return (
              <FadeIn key={source.id} delay={i * 40}>
                <Paper sx={{
                  p: 2.5, borderRadius: 3,
                  borderLeft: `4px solid ${accent}`,
                  transition: "all 0.2s ease",
                  "&:hover": { boxShadow: shadow.hover, transform: "translateY(-2px)" },
                }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar sx={{ width: 40, height: 40, fontSize: "0.85rem", fontWeight: 700, bgcolor: alpha(accent, 0.1), color: accent, borderRadius: 2 }}>
                      {source.name.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 650, fontSize: "0.95rem" }} noWrap>{source.name}</Typography>
                      {source.isDefault ? (
                        <TintedChip label="Default" color={colors.brand} icon={<CheckCircleRoundedIcon />} size="small" />
                      ) : (
                        <IconButton onClick={() => handleSetDefault(source.id, source.name)} size="small" sx={{ color: colors.gray400, "&:hover": { color: colors.brand }, ml: -0.5 }}>
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
          bottom: { xs: "calc(24px + env(safe-area-inset-bottom, 0px))", sm: 24 },
          right: { xs: 16, sm: 24 },
          bgcolor: colors.brand,
          color: colors.pureWhite,
          boxShadow: `0 4px 20px ${alpha(colors.brand, 0.4)}`,
          "&:hover": { bgcolor: colors.brandDark, boxShadow: `0 6px 28px ${alpha(colors.brand, 0.5)}` },
        }}>
        <AddIcon sx={isMobile ? {} : { mr: 0.5 }} />
        {!isMobile && "Add Source"}
      </Fab>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>New income source</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: "16px !important" }}>
          <TextField autoFocus label="Source name" placeholder="e.g. Salary, Freelance" fullWidth
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

export default IncomeSources;
