import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Box, Paper, Typography, Chip, Collapse,
  ToggleButtonGroup, ToggleButton, Fab, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, MenuItem, Stack, Grid2 as Grid,
  useMediaQuery, useTheme,
} from "@mui/material";
import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import ViewListRoundedIcon from "@mui/icons-material/ViewListRounded";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";
import IncomeChart from "../components/IncomeChart";
import { useUser } from "../context/UserContext";
import {
  getIncomes, getIncomeSources, getIncomeTags,
  createIncome, updateIncome, deleteIncome, invalidateCache,
} from "../api/client";
import { ListSkeleton, EmptyState, ErrorState, TintedChip, FadeIn } from "../components/shared";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import type { Income, IncomeSource, IncomeTag } from "../api/types";

type Grouping = "month" | "source" | "tag" | "year" | "fy";

function fmt(v: number, currency = "INR"): string {
  const hasDecimals = v % 1 !== 0;
  const abs = Math.abs(v);
  const formatted = new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: hasDecimals ? 2 : 0 }).format(abs);
  return v < 0 ? `-${formatted}` : formatted;
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
function fyKey(d: string): string {
  const dt = new Date(d + "T00:00:00");
  const m = dt.getMonth(); // 0-based
  const y = dt.getFullYear();
  const startYear = m >= 3 ? y : y - 1; // April (3) onwards = current FY
  return `FY ${startYear}-${String(startYear + 1).slice(2)}`;
}

function Incomes() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, gradients } = useTokens();
  const { showToast } = useToast();
  const { userId } = useUser();
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [tags, setTags] = useState<IncomeTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "chart">("list");
  const [grouping, setGrouping] = useState<Grouping>("month");
  const [showFilters, setShowFilters] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filterSources, setFilterSources] = useState<number[]>([]);
  const [filterTags, setFilterTags] = useState<number[]>([]);
  const [filterYears, setFilterYears] = useState<string[]>([]);
  const [filterFYs, setFilterFYs] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editIncome, setEditIncome] = useState<Income | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Income | null>(null);

  const [formSourceId, setFormSourceId] = useState<number | "">("");
  const [formTagId, setFormTagId] = useState<number | "">("");
  const [formNet, setFormNet] = useState("");
  const [formTax, setFormTax] = useState("");
  const [formCurrency, setFormCurrency] = useState("INR");
  const [formDate, setFormDate] = useState("");

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

  const activeFilterCount = [filterSources, filterTags, filterYears, filterFYs].filter((a) => a.length > 0).length;

  // Each filter's options are derived from data filtered by all OTHER active filters
  const applyFilters = useCallback((data: Income[], skipFilter?: "source" | "tag" | "year" | "fy") => {
    return data.filter((inc) => {
      if (skipFilter !== "source" && filterSources.length && !filterSources.includes(inc.incomeSourceId)) return false;
      if (skipFilter !== "tag" && filterTags.length && !filterTags.includes(inc.incomeTagId)) return false;
      if (skipFilter !== "year" && filterYears.length && !filterYears.includes(yearKey(inc.creditedDate))) return false;
      if (skipFilter !== "fy" && filterFYs.length && !filterFYs.includes(fyKey(inc.creditedDate))) return false;
      return true;
    });
  }, [filterSources, filterTags, filterYears, filterFYs]);

  const filtered = useMemo(() => applyFilters(incomes), [applyFilters, incomes]);

  const availableSources = useMemo(() => {
    const data = applyFilters(incomes, "source");
    return sources.filter((s) => data.some((i) => i.incomeSourceId === s.id));
  }, [applyFilters, incomes, sources]);

  const availableTags = useMemo(() => {
    const data = applyFilters(incomes, "tag");
    return tags.filter((t) => data.some((i) => i.incomeTagId === t.id));
  }, [applyFilters, incomes, tags]);

  const years = useMemo(() => {
    const data = applyFilters(incomes, "year");
    return [...new Set(data.map((i) => yearKey(i.creditedDate)))].sort().reverse();
  }, [applyFilters, incomes]);

  const fys = useMemo(() => {
    const data = applyFilters(incomes, "fy");
    return [...new Set(data.map((i) => fyKey(i.creditedDate)))].sort().reverse();
  }, [applyFilters, incomes]);

  const clearFilters = () => {
    setFilterSources([]); setFilterTags([]); setFilterYears([]); setFilterFYs([]);
  };

  const sections = useMemo(() => {
    const groups = new Map<string, Income[]>();
    for (const inc of filtered) {
      let key: string;
      switch (grouping) {
        case "month": key = monthKey(inc.creditedDate); break;
        case "year": key = yearKey(inc.creditedDate); break;
        case "fy": key = fyKey(inc.creditedDate); break;
        case "source": key = sourceLookup.get(inc.incomeSourceId) ?? "Unknown"; break;
        case "tag": key = tagLookup.get(inc.incomeTagId) ?? "Unknown"; break;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(inc);
    }
    return Array.from(groups.entries()).map(([title, items]) => ({ title, items }));
  }, [filtered, grouping, sourceLookup, tagLookup]);

  const totalAll = useMemo(() => filtered.reduce((s, i) => s + i.netAmount + i.taxPaid, 0), [filtered]);
  const totalNet = useMemo(() => filtered.reduce((s, i) => s + i.netAmount, 0), [filtered]);
  const totalTax = useMemo(() => filtered.reduce((s, i) => s + i.taxPaid, 0), [filtered]);
  const netPct = totalAll > 0 ? (totalNet / totalAll) * 100 : 0;

  const chartData = useMemo(() => {
    const map = new Map<string, { sortKey: string; net: number; tax: number }>();
    for (const inc of filtered) {
      let key: string;
      let sortKey: string;
      switch (grouping) {
        case "month": {
          const raw = inc.creditedDate.slice(0, 7);
          const [y, m] = raw.split("-");
          key = new Date(Number(y), Number(m) - 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
          sortKey = raw;
          break;
        }
        case "year": key = yearKey(inc.creditedDate); sortKey = key; break;
        case "fy": key = fyKey(inc.creditedDate); sortKey = key; break;
        case "source": key = sourceLookup.get(inc.incomeSourceId) ?? "Unknown"; sortKey = key; break;
        case "tag": key = tagLookup.get(inc.incomeTagId) ?? "Unknown"; sortKey = key; break;
      }
      const prev = map.get(key) || { sortKey, net: 0, tax: 0 };
      map.set(key, { sortKey, net: prev.net + inc.netAmount, tax: prev.tax + inc.taxPaid });
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => a.sortKey.localeCompare(b.sortKey))
      .map(([label, val]) => ({ label, net: val.net, tax: val.tax }));
  }, [filtered, grouping, sourceLookup, tagLookup]);

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
    if (formDate > new Date().toISOString().slice(0, 10)) { showToast("Date cannot be in the future", "error"); return; }
    const payload = {
      incomeSourceId: formSourceId as number, incomeTagId: formTagId as number,
      netAmount: parseFloat(formNet), taxPaid: formTax ? parseFloat(formTax) : 0,
      currency: formCurrency, creditedDate: formDate,
    };
    const prev = incomes;
    if (editIncome) {
      const updated = { ...editIncome, ...payload };
      setIncomes(list => list.map(i => i.id === editIncome.id ? updated : i).sort((a, b) => b.creditedDate.localeCompare(a.creditedDate)));
      setDialogOpen(false);
      try {
        const server = await updateIncome(editIncome.id, payload);
        setIncomes(list => list.map(i => i.id === editIncome.id ? server : i).sort((a, b) => b.creditedDate.localeCompare(a.creditedDate)));
        invalidateCache("incomes");
        showToast("Income updated");
      } catch (err) {
        setIncomes(prev);
        showToast(err instanceof Error ? err.message : "Failed to update income", "error");
      }
    } else {
      const tempId = -Date.now();
      const optimistic: Income = { id: tempId, userId, ...payload };
      setIncomes(list => [optimistic, ...list].sort((a, b) => b.creditedDate.localeCompare(a.creditedDate)));
      setDialogOpen(false);
      try {
        const created = await createIncome({ userId, ...payload });
        setIncomes(list => list.map(i => i.id === tempId ? created : i));
        invalidateCache("incomes");
        showToast(`Income of ${formCurrency} ${formNet} created`);
      } catch (err) {
        setIncomes(prev);
        showToast(err instanceof Error ? err.message : "Failed to create income", "error");
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const { id, netAmount, currency } = deleteConfirm;
    const amt = fmt(netAmount, currency);
    const prev = incomes;
    setIncomes(list => list.filter(i => i.id !== id));
    setDeleteConfirm(null);
    try {
      await deleteIncome(id);
      invalidateCache("incomes");
      showToast(`Income of ${amt} deleted`);
    } catch (err) {
      setIncomes(prev);
      showToast(err instanceof Error ? err.message : "Failed to delete income", "error");
    }
  };

  if (error && incomes.length === 0 && !loading) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }} sx={{ pb: 10 }}>
      {/* ── Hero Card ── */}
      {!loading && (
        <FadeIn>
          <Paper sx={{
            p: { xs: 3, sm: 4 }, borderRadius: 4, border: "none",
            background: gradients.success,
            color: colors.pureWhite, position: "relative", overflow: "hidden",
            boxShadow: `0 8px 32px ${alpha(colors.success, 0.3)}`,
          }}>
            <Box sx={{ position: "absolute", top: -50, right: -50, width: 180, height: 180, borderRadius: "50%", bgcolor: alpha(colors.pureWhite, 0.06) }} />
            <Box sx={{ position: "absolute", bottom: -30, right: 80, width: 100, height: 100, borderRadius: "50%", bgcolor: alpha(colors.pureWhite, 0.04) }} />

            <Box sx={{ position: "relative", zIndex: 1 }}>
              <Typography sx={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.75, mb: 0.5 }}>
                Total Income
              </Typography>
              <Typography sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem" }, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                {fmt(totalAll)}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1.5} sx={{ mt: 2, position: "relative", zIndex: 1 }} flexWrap="wrap" useFlexGap>
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: { xs: 1, sm: 1.5 }, py: 0.5, borderRadius: 2, bgcolor: alpha(colors.pureWhite, 0.15), fontSize: { xs: "0.7rem", sm: "0.78rem" }, fontWeight: 600 }}>
                <TrendingUpIcon sx={{ fontSize: 14 }} />
                Net: {fmt(totalNet)} ({netPct.toFixed(1)}%)
              </Box>
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: { xs: 1, sm: 1.5 }, py: 0.5, borderRadius: 2, bgcolor: alpha(colors.pureWhite, 0.12), fontSize: { xs: "0.7rem", sm: "0.78rem" }, fontWeight: 600 }}>
                <AccountBalanceRoundedIcon sx={{ fontSize: 14 }} />
                Tax: {fmt(totalTax)} ({totalAll > 0 ? ((totalTax / totalAll) * 100).toFixed(1) : "0.0"}%)
              </Box>
            </Stack>
          </Paper>
        </FadeIn>
      )}

      {/* ── Group-by + View Toggle + Filters (shared across views) ── */}
      {!loading && incomes.length > 0 && (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ rowGap: 1 }}>
            <ToggleButtonGroup value={grouping} exclusive
              onChange={(_e, val) => val && setGrouping(val)} size="small"
              sx={{
                "& .MuiToggleButton-root": {
                  px: { xs: 1.25, sm: 2 }, py: 0.5, fontSize: { xs: "0.72rem", sm: "0.8rem" }, fontWeight: 600,
                  borderRadius: "20px !important", border: "none",
                  bgcolor: alpha(colors.brand, 0.06),
                  "&.Mui-selected": { bgcolor: colors.brand, color: colors.pureWhite, "&:hover": { bgcolor: colors.brand } },
                },
                gap: 0.75, border: "none",
              }}
            >
              <ToggleButton value="month">Month</ToggleButton>
              <ToggleButton value="source">Source</ToggleButton>
              <ToggleButton value="tag">Tag</ToggleButton>
              <ToggleButton value="year">Year</ToggleButton>
              <ToggleButton value="fy">FY</ToggleButton>
            </ToggleButtonGroup>

            <Box sx={{ flex: 1, display: { xs: "none", sm: "block" } }} />

            <Chip
              icon={<FilterListRoundedIcon sx={{ fontSize: 16 }} />}
              label={activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"}
              onClick={() => setShowFilters(!showFilters)}
              variant={activeFilterCount > 0 ? "filled" : "outlined"}
              color={activeFilterCount > 0 ? "primary" : "default"}
              size="small"
              sx={{ fontWeight: 600, fontSize: "0.8rem" }}
            />
            {activeFilterCount > 0 && (
              <Chip label="Clear" size="small" onDelete={clearFilters} deleteIcon={<CloseRoundedIcon />}
                sx={{ fontWeight: 600, fontSize: "0.75rem" }} />
            )}

            <ToggleButtonGroup value={view} exclusive onChange={(_e, val) => val && setView(val)} size="small"
              sx={{
                "& .MuiToggleButton-root": {
                  px: 1.25, py: 0.5, border: "none", borderRadius: "20px !important",
                  bgcolor: alpha(colors.brand, 0.06),
                  "&.Mui-selected": { bgcolor: colors.brand, color: colors.pureWhite, "&:hover": { bgcolor: colors.brand } },
                },
                gap: 0.5, border: "none",
              }}
            >
              <ToggleButton value="list"><ViewListRoundedIcon sx={{ fontSize: 18 }} /></ToggleButton>
              <ToggleButton value="chart"><BarChartRoundedIcon sx={{ fontSize: 18 }} /></ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <Collapse in={showFilters}>
            <Paper sx={{ p: 2.5, borderRadius: 3, border: `1px solid ${colors.gray200}` }} elevation={0}>
              <Stack spacing={2}>
                {/* Source */}
                <Box>
                  <Typography sx={{ fontSize: "0.7rem", fontWeight: 650, color: colors.gray400, textTransform: "uppercase", letterSpacing: "0.06em", mb: 0.75 }}>Source</Typography>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {availableSources.map((s) => {
                      const active = filterSources.includes(s.id);
                      return (
                        <Chip key={s.id} label={s.name} size="small"
                          onClick={() => setFilterSources(active ? filterSources.filter((id) => id !== s.id) : [...filterSources, s.id])}
                          variant={active ? "filled" : "outlined"}
                          color={active ? "primary" : "default"}
                          sx={{ fontWeight: 600, fontSize: "0.78rem", borderRadius: 2 }} />
                      );
                    })}
                  </Stack>
                </Box>
                {/* Tag */}
                <Box>
                  <Typography sx={{ fontSize: "0.7rem", fontWeight: 650, color: colors.gray400, textTransform: "uppercase", letterSpacing: "0.06em", mb: 0.75 }}>Tag</Typography>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {availableTags.map((t) => {
                      const active = filterTags.includes(t.id);
                      return (
                        <Chip key={t.id} label={t.name} size="small"
                          onClick={() => setFilterTags(active ? filterTags.filter((id) => id !== t.id) : [...filterTags, t.id])}
                          variant={active ? "filled" : "outlined"}
                          color={active ? "primary" : "default"}
                          sx={{ fontWeight: 600, fontSize: "0.78rem", borderRadius: 2 }} />
                      );
                    })}
                  </Stack>
                </Box>
                {/* Year + FY side by side */}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: "0.7rem", fontWeight: 650, color: colors.gray400, textTransform: "uppercase", letterSpacing: "0.06em", mb: 0.75 }}>Year</Typography>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      {years.map((y) => {
                        const active = filterYears.includes(y);
                        return (
                          <Chip key={y} label={y} size="small"
                            onClick={() => setFilterYears(active ? filterYears.filter((v) => v !== y) : [...filterYears, y])}
                            variant={active ? "filled" : "outlined"}
                            color={active ? "primary" : "default"}
                            sx={{ fontWeight: 600, fontSize: "0.78rem", borderRadius: 2 }} />
                        );
                      })}
                    </Stack>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: "0.7rem", fontWeight: 650, color: colors.gray400, textTransform: "uppercase", letterSpacing: "0.06em", mb: 0.75 }}>Financial Year</Typography>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      {fys.map((f) => {
                        const active = filterFYs.includes(f);
                        return (
                          <Chip key={f} label={f} size="small"
                            onClick={() => setFilterFYs(active ? filterFYs.filter((v) => v !== f) : [...filterFYs, f])}
                            variant={active ? "filled" : "outlined"}
                            color={active ? "primary" : "default"}
                            sx={{ fontWeight: 600, fontSize: "0.78rem", borderRadius: 2 }} />
                        );
                      })}
                    </Stack>
                  </Box>
                </Stack>
              </Stack>
            </Paper>
          </Collapse>
        </Stack>
      )}

      {/* ── Chart View ── */}
      {!loading && view === "chart" && incomes.length > 0 && (
        <FadeIn>
          <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
              Income by {grouping === "fy" ? "Financial Year" : grouping.charAt(0).toUpperCase() + grouping.slice(1)}
            </Typography>
            {chartData.length >= 2 ? (
              <Box sx={{ mx: { xs: -1, sm: 0 } }}>
                <IncomeChart data={chartData} />
              </Box>
            ) : (
              <EmptyState
                icon={<ShowChartOutlinedIcon />}
                title="Not enough data"
                description="At least 2 groups needed to show the chart. Try a different grouping or adjust filters."
              />
            )}
          </Paper>
        </FadeIn>
      )}

      {/* Income sections */}
      {loading ? <ListSkeleton rows={6} /> : view !== "list" ? null : sections.length === 0 ? (
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
              <Paper sx={{ borderRadius: 3, overflow: "hidden", border: `1px solid ${colors.gray200}` }} elevation={0}>
                {/* Section header bar */}
                <Box
                  onClick={() => setCollapsed(prev => ({ ...prev, [section.title]: !prev[section.title] }))}
                  sx={{
                    px: { xs: 2, sm: 3 }, py: 1.5,
                    bgcolor: alpha(colors.brand, 0.05),
                    borderBottom: collapsed[section.title] ? "none" : `1px solid ${colors.gray200}`,
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1,
                    cursor: "pointer", userSelect: "none",
                    "&:hover": { bgcolor: alpha(colors.brand, 0.08) },
                    transition: "background-color 0.15s ease",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
                    {collapsed[section.title]
                      ? <ExpandMoreRoundedIcon sx={{ fontSize: 20, color: colors.gray400 }} />
                      : <ExpandLessRoundedIcon sx={{ fontSize: 20, color: colors.gray400 }} />}
                    <Typography sx={{ fontWeight: 700, fontSize: "0.95rem" }} noWrap>{section.title}</Typography>
                  </Box>
                  <Stack alignItems="flex-end" spacing={0.25}>
                    <Typography sx={{ fontWeight: 750, fontSize: "1rem", letterSpacing: "-0.02em" }}>{fmt(sTotal)}</Typography>
                    <Stack direction="row" spacing={0.25} sx={{ flexWrap: "wrap" }}>
                      <TintedChip label={`Net ${fmt(sNet)} (${sTotal > 0 ? ((sNet / sTotal) * 100).toFixed(1) : "0.0"}%)`} color={colors.success} size="small" />
                      {sTax > 0 && <TintedChip label={`Tax ${fmt(sTax)} (${sTotal > 0 ? ((sTax / sTotal) * 100).toFixed(1) : "0.0"}%)`} color={colors.error} size="small" />}
                    </Stack>
                  </Stack>
                </Box>

                {/* Income rows as timeline cards */}
                <Collapse in={!collapsed[section.title]}>
                {section.items.map((income, i) => {
                  const gross = income.netAmount + income.taxPaid;
                  const dt = parseCreditDate(income.creditedDate);
                  return (
                    <Box key={income.id} sx={{
                      display: "flex", gap: { xs: 1.5, sm: 2 }, alignItems: "flex-start", position: "relative",
                      px: { xs: 1.5, sm: 2 }, bgcolor: colors.white,
                      borderBottom: i < section.items.length - 1 ? `1px solid ${alpha(colors.gray200, 0.6)}` : "none",
                    }}>
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
                      <Box sx={{ flex: 1, py: 1.5 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography sx={{ fontSize: "0.85rem", fontWeight: 650, mb: 0.25 }} noWrap>
                              {tagLookup.get(income.incomeTagId) ?? "—"}
                            </Typography>
                            <Typography variant="caption" sx={{ color: colors.gray400 }}>
                              {sourceLookup.get(income.incomeSourceId) ?? "—"} · {dt.full}
                            </Typography>
                            <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
                              <Box>
                                <Typography variant="caption" sx={{ color: colors.gray400, display: "block", lineHeight: 1 }}>Net</Typography>
                                <Typography sx={{ fontSize: { xs: "0.85rem", sm: "0.95rem" }, fontWeight: 650, mt: 0.25, color: colors.success }}>
                                  {fmt(income.netAmount, income.currency)} ({gross > 0 ? ((income.netAmount / gross) * 100).toFixed(1) : "0.0"}%)
                                </Typography>
                              </Box>
                              {income.taxPaid > 0 && (
                                <>
                                  <Box sx={{ color: colors.gray300, display: "flex", alignItems: "center" }}>+</Box>
                                  <Box>
                                    <Typography variant="caption" sx={{ color: colors.gray400, display: "block", lineHeight: 1 }}>Tax</Typography>
                                    <Typography sx={{ fontSize: { xs: "0.85rem", sm: "0.95rem" }, fontWeight: 650, mt: 0.25, color: colors.error }}>
                                      {fmt(income.taxPaid, income.currency)} ({gross > 0 ? ((income.taxPaid / gross) * 100).toFixed(1) : "0.0"}%)
                                    </Typography>
                                  </Box>
                                </>
                              )}
                            </Stack>
                          </Box>
                          <Stack alignItems="flex-end" spacing={0.5}>
                            <Stack direction="row" spacing={0}>
                              <IconButton size="small" onClick={() => openEdit(income)} sx={{ color: colors.brand, opacity: 0.6, "&:hover": { opacity: 1, bgcolor: alpha(colors.brand, 0.08) } }}>
                                <EditOutlinedIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                              <IconButton size="small" onClick={() => setDeleteConfirm(income)} sx={{ color: colors.error, opacity: 0.6, "&:hover": { opacity: 1, bgcolor: alpha(colors.error, 0.08) } }}>
                                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Stack>
                            <Typography sx={{ fontSize: "1.1rem", fontWeight: 750, letterSpacing: "-0.02em" }}>
                              {fmt(gross, income.currency)}
                            </Typography>
                          </Stack>
                        </Stack>
                      </Box>
                    </Box>
                  );
                })}
                </Collapse>
              </Paper>
            </FadeIn>
          );
        })
      )}

      {/* FAB */}
      <Fab onClick={openCreate}
        variant={isMobile ? "circular" : "extended"}
        sx={{
          position: "fixed",
          bottom: { xs: "calc(24px + env(safe-area-inset-bottom, 0px))", sm: 24 },
          right: { xs: 16, sm: 24 },
          bgcolor: colors.success,
          color: colors.pureWhite,
          boxShadow: `0 4px 20px ${alpha(colors.success, 0.4)}`,
          "&:hover": { bgcolor: colors.successDark, boxShadow: `0 6px 28px ${alpha(colors.success, 0.5)}` },
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
                onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) setFormNet(v); }} fullWidth
                inputProps={{ inputMode: "decimal", step: "0.01", min: 0 }} />
            </Grid>
            <Grid size={6}>
              <TextField label="Tax paid" type="number" value={formTax}
                onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) setFormTax(v); }} fullWidth
                inputProps={{ inputMode: "decimal", step: "0.01", min: 0 }} />
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
                slotProps={{ inputLabel: { shrink: true } }}
                inputProps={{ max: new Date().toISOString().slice(0, 10) }} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained"
            disabled={formSourceId === "" || formTagId === "" || !formNet || !formDate}>
            {editIncome ? "Update" : "Create"}
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
