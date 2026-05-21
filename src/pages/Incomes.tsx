import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Box, Paper, Typography, Alert,
  ToggleButtonGroup, ToggleButton, Fab, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, MenuItem, Stack, Grid2 as Grid,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import { useUser } from "../context/UserContext";
import {
  getIncomes, getIncomeSources, getIncomeTags,
  createIncome, updateIncome, deleteIncome, invalidateCache,
} from "../api/client";
import { ListSkeleton, EmptyState, ErrorState, TintedChip, FadeIn } from "../components/shared";
import { tokens } from "../theme";
import type { Income, IncomeSource, IncomeTag } from "../api/types";

type Grouping = "month" | "source" | "tag" | "year";
const { colors, shadow } = tokens;

function fmt(v: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
}
function parseCreditDate(d: string) {
  const dt = new Date(d + "T00:00:00");
  return {
    day: dt.getDate(),
    month: dt.toLocaleDateString("en-IN", { month: "short" }),
    full: dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
  };
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
      setDialogOpen(false); invalidateCache("incomes"); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try { await deleteIncome(deleteConfirm.id); setDeleteConfirm(null); invalidateCache("incomes"); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to delete"); }
  };

  if (error && incomes.length === 0 && !loading) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }} sx={{ pb: 10 }}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* ── Hero Card ── */}
      {!loading && (
        <FadeIn>
          <Paper sx={{
            p: { xs: 3, sm: 4 }, borderRadius: 4, border: "none",
            background: "linear-gradient(135deg, #059669 0%, #10B981 100%)",
            color: colors.white, position: "relative", overflow: "hidden",
            boxShadow: `0 8px 32px ${alpha("#059669", 0.3)}`,
          }}>
            <Box sx={{ position: "absolute", top: -50, right: -50, width: 180, height: 180, borderRadius: "50%", bgcolor: alpha(colors.white, 0.06) }} />
            <Box sx={{ position: "absolute", bottom: -30, right: 80, width: 100, height: 100, borderRadius: "50%", bgcolor: alpha(colors.white, 0.04) }} />

            <Box sx={{ position: "relative", zIndex: 1 }}>
              <Typography sx={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.75, mb: 0.5 }}>
                Total Income · {incomes.length} records
              </Typography>
              <Typography sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem" }, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                {fmt(totalAll)}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1.5} sx={{ mt: 2, position: "relative", zIndex: 1 }} flexWrap="wrap" useFlexGap>
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.5, borderRadius: 2, bgcolor: alpha(colors.white, 0.15), fontSize: "0.78rem", fontWeight: 600 }}>
                <TrendingUpIcon sx={{ fontSize: 14 }} />
                Net: {fmt(totalNet)} ({netPct.toFixed(1)}%)
              </Box>
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.5, borderRadius: 2, bgcolor: alpha(colors.white, 0.12), fontSize: "0.78rem", fontWeight: 600 }}>
                <AccountBalanceRoundedIcon sx={{ fontSize: 14 }} />
                Tax: {fmt(totalTax)}
              </Box>
            </Stack>
          </Paper>
        </FadeIn>
      )}

      {/* Group-by controls */}
      {!loading && incomes.length > 0 && (
        <Box>
          <ToggleButtonGroup value={grouping} exclusive
            onChange={(_e, val) => val && setGrouping(val)} size="small"
            sx={{
              "& .MuiToggleButton-root": {
                px: 2, py: 0.5, fontSize: "0.8rem", fontWeight: 600,
                borderRadius: "20px !important", border: "none",
                bgcolor: alpha(colors.brand, 0.06),
                "&.Mui-selected": { bgcolor: colors.brand, color: colors.white, "&:hover": { bgcolor: colors.brand } },
              },
              gap: 0.75, border: "none",
            }}
          >
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
        sections.map((section, si) => {
          const sNet = section.items.reduce((s, i) => s + i.netAmount, 0);
          const sTax = section.items.reduce((s, i) => s + i.taxPaid, 0);
          const sTotal = sNet + sTax;
          return (
            <FadeIn key={section.title} delay={si * 40}>
              <Stack spacing={0}>
                {/* Section header bar */}
                <Paper sx={{
                  px: { xs: 2, sm: 3 }, py: 1.5, borderRadius: "12px 12px 0 0",
                  bgcolor: alpha(colors.brand, 0.04),
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1,
                }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "0.95rem" }} noWrap>{section.title}</Typography>
                    <Typography variant="caption" sx={{ color: colors.gray400 }}>
                      {section.items.length} item{section.items.length !== 1 ? "s" : ""}
                    </Typography>
                  </Box>
                  <Stack alignItems="flex-end" spacing={0.25}>
                    <Typography sx={{ fontWeight: 750, fontSize: "1rem", letterSpacing: "-0.02em" }}>{fmt(sTotal)}</Typography>
                    <Stack direction="row" spacing={0.5}>
                      <TintedChip label={`Net ${fmt(sNet)}`} color={colors.success} size="small" />
                      {sTax > 0 && <TintedChip label={`Tax ${fmt(sTax)}`} color={colors.error} size="small" />}
                    </Stack>
                  </Stack>
                </Paper>

                {/* Income rows as timeline cards */}
                {section.items.map((income, i) => {
                  const gross = income.netAmount + income.taxPaid;
                  const dt = parseCreditDate(income.creditedDate);
                  return (
                    <Box key={income.id} sx={{ display: "flex", gap: { xs: 1.5, sm: 2 }, alignItems: "flex-start", position: "relative" }}>
                      {/* Timeline connector */}
                      {i < section.items.length - 1 && (
                        <Box sx={{
                          position: "absolute", left: 23, top: 52,
                          width: 2, bottom: -4,
                          bgcolor: colors.gray200,
                        }} />
                      )}
                      {/* Date bubble */}
                      <Box sx={{
                        width: 48, minWidth: 48, pt: 1.5,
                        display: "flex", flexDirection: "column", alignItems: "center",
                        position: "relative", zIndex: 1,
                      }}>
                        <Box sx={{
                          width: 48, height: 48, borderRadius: 3,
                          bgcolor: alpha(colors.success, 0.08),
                          display: "flex", flexDirection: "column",
                          alignItems: "center", justifyContent: "center",
                        }}>
                          <Typography sx={{ fontSize: "1rem", fontWeight: 750, lineHeight: 1, color: colors.success }}>
                            {dt.day}
                          </Typography>
                          <Typography sx={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", color: colors.gray500, lineHeight: 1, mt: 0.25 }}>
                            {dt.month}
                          </Typography>
                        </Box>
                      </Box>
                      {/* Income card */}
                      <Paper sx={{
                        flex: 1, p: 2, my: 0.75, borderRadius: 3,
                        transition: "all 0.2s ease",
                        "&:hover": { boxShadow: shadow.md },
                      }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography sx={{ fontSize: "0.85rem", fontWeight: 650, mb: 0.25 }} noWrap>
                              {tagLookup.get(income.incomeTagId) ?? "—"}
                            </Typography>
                            <Typography variant="caption" sx={{ color: colors.gray400 }}>
                              {sourceLookup.get(income.incomeSourceId) ?? "—"} · {dt.full}
                            </Typography>
                            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                              <Box>
                                <Typography variant="caption" sx={{ color: colors.gray400, display: "block", lineHeight: 1 }}>Net</Typography>
                                <Typography sx={{ fontSize: "0.95rem", fontWeight: 650, mt: 0.25, color: colors.success }}>{fmt(income.netAmount, income.currency)}</Typography>
                              </Box>
                              {income.taxPaid > 0 && (
                                <>
                                  <Box sx={{ color: colors.gray300, display: "flex", alignItems: "center" }}>+</Box>
                                  <Box>
                                    <Typography variant="caption" sx={{ color: colors.gray400, display: "block", lineHeight: 1 }}>Tax</Typography>
                                    <Typography sx={{ fontSize: "0.95rem", fontWeight: 650, mt: 0.25, color: colors.error }}>{fmt(income.taxPaid, income.currency)}</Typography>
                                  </Box>
                                </>
                              )}
                            </Stack>
                          </Box>
                          <Stack alignItems="flex-end" spacing={0.5}>
                            <Stack direction="row" spacing={0}>
                              <IconButton size="small" onClick={() => openEdit(income)} sx={{ color: colors.gray400, "&:hover": { color: colors.brand } }}>
                                <EditOutlinedIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                              <IconButton size="small" onClick={() => setDeleteConfirm(income)} sx={{ color: colors.gray400, "&:hover": { color: colors.error } }}>
                                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Stack>
                            <Typography sx={{ fontSize: "1.1rem", fontWeight: 750, letterSpacing: "-0.02em" }}>
                              {fmt(gross, income.currency)}
                            </Typography>
                          </Stack>
                        </Stack>
                      </Paper>
                    </Box>
                  );
                })}
              </Stack>
            </FadeIn>
          );
        })
      )}

      {/* FAB */}
      <Fab onClick={openCreate}
        variant={isMobile ? "circular" : "extended"}
        sx={{
          position: "fixed",
          bottom: 24,
          right: { xs: 16, sm: 24 },
          background: "linear-gradient(135deg, #059669 0%, #10B981 100%)",
          color: colors.white,
          boxShadow: `0 4px 20px ${alpha("#059669", 0.4)}`,
          "&:hover": { background: "linear-gradient(135deg, #047857 0%, #059669 100%)", boxShadow: `0 6px 28px ${alpha("#059669", 0.5)}` },
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
