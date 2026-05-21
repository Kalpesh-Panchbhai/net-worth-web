import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Box, Paper, Typography, Alert,
  ToggleButtonGroup, ToggleButton, Fab, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, MenuItem, Stack, Grid2 as Grid, LinearProgress,
  useMediaQuery, useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import { useUser } from "../context/UserContext";
import {
  getIncomes, getIncomeSources, getIncomeTags,
  createIncome, updateIncome, deleteIncome,
} from "../api/client";
import { MetricCard, MetricSkeleton, ListSkeleton, EmptyState, ErrorState, TintedChip, FadeIn } from "../components/shared";
import { tokens } from "../theme";
import type { Income, IncomeSource, IncomeTag } from "../api/types";

type Grouping = "month" | "source" | "tag" | "year";
const { colors } = tokens;

function fmt(v: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
}
function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function monthKey(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
function yearKey(d: string): string { return d.slice(0, 4); }

function Incomes() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { userId } = useUser();
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [tags, setTags] = useState<IncomeTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<Grouping>("month");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editIncome, setEditIncome] = useState<Income | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Income | null>(null);

  const [formSourceId, setFormSourceId] = useState<number | "">("");
  const [formTagId, setFormTagId] = useState<number | "">("");
  const [formNet, setFormNet] = useState("");
  const [formTax, setFormTax] = useState("");
  const [formCurrency, setFormCurrency] = useState("INR");
  const [formDate, setFormDate] = useState("");
  const [saving, setSaving] = useState(false);

  const sourceLookup = useMemo(() => new Map(sources.map((s) => [s.id, s.name])), [sources]);
  const tagLookup = useMemo(() => new Map(tags.map((t) => [t.id, t.name])), [tags]);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true); setError(null);
      const [inc, src, tg] = await Promise.all([getIncomes(userId), getIncomeSources(userId), getIncomeTags(userId)]);
      setIncomes(inc.sort((a, b) => b.creditedDate.localeCompare(a.creditedDate)));
      setSources(src); setTags(tg);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const sections = useMemo(() => {
    const groups = new Map<string, Income[]>();
    for (const inc of incomes) {
      let key: string;
      switch (grouping) {
        case "month": key = monthKey(inc.creditedDate); break;
        case "year": key = yearKey(inc.creditedDate); break;
        case "source": key = sourceLookup.get(inc.incomeSourceId) ?? "Unknown"; break;
        case "tag": key = tagLookup.get(inc.incomeTagId) ?? "Unknown"; break;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(inc);
    }
    return Array.from(groups.entries()).map(([title, items]) => ({ title, items }));
  }, [incomes, grouping, sourceLookup, tagLookup]);

  const totalAll = useMemo(() => incomes.reduce((s, i) => s + i.netAmount + i.taxPaid, 0), [incomes]);
  const totalNet = useMemo(() => incomes.reduce((s, i) => s + i.netAmount, 0), [incomes]);
  const totalTax = useMemo(() => incomes.reduce((s, i) => s + i.taxPaid, 0), [incomes]);
  const netPct = totalAll > 0 ? (totalNet / totalAll) * 100 : 0;
  const taxPct = totalAll > 0 ? (totalTax / totalAll) * 100 : 0;

  const openCreate = () => {
    setEditIncome(null);
    setFormSourceId(sources.find((s) => s.isDefault)?.id ?? "");
    setFormTagId(tags.find((t) => t.isDefault)?.id ?? "");
    setFormNet(""); setFormTax(""); setFormCurrency("INR");
    setFormDate(new Date().toISOString().slice(0, 10));
    setDialogOpen(true);
  };

  const openEdit = (income: Income) => {
    setEditIncome(income);
    setFormSourceId(income.incomeSourceId); setFormTagId(income.incomeTagId);
    setFormNet(String(income.netAmount)); setFormTax(String(income.taxPaid));
    setFormCurrency(income.currency); setFormDate(income.creditedDate);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!userId || formSourceId === "" || formTagId === "" || !formNet || !formDate) return;
    try {
      setSaving(true);
      const payload = {
        incomeSourceId: formSourceId as number, incomeTagId: formTagId as number,
        netAmount: parseFloat(formNet), taxPaid: formTax ? parseFloat(formTax) : 0,
        currency: formCurrency, creditedDate: formDate,
      };
      if (editIncome) await updateIncome(editIncome.id, payload);
      else await createIncome({ userId, ...payload });
      setDialogOpen(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try { await deleteIncome(deleteConfirm.id); setDeleteConfirm(null); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to delete"); }
  };

  if (error && incomes.length === 0 && !loading) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <Stack spacing={{ xs: 2, sm: 3 }} sx={{ pb: 10 }}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* Summary metrics */}
      <Grid container spacing={{ xs: 1.5, sm: 2 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          {loading ? <MetricSkeleton /> : (
            <FadeIn>
              <MetricCard label="Total Income" value={fmt(totalAll)}
                footer={<Typography variant="caption" color="text.secondary">{incomes.length} transaction{incomes.length !== 1 ? "s" : ""}</Typography>} />
            </FadeIn>
          )}
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          {loading ? <MetricSkeleton /> : (
            <FadeIn delay={50}>
              <MetricCard label="Net Income" value={fmt(totalNet)} accent={colors.success}
                footer={
                  <Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">Take-home</Typography>
                      <Typography variant="caption" fontWeight={600}>{netPct.toFixed(1)}%</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={netPct} color="success" />
                  </Box>
                } />
            </FadeIn>
          )}
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          {loading ? <MetricSkeleton /> : (
            <FadeIn delay={100}>
              <MetricCard label="Tax Paid" value={fmt(totalTax)} accent={colors.error}
                footer={
                  <Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">Tax rate</Typography>
                      <Typography variant="caption" fontWeight={600}>{taxPct.toFixed(1)}%</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={taxPct} color="error" />
                  </Box>
                } />
            </FadeIn>
          )}
        </Grid>
      </Grid>

      {/* Group-by controls */}
      {!loading && (
        <Box>
          <ToggleButtonGroup value={grouping} exclusive
            onChange={(_e, val) => val && setGrouping(val)} size="small">
            <ToggleButton value="month">Month</ToggleButton>
            <ToggleButton value="source">Source</ToggleButton>
            <ToggleButton value="tag">Tag</ToggleButton>
            <ToggleButton value="year">Year</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      {/* Income sections */}
      {loading ? <ListSkeleton rows={6} /> : sections.length === 0 ? (
        <Paper>
          <EmptyState
            icon={<ReceiptLongOutlinedIcon />}
            title="No income records"
            description="Start tracking your income by adding your first record."
            action={{ label: "Add Income", onClick: openCreate }}
          />
        </Paper>
      ) : (
        sections.map((section) => {
          const sNet = section.items.reduce((s, i) => s + i.netAmount, 0);
          const sTax = section.items.reduce((s, i) => s + i.taxPaid, 0);
          return (
            <FadeIn key={section.title}>
              <Paper>
                {/* Section header */}
                <Box sx={{
                  px: { xs: 2, sm: 3 }, py: 2,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  borderBottom: 1, borderColor: "divider", gap: 1,
                }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" noWrap>{section.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {section.items.length} item{section.items.length !== 1 ? "s" : ""}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                    <Typography variant="subtitle2">{fmt(sNet + sTax)}</Typography>
                    <Box sx={{ display: "flex", gap: 0.5, justifyContent: "flex-end", mt: 0.5 }}>
                      <TintedChip label={`Net ${fmt(sNet)}`} color={colors.success} />
                      {sTax > 0 && <TintedChip label={`Tax ${fmt(sTax)}`} color={colors.error} />}
                    </Box>
                  </Box>
                </Box>

                {/* Rows */}
                {section.items.map((income, i) => (
                  <Box
                    key={income.id}
                    sx={{
                      px: { xs: 2, sm: 3 }, py: 1.5,
                      borderBottom: i < section.items.length - 1 ? 1 : 0, borderColor: "divider",
                      display: "flex", alignItems: "center", gap: 1,
                      transition: "background-color 0.15s ease",
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={500} noWrap>
                        {tagLookup.get(income.incomeTagId) ?? "—"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap component="p">
                        {sourceLookup.get(income.incomeSourceId) ?? "—"} · {fmtDate(income.creditedDate)}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {fmt(income.netAmount + income.taxPaid, income.currency)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Net {fmt(income.netAmount, income.currency)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", flexShrink: 0, ml: { xs: 0, sm: 0.5 } }}>
                      <IconButton size="small" onClick={() => openEdit(income)} aria-label="Edit"
                        sx={{ color: "text.disabled", "&:hover": { color: "primary.main" } }}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => setDeleteConfirm(income)} aria-label="Delete"
                        sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                ))}
              </Paper>
            </FadeIn>
          );
        })
      )}

      {/* FAB */}
      <Fab color="primary" onClick={openCreate}
        variant={isMobile ? "circular" : "extended"}
        sx={{
          position: "fixed",
          bottom: { xs: 80, sm: 24 },
          right: { xs: 16, sm: 24 },
        }}>
        <AddIcon sx={isMobile ? {} : { mr: 0.5 }} />
        {!isMobile && "Add Income"}
      </Fab>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>{editIncome ? "Edit income" : "New income"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: "16px !important" }}>
          <TextField select label="Source" value={formSourceId}
            onChange={(e) => setFormSourceId(Number(e.target.value))} fullWidth>
            {sources.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
          </TextField>
          <TextField select label="Tag" value={formTagId}
            onChange={(e) => setFormTagId(Number(e.target.value))} fullWidth>
            {tags.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
          <Grid container spacing={2}>
            <Grid size={6}>
              <TextField label="Net amount" type="number" value={formNet}
                onChange={(e) => setFormNet(e.target.value)} fullWidth
                inputProps={{ inputMode: "decimal" }} />
            </Grid>
            <Grid size={6}>
              <TextField label="Tax paid" type="number" value={formTax}
                onChange={(e) => setFormTax(e.target.value)} fullWidth
                inputProps={{ inputMode: "decimal" }} />
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid size={5}>
              <TextField select label="Currency" value={formCurrency}
                onChange={(e) => setFormCurrency(e.target.value)} fullWidth>
                {["INR", "USD", "EUR", "GBP", "CAD", "AUD", "SGD", "JPY"].map((c) => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={7}>
              <TextField label="Date" type="date" value={formDate}
                onChange={(e) => setFormDate(e.target.value)} fullWidth
                slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained"
            disabled={saving || formSourceId === "" || formTagId === "" || !formNet || !formDate}>
            {saving ? "Saving…" : editIncome ? "Update" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete income?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will permanently remove this income record. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default Incomes;
