import { useEffect, useMemo, useState } from "react";
import {
  Box, Paper, Typography, Stack, TextField, InputAdornment, MenuItem,
  ToggleButton, ToggleButtonGroup, Chip, Select, FormControl,
  useMediaQuery, useTheme, ListSubheader,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import ViewListRoundedIcon from "@mui/icons-material/ViewListRounded";
import CategoryRoundedIcon from "@mui/icons-material/CategoryRounded";
import { getMfCategories, getMfTable } from "../api/client";
import type { MfCategory, MfTable, MfTableRow } from "../api/types";
import { PageHeader, EmptyState, ErrorState, ListSkeleton } from "../components/shared";
import MfFundTable from "../components/MfFundTable";
import { useTokens } from "../context/ColorModeContext";
import { HORIZONS, assetClassLabel, assetClassRank, type Horizon } from "../utils/mfMetrics";

// Prefer opening on a category people actually search for, when it exists.
const PREFERRED_DEFAULTS = ["Large Cap", "Flexi Cap", "Mid Cap"];

// Full horizon set, including since-inception. Risk metrics have no SI value, so those columns read
// "—" at SI while CAGR and max-drawdown stay meaningful.
const TABLE_HORIZONS = HORIZONS;

type View = "category" | "all";

function MutualFunds() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { colors } = useTokens();
  const isDark = theme.palette.mode === "dark";

  const [categories, setCategories] = useState<MfCategory[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState<string | null>(null);
  const [catSearch, setCatSearch] = useState("");

  const [view, setView] = useState<View>("category");
  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<Horizon>("5Y");

  // All-funds view filters.
  const [allSearch, setAllSearch] = useState("");
  const [allAsset, setAllAsset] = useState<string>("");
  const [allCategory, setAllCategory] = useState<string>("");

  const [table, setTable] = useState<MfTable | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);

  // Load the category catalog once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setCatLoading(true); setCatError(null);
        const data = await getMfCategories();
        if (cancelled) return;
        setCategories(data);
        const preferred = PREFERRED_DEFAULTS.map(p => data.find(c => c.subCategory === p)).find(Boolean);
        setSelectedSub((preferred ?? data[0])?.subCategory ?? null);
      } catch (err) {
        if (!cancelled) setCatError(err instanceof Error ? err.message : "Failed to load categories");
      } finally {
        if (!cancelled) setCatLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch the table: one category in "category" view, every fund in "all" view.
  useEffect(() => {
    if (view === "category" && !selectedSub) return;
    let cancelled = false;
    (async () => {
      try {
        setTableLoading(true); setTableError(null);
        const data = await getMfTable({
          subCategory: view === "category" ? selectedSub! : undefined,
          horizon,
        });
        if (!cancelled) setTable(data);
      } catch (err) {
        if (!cancelled) { setTable(null); setTableError(err instanceof Error ? err.message : "Failed to load"); }
      } finally {
        if (!cancelled) setTableLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [view, selectedSub, horizon]);

  // Group categories by asset class, filtered by the sidebar search.
  const grouped = useMemo(() => {
    const q = catSearch.trim().toLowerCase();
    const filtered = q ? categories.filter(c => c.subCategory.toLowerCase().includes(q) || assetClassLabel(c.assetClass).toLowerCase().includes(q)) : categories;
    const byAsset = new Map<string, MfCategory[]>();
    for (const c of filtered) {
      if (!byAsset.has(c.assetClass)) byAsset.set(c.assetClass, []);
      byAsset.get(c.assetClass)!.push(c);
    }
    return [...byAsset.entries()]
      .sort((a, b) => assetClassRank(a[0]) - assetClassRank(b[0]))
      .map(([asset, subs]) => ({ asset, subs: subs.sort((a, b) => b.liveCount - a.liveCount) }));
  }, [categories, catSearch]);

  const totalFunds = useMemo(() => categories.reduce((s, c) => s + c.liveCount, 0), [categories]);

  // Asset classes present, in display order — powers the "all Equity / Hybrid / …" filter.
  const assetClasses = useMemo(
    () => [...new Set(categories.map(c => c.assetClass))].sort((a, b) => assetClassRank(a) - assetClassRank(b)),
    [categories],
  );

  // All-funds view: apply the search + asset-class + category filters client-side.
  const allRows: MfTableRow[] = useMemo(() => {
    if (!table) return [];
    const q = allSearch.trim().toLowerCase();
    return table.rows.filter(r =>
      (!allAsset || r.assetClass === allAsset) &&
      (!allCategory || r.subCategory === allCategory) &&
      (!q || r.name.toLowerCase().includes(q) || r.amc.toLowerCase().includes(q)),
    );
  }, [table, allSearch, allAsset, allCategory]);

  if (catError && categories.length === 0 && !catLoading) {
    return <ErrorState message={catError} onRetry={() => window.location.reload()} />;
  }

  const CategoryPanel = (
    <Paper sx={{ p: { xs: 1.5, sm: 2 }, height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <TextField
        size="small" placeholder="Search categories…" value={catSearch}
        onChange={e => setCatSearch(e.target.value)}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, color: colors.gray400 }} /></InputAdornment> }}
        sx={{ mb: 1.5 }} fullWidth
      />
      <Box sx={{ overflowY: "auto", flex: 1, minHeight: 0, mx: -0.5, px: 0.5 }}>
        {catLoading ? (
          <Stack spacing={1}>{Array.from({ length: 8 }).map((_, i) => <Box key={i} sx={{ height: 34, borderRadius: 1, bgcolor: colors.gray100 }} />)}</Stack>
        ) : grouped.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>No categories match "{catSearch}"</Typography>
        ) : grouped.map(({ asset, subs }) => (
          <Box key={asset} sx={{ mb: 1.5 }}>
            <Typography variant="overline" sx={{ px: 1, color: colors.gray400 }}>{assetClassLabel(asset)}</Typography>
            <Stack spacing={0.25} sx={{ mt: 0.25 }}>
              {subs.map(c => {
                const active = c.subCategory === selectedSub;
                return (
                  <Box
                    key={c.subCategory}
                    onClick={() => setSelectedSub(c.subCategory)}
                    sx={{
                      display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.75, borderRadius: 1.5, cursor: "pointer",
                      bgcolor: active ? alpha(colors.brand, isDark ? 0.18 : 0.1) : "transparent",
                      color: active ? colors.brand : "text.primary",
                      "&:hover": { bgcolor: active ? alpha(colors.brand, isDark ? 0.22 : 0.14) : alpha(colors.gray400, 0.1) },
                    }}
                  >
                    <Typography sx={{ flex: 1, fontSize: "0.83rem", fontWeight: active ? 700 : 500, minWidth: 0 }} noWrap>{c.subCategory}</Typography>
                    <Chip label={c.liveCount} size="small" sx={{ height: 18, fontSize: "0.65rem", fontWeight: 600, bgcolor: active ? alpha(colors.brand, 0.15) : colors.gray100, color: active ? colors.brand : colors.gray500 }} />
                  </Box>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Box>
    </Paper>
  );

  const HorizonSelector = (
    <Box sx={{ overflowX: "auto" }}>
      <ToggleButtonGroup exclusive size="small" value={horizon} onChange={(_, v) => { if (v) setHorizon(v); }}>
        {TABLE_HORIZONS.map(h => <ToggleButton key={h} value={h}>{h}</ToggleButton>)}
      </ToggleButtonGroup>
    </Box>
  );

  const TableArea = tableLoading ? (
    <ListSkeleton rows={8} />
  ) : tableError ? (
    <ErrorState message={tableError} onRetry={() => setHorizon(h => h)} />
  ) : !table || (view === "category" ? table.rows.length === 0 : allRows.length === 0) ? (
    <EmptyState icon={<InsightsRoundedIcon />} title="No funds"
      description={view === "category" ? `No fund in ${selectedSub ?? "this category"} has enough history over ${horizon}.` : "No funds match your filters."} />
  ) : (
    <MfFundTable
      rows={view === "category" ? table.rows : allRows}
      metrics={table.metrics}
      showCategory={view === "all"}
    />
  );

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      <PageHeader title="Mutual Fund Analyzer" action={
        !catLoading && totalFunds > 0 ? (
          <Chip icon={<InsightsRoundedIcon />} label={`${totalFunds.toLocaleString("en-IN")} Direct-Growth funds`}
            sx={{ fontWeight: 600, bgcolor: alpha(colors.brand, 0.1), color: colors.brand }} />
        ) : undefined
      } />

      {/* View toggle + horizon */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }}>
        <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, v) => { if (v) setView(v); }}>
          <ToggleButton value="category" sx={{ px: 1.75, gap: 0.75 }}><CategoryRoundedIcon sx={{ fontSize: 18 }} /> By category</ToggleButton>
          <ToggleButton value="all" sx={{ px: 1.75, gap: 0.75 }}><ViewListRoundedIcon sx={{ fontSize: 18 }} /> All funds</ToggleButton>
        </ToggleButtonGroup>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>Horizon</Typography>
          {HorizonSelector}
        </Stack>
      </Stack>

      {view === "category" ? (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "300px 1fr" }, gap: 2, alignItems: "start" }}>
          {isMobile ? (
            <FormControl fullWidth size="small">
              <Select value={selectedSub ?? ""} displayEmpty onChange={e => setSelectedSub(e.target.value)}
                renderValue={v => (v ? String(v) : "Select a category")}>
                {grouped.flatMap(({ asset, subs }) => [
                  <ListSubheader key={asset} sx={{ fontSize: "0.7rem", fontWeight: 700, color: colors.gray400, textTransform: "uppercase" }}>{assetClassLabel(asset)}</ListSubheader>,
                  ...subs.map(c => <MenuItem key={c.subCategory} value={c.subCategory} sx={{ pl: 3 }}>{c.subCategory} · {c.liveCount}</MenuItem>),
                ])}
              </Select>
            </FormControl>
          ) : (
            <Box sx={{ position: "sticky", top: 16, height: "calc(100vh - 160px)" }}>{CategoryPanel}</Box>
          )}

          <Paper sx={{ p: { xs: 1.5, sm: 2.5 }, minWidth: 0 }}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" noWrap>{selectedSub ?? "Select a category"}</Typography>
              <Typography variant="caption" color="text.secondary">
                {table ? `${table.rows.length} funds · ${horizon} · tap a column to sort` : "Loading…"}
              </Typography>
            </Box>
            {TableArea}
          </Paper>
        </Box>
      ) : (
        <Paper sx={{ p: { xs: 1.5, sm: 2.5 } }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
            <TextField
              size="small" placeholder="Search funds or AMCs…" value={allSearch}
              onChange={e => setAllSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, color: colors.gray400 }} /></InputAdornment> }}
              sx={{ flex: 1 }}
            />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select value={allAsset} displayEmpty
                onChange={e => { setAllAsset(e.target.value); setAllCategory(""); }}
                renderValue={v => (v ? assetClassLabel(String(v)) : "All asset classes")}>
                <MenuItem value="">All asset classes</MenuItem>
                {assetClasses.map(a => <MenuItem key={a} value={a}>{assetClassLabel(a)}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 190 }}>
              <Select value={allCategory} displayEmpty onChange={e => setAllCategory(e.target.value)}
                renderValue={v => (v ? String(v) : "All categories")}>
                <MenuItem value="">All categories</MenuItem>
                {grouped.filter(g => !allAsset || g.asset === allAsset).flatMap(({ asset, subs }) => [
                  <ListSubheader key={asset} sx={{ fontSize: "0.7rem", fontWeight: 700, color: colors.gray400, textTransform: "uppercase" }}>{assetClassLabel(asset)}</ListSubheader>,
                  ...subs.map(c => <MenuItem key={c.subCategory} value={c.subCategory} sx={{ pl: 3 }}>{c.subCategory} · {c.liveCount}</MenuItem>),
                ])}
              </Select>
            </FormControl>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            {table ? `${allRows.length.toLocaleString("en-IN")} funds · ${horizon} · tap a column to sort` : "Loading…"}
          </Typography>
          {TableArea}
        </Paper>
      )}
    </Stack>
  );
}

export default MutualFunds;
