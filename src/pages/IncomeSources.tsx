import { useEffect, useState, useCallback } from "react";
import {
  Box, Paper, Typography, TextField, Button,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControlLabel, Switch, Stack, Avatar, IconButton,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import AddIcon from "@mui/icons-material/Add";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import { useUser } from "../context/UserContext";
import { getIncomeSources, createIncomeSource, setDefaultIncomeSource } from "../api/client";
import { PageHeader, EmptyState, ErrorState, ListSkeleton, TintedChip, FadeIn } from "../components/shared";
import { tokens } from "../theme";
import type { IncomeSource } from "../api/types";

const { colors } = tokens;

function IncomeSources() {
  const { userId } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDefault, setNewDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try { setLoading(true); setError(null); setSources(await getIncomeSources(userId)); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!userId || !newName.trim()) return;
    try {
      setSaving(true);
      await createIncomeSource(userId, newName.trim(), newDefault);
      setDialogOpen(false); setNewName(""); setNewDefault(false);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to create"); }
    finally { setSaving(false); }
  };

  const handleSetDefault = async (id: number) => {
    try { await setDefaultIncomeSource(id); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to set default"); }
  };

  if (error && sources.length === 0 && !loading) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <Stack spacing={{ xs: 2, sm: 3 }}>
      <PageHeader
        title="Income Sources"
        action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>Add Source</Button>}
      />

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

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
        <FadeIn>
          <Paper>
            {sources.map((source, i) => (
              <Box
                key={source.id}
                sx={{
                  display: "flex", alignItems: "center", gap: 1.5,
                  px: { xs: 2, sm: 3 }, py: 1.5,
                  borderBottom: i < sources.length - 1 ? 1 : 0, borderColor: "divider",
                  transition: "background-color 0.15s ease",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Avatar sx={{
                  width: 36, height: 36, fontSize: 14, fontWeight: 700,
                  bgcolor: alpha(colors.brand, 0.08), color: colors.brand,
                }}>
                  {source.name.charAt(0).toUpperCase()}
                </Avatar>
                <Typography variant="body1" sx={{ flex: 1, fontWeight: 500 }} noWrap>
                  {source.name}
                </Typography>
                {source.isDefault ? (
                  <TintedChip label="Default" color={colors.brand} icon={<CheckCircleIcon />} />
                ) : (
                  <IconButton onClick={() => handleSetDefault(source.id)} size="small"
                    aria-label={`Set ${source.name} as default`}
                    sx={{ color: "text.disabled", "&:hover": { color: "primary.main" } }}>
                    <RadioButtonUncheckedIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            ))}
          </Paper>
        </FadeIn>
      )}

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
          <Button onClick={handleCreate} variant="contained" disabled={saving || !newName.trim()}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default IncomeSources;
