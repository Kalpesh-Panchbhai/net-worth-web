import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box, Paper, Typography, Stack, TextField, InputAdornment, MenuItem,
  ToggleButton, ToggleButtonGroup, Chip, Select, FormControl,
  ListSubheader, Fab,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import ViewListRoundedIcon from "@mui/icons-material/ViewListRounded";
import PieChartRoundedIcon from "@mui/icons-material/PieChartRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import CompareArrowsRoundedIcon from "@mui/icons-material/CompareArrowsRounded";
import { getMfCategories, getMfTable } from "../api/client";
import type { MfCategory, MfTable, MfTableRow } from "../api/types";
import { PageHeader, EmptyState, ErrorState, ListSkeleton } from "../components/shared";
import MfFundTable from "../components/MfFundTable";
import MfCompareDialog from "../components/MfCompareDialog";
import MfPortfolioPanel from "../components/MfPortfolioPanel";
import { useTokens } from "../context/ColorModeContext";
import { useUser } from "../context/UserContext";
import { useShortlist } from "../context/ShortlistContext";
import { HORIZONS, assetClassLabel, assetClassRank, type Horizon } from "../utils/mfMetrics";
import { scoreMfRows, rankWithinCategory } from "../utils/mfScore";

const MAX_COMPARE = 4;

// Full horizon set, including since-inception. Risk metrics have no SI value, so those columns read
// "—" at SI while CAGR and max-drawdown stay meaningful. The composite score needs rolling/ratio
// metrics that also have no SI value, so it naturally goes unscored at that horizon too.
const TABLE_HORIZONS = HORIZONS;

type View = "all" | "portfolio";

function MutualFunds() {
  const { colors } = useTokens();
  const { userId } = useUser();
  const { starred } = useShortlist();

  // Tab + all-funds filters/sort live in the URL: navigating to a fund and coming back (browser
  // back restores this exact history entry) lands on the same tab with the same filters intact.
  const [searchParams, setSearchParams] = useSearchParams();
  const updateParams = (patch: Record<string, string | null>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) { if (v == null) next.delete(k); else next.set(k, v); }
      return next;
    }, { replace: true });
  };
  const view = (searchParams.get("view") === "portfolio" ? "portfolio" : "all") as View;
  const setView = (v: View) => updateParams({ view: v === "all" ? null : v });
  const horizon = (searchParams.get("horizon") as Horizon) || "5Y";
  const setHorizon = (h: Horizon) => updateParams({ horizon: h === "5Y" ? null : h });
  const allSearch = searchParams.get("q") ?? "";
  const allAsset = searchParams.get("asset") ?? "";
  const allCategory = searchParams.get("category") ?? "";
  const starredOnly = searchParams.get("starred") === "1";

  // The search box types into local state instantly; only after a pause does it write to the URL
  // and re-run the filter/sort over the (potentially thousands-of-rows) fund table.
  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") ?? "");
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== (searchParams.get("q") ?? "")) updateParams({ q: searchInput || null });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compare basket — a transient overlay, not part of the URL-persisted view state.
  const [compareSet, setCompareSet] = useState<Set<number>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const toggleCompare = (code: number) => setCompareSet(prev => {
    const next = new Set(prev);
    if (next.has(code)) next.delete(code);
    else if (next.size < MAX_COMPARE) next.add(code);
    return next;
  });

  const [categories, setCategories] = useState<MfCategory[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState<string | null>(null);

  const [table, setTable] = useState<MfTable | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  // Load the category catalog once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setCatLoading(true); setCatError(null);
        const data = await getMfCategories();
        if (cancelled) return;
        setCategories(data);
      } catch (err) {
        if (!cancelled) setCatError(err instanceof Error ? err.message : "Failed to load categories");
      } finally {
        if (!cancelled) setCatLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch every fund's table once (the "all" view filters it client-side); skipped in "portfolio" view.
  useEffect(() => {
    if (view === "portfolio") return;
    let cancelled = false;
    (async () => {
      try {
        setTableLoading(true); setTableError(null);
        const data = await getMfTable({ horizon });
        if (!cancelled) setTable(data);
      } catch (err) {
        if (!cancelled) { setTable(null); setTableError(err instanceof Error ? err.message : "Failed to load"); }
      } finally {
        if (!cancelled) setTableLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [view, horizon, retryTick]);

  // Category-standing badges ("Top X% · 5Y CAGR" / "Top X% · 3Y Sharpe") on the fund detail page
  // come from fixed horizons, not whatever horizon the table toggle is on — so fetch those two
  // tables once per "all" visit (the api client's own cache dedupes this against the main table
  // fetch above when horizon already happens to be 5Y or 3Y).
  const [table5y, setTable5y] = useState<MfTable | null>(null);
  const [table3y, setTable3y] = useState<MfTable | null>(null);
  useEffect(() => {
    if (view === "portfolio") return;
    let cancelled = false;
    Promise.all([getMfTable({ horizon: "5Y" }), getMfTable({ horizon: "3Y" })])
      .then(([t5, t3]) => { if (!cancelled) { setTable5y(t5); setTable3y(t3); } })
      .catch(() => { if (!cancelled) { setTable5y(null); setTable3y(null); } });
    return () => { cancelled = true; };
  }, [view, retryTick]);
  const cagr5yRanks = useMemo(() => rankWithinCategory(table5y?.rows ?? [], "cagr"), [table5y]);
  const sharpe3yRanks = useMemo(() => rankWithinCategory(table3y?.rows ?? [], "sharpe"), [table3y]);
  const badgesFor = (row: MfTableRow) => {
    const badges: { key: string; label: string; rank: number; percentile: number }[] = [];
    const c5 = cagr5yRanks.get(row.schemeCode);
    if (c5) badges.push({ key: "cagr5y", label: "5Y CAGR", rank: c5.rank, percentile: c5.percentile });
    const s3 = sharpe3yRanks.get(row.schemeCode);
    if (s3) badges.push({ key: "sharpe3y", label: "3Y Sharpe", rank: s3.rank, percentile: s3.percentile });
    return badges;
  };

  // Group categories by asset class — powers the "All categories" filter dropdown.
  const grouped = useMemo(() => {
    const byAsset = new Map<string, MfCategory[]>();
    for (const c of categories) {
      if (!byAsset.has(c.assetClass)) byAsset.set(c.assetClass, []);
      byAsset.get(c.assetClass)!.push(c);
    }
    return [...byAsset.entries()]
      .sort((a, b) => assetClassRank(a[0]) - assetClassRank(b[0]))
      .map(([asset, subs]) => ({ asset, subs: subs.sort((a, b) => b.liveCount - a.liveCount) }));
  }, [categories]);

  const totalFunds = useMemo(() => categories.reduce((s, c) => s + c.liveCount, 0), [categories]);

  // Asset classes present, in display order — powers the "all Equity / Hybrid / …" filter.
  const assetClasses = useMemo(
    () => [...new Set(categories.map(c => c.assetClass))].sort((a, b) => assetClassRank(a) - assetClassRank(b)),
    [categories],
  );

  // Composite score, computed against the FULL unfiltered table so a fund's category-relative
  // percentile isn't skewed by whatever search/asset/category filter happens to be applied.
  const scores = useMemo(() => scoreMfRows(table?.rows ?? []), [table]);
  const rowsWithScore: MfTableRow[] = useMemo(() => {
    if (!table) return [];
    return table.rows.map(r => {
      const s = scores.get(r.schemeCode);
      return s ? { ...r, values: { ...r.values, score: s.score } } : r;
    });
  }, [table, scores]);

  // All-funds view: apply the search + asset-class + category + starred filters client-side.
  const allRows: MfTableRow[] = useMemo(() => {
    const q = allSearch.trim().toLowerCase();
    return rowsWithScore.filter(r =>
      (!allAsset || r.assetClass === allAsset) &&
      (!allCategory || r.subCategory === allCategory) &&
      (!starredOnly || starred.has(r.schemeCode)) &&
      (!q || r.name.toLowerCase().includes(q) || r.amc.toLowerCase().includes(q)),
    );
  }, [rowsWithScore, allSearch, allAsset, allCategory, starredOnly, starred]);

  if (catError && categories.length === 0 && !catLoading) {
    return <ErrorState message={catError} onRetry={() => window.location.reload()} />;
  }

  const HorizonSelector = (
    <Box sx={{ overflowX: "auto" }}>
      <ToggleButtonGroup exclusive size="small" value={horizon} onChange={(_, v) => { if (v) setHorizon(v); }}>
        {TABLE_HORIZONS.map(h => <ToggleButton key={h} value={h}>{h}</ToggleButton>)}
      </ToggleButtonGroup>
    </Box>
  );

  const FiltersBar = (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
      <TextField
        size="small" placeholder="Search funds or AMCs…" value={searchInput}
        onChange={e => setSearchInput(e.target.value)}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, color: colors.gray400 }} /></InputAdornment> }}
        sx={{ flex: 1 }}
      />
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <Select value={allAsset} displayEmpty
          onChange={e => updateParams({ asset: e.target.value || null, category: null })}
          renderValue={v => (v ? assetClassLabel(String(v)) : "All asset classes")}>
          <MenuItem value="">All asset classes</MenuItem>
          {assetClasses.map(a => <MenuItem key={a} value={a}>{assetClassLabel(a)}</MenuItem>)}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 190 }}>
        <Select value={allCategory} displayEmpty onChange={e => updateParams({ category: e.target.value || null })}
          renderValue={v => (v ? String(v) : "All categories")}>
          <MenuItem value="">All categories</MenuItem>
          {grouped.filter(g => !allAsset || g.asset === allAsset).flatMap(({ asset, subs }) => [
            <ListSubheader key={asset} sx={{ fontSize: "0.7rem", fontWeight: 700, color: colors.gray400, textTransform: "uppercase" }}>{assetClassLabel(asset)}</ListSubheader>,
            ...subs.map(c => <MenuItem key={c.subCategory} value={c.subCategory} sx={{ pl: 3 }}>{c.subCategory} · {c.liveCount}</MenuItem>),
          ])}
        </Select>
      </FormControl>
      <ToggleButton value="starred" selected={starredOnly} size="small"
        onChange={() => updateParams({ starred: starredOnly ? null : "1" })}
        sx={{ px: 1.5, gap: 0.5, whiteSpace: "nowrap", ...(starredOnly ? { color: "#F59E0B !important" } : {}) }}>
        <StarRoundedIcon sx={{ fontSize: 18 }} /> Starred{starred.size ? ` (${starred.size})` : ""}
      </ToggleButton>
    </Stack>
  );

  const TableArea = tableLoading ? (
    <ListSkeleton rows={8} />
  ) : tableError ? (
    <ErrorState message={tableError} onRetry={() => setRetryTick(t => t + 1)} />
  ) : !table || allRows.length === 0 ? (
    <EmptyState icon={<InsightsRoundedIcon />} title="No funds" description="No funds match your filters." />
  ) : (
    <MfFundTable
      rows={allRows}
      metrics={["score", ...table.metrics]}
      defaultSort={table.metrics[0]}
      showCategory
      selected={compareSet}
      onToggleSelect={toggleCompare}
      selectionFull={compareSet.size >= MAX_COMPARE}
      badgesFor={badgesFor}
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
          <ToggleButton value="all" sx={{ px: 1.75, gap: 0.75 }}><ViewListRoundedIcon sx={{ fontSize: 18 }} /> All funds</ToggleButton>
          <ToggleButton value="portfolio" sx={{ px: 1.75, gap: 0.75 }}><PieChartRoundedIcon sx={{ fontSize: 18 }} /> My funds</ToggleButton>
        </ToggleButtonGroup>
        {view !== "portfolio" && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>Horizon</Typography>
            {HorizonSelector}
          </Stack>
        )}
      </Stack>

      {view === "all" ? (
        <Paper sx={{ p: { xs: 1.5, sm: 2.5 } }}>
          {FiltersBar}
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            {table ? `${allRows.length.toLocaleString("en-IN")} funds · ${horizon} · tap a column to sort` : "Loading…"}
          </Typography>
          {TableArea}
        </Paper>
      ) : (
        userId != null ? <MfPortfolioPanel userId={userId} /> : null
      )}

      {/* Compare basket → floating action, opens the side-by-side dialog */}
      {compareSet.size >= 2 && (
        <Fab color="primary" variant="extended" onClick={() => setCompareOpen(true)}
          sx={{ position: "fixed", bottom: { xs: 24, sm: 32 }, right: { xs: 24, sm: 32 }, zIndex: 1200, textTransform: "none", fontWeight: 700 }}>
          <CompareArrowsRoundedIcon sx={{ mr: 1 }} /> Compare ({compareSet.size})
        </Fab>
      )}
      <MfCompareDialog schemeCodes={[...compareSet]} open={compareOpen} onClose={() => setCompareOpen(false)} />
    </Stack>
  );
}

export default MutualFunds;
