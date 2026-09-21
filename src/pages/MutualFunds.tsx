import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, Stack, TextField, InputAdornment, MenuItem,
  ToggleButton, ToggleButtonGroup, Chip, Avatar, Select, FormControl,
  useMediaQuery, useTheme, Tooltip, CircularProgress,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { getMfCategories, getMfLeaderboard } from "../api/client";
import type { MfCategory, MfLeaderboard } from "../api/types";
import { PageHeader, EmptyState, ErrorState, ListSkeleton } from "../components/shared";
import { useTokens } from "../context/ColorModeContext";
import {
  LEADERBOARD_METRICS, HORIZONS, horizonsFor, metricMeta, formatMetricValue,
  isSignedMetric, assetClassLabel, assetClassRank, type Horizon,
} from "../utils/mfMetrics";

// Prefer opening on a category people actually search for, when it exists.
const PREFERRED_DEFAULTS = ["Large Cap", "Flexi Cap", "Mid Cap"];

function rankColor(rank: number, fallback: string): string {
  return rank === 1 ? "#F59E0B" : rank === 2 ? "#94A3B8" : rank === 3 ? "#B45309" : fallback;
}

function MutualFunds() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { colors, shadow } = useTokens();
  const isDark = theme.palette.mode === "dark";

  const [categories, setCategories] = useState<MfCategory[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState<string | null>(null);
  const [catSearch, setCatSearch] = useState("");

  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  const [metric, setMetric] = useState("cagr");
  const [horizon, setHorizon] = useState<Horizon>("5Y");

  const [board, setBoard] = useState<MfLeaderboard | null>(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);

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

  // Keep the horizon valid for the chosen metric (e.g. SI has no meaning for volatility).
  useEffect(() => {
    const allowed = horizonsFor(metric);
    if (!allowed.includes(horizon)) setHorizon(allowed.includes("5Y") ? "5Y" : allowed[0]);
  }, [metric]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch the leaderboard whenever the category / metric / horizon changes.
  useEffect(() => {
    if (!selectedSub) return;
    let cancelled = false;
    (async () => {
      try {
        setBoardLoading(true); setBoardError(null);
        const data = await getMfLeaderboard({ subCategory: selectedSub, metric, horizon, limit: 50 });
        if (!cancelled) setBoard(data);
      } catch (err) {
        if (!cancelled) { setBoard(null); setBoardError(err instanceof Error ? err.message : "Failed to load"); }
      } finally {
        if (!cancelled) setBoardLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSub, metric, horizon]);

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

  const meta = metricMeta(metric);
  const totalFunds = useMemo(() => categories.reduce((s, c) => s + c.liveCount, 0), [categories]);

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

  const allowedHorizons = horizonsFor(metric);

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      <PageHeader title="Mutual Fund Analyzer" action={
        !catLoading && totalFunds > 0 ? (
          <Chip icon={<InsightsRoundedIcon />} label={`${totalFunds.toLocaleString("en-IN")} Direct-Growth funds`}
            sx={{ fontWeight: 600, bgcolor: alpha(colors.brand, 0.1), color: colors.brand }} />
        ) : undefined
      } />

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "300px 1fr" }, gap: 2, alignItems: "start" }}>
        {/* Category selector — a sidebar on desktop, a dropdown on mobile. */}
        {isMobile ? (
          <FormControl fullWidth size="small">
            <Select
              value={selectedSub ?? ""}
              displayEmpty
              onChange={e => setSelectedSub(e.target.value)}
              renderValue={v => v ? String(v) : "Select a category"}
            >
              {grouped.flatMap(({ asset, subs }) => [
                <MenuItem key={asset} disabled sx={{ opacity: "1 !important", fontSize: "0.7rem", fontWeight: 700, color: colors.gray400, textTransform: "uppercase" }}>{assetClassLabel(asset)}</MenuItem>,
                ...subs.map(c => <MenuItem key={c.subCategory} value={c.subCategory} sx={{ pl: 3 }}>{c.subCategory} · {c.liveCount}</MenuItem>),
              ])}
            </Select>
          </FormControl>
        ) : (
          <Box sx={{ position: "sticky", top: 16, height: "calc(100vh - 120px)" }}>{CategoryPanel}</Box>
        )}

        {/* Leaderboard */}
        <Box sx={{ minWidth: 0 }}>
          <Paper sx={{ p: { xs: 1.5, sm: 2.5 } }}>
            {/* Header + controls */}
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }} spacing={1.5} sx={{ mb: 2 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" noWrap>{selectedSub ?? "Select a category"}</Typography>
                {board && (
                  <Typography variant="caption" color="text.secondary">
                    Ranking {board.ranked} of {board.peerCount} funds · {board.higherIsBetter ? "higher is better" : "lower is better"}
                  </Typography>
                )}
              </Box>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <FormControl size="small" sx={{ minWidth: 190 }}>
                  <Select value={metric} onChange={e => setMetric(e.target.value)}>
                    {LEADERBOARD_METRICS.map(code => (
                      <MenuItem key={code} value={code}>{metricMeta(code).label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            </Stack>

            {/* Horizon selector */}
            <Box sx={{ mb: 2, overflowX: "auto" }}>
              <ToggleButtonGroup exclusive size="small" value={horizon}
                onChange={(_, v) => { if (v) setHorizon(v); }}>
                {HORIZONS.filter(h => allowedHorizons.includes(h)).map(h => (
                  <ToggleButton key={h} value={h}>{h}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            <Tooltip title={meta.help} placement="top-start">
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, display: "inline-flex" }}>
                {meta.label} · {horizon === "SI" ? "since inception" : horizon}
              </Typography>
            </Tooltip>

            {boardLoading ? (
              <ListSkeleton rows={8} />
            ) : boardError ? (
              <ErrorState message={boardError} onRetry={() => setSelectedSub(s => s)} />
            ) : !board || board.entries.length === 0 ? (
              <EmptyState icon={<InsightsRoundedIcon />} title="No rankings"
                description={`No fund in ${selectedSub ?? "this category"} has enough history for ${meta.short} over ${horizon}.`} />
            ) : (
              <Stack spacing={0.75}>
                {board.entries.map(e => {
                  const signed = isSignedMetric(metric);
                  const valColor = !signed ? colors.brand : e.value >= 0 ? colors.success : colors.error;
                  const badge = rankColor(e.rank, colors.gray400);
                  return (
                    <Box
                      key={e.schemeCode}
                      onClick={() => navigate(`/mutual-funds/${e.schemeCode}`)}
                      sx={{
                        display: "flex", alignItems: "center", gap: 1.5, px: { xs: 1.25, sm: 1.75 }, py: 1.25,
                        borderRadius: 2, cursor: "pointer", border: `1px solid ${colors.gray200}`,
                        transition: "all 0.15s ease",
                        "&:hover": { borderColor: alpha(colors.brand, 0.5), boxShadow: shadow.sm, transform: "translateX(2px)" },
                      }}
                    >
                      <Avatar sx={{ width: 30, height: 30, fontSize: "0.8rem", fontWeight: 700, bgcolor: alpha(badge, 0.15), color: badge }}>
                        {e.rank <= 3 ? <EmojiEventsRoundedIcon sx={{ fontSize: 17 }} /> : e.rank}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: "0.85rem", fontWeight: 600, lineHeight: 1.3 }} noWrap>{e.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{e.amc}</Typography>
                      </Box>
                      <Typography sx={{ fontSize: "0.95rem", fontWeight: 750, color: valColor, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {formatMetricValue(metric, e.value)}
                      </Typography>
                      <ChevronRightRoundedIcon sx={{ color: colors.gray400, fontSize: 20 }} />
                    </Box>
                  );
                })}
                {catLoading && <CircularProgress size={20} sx={{ alignSelf: "center", mt: 1 }} />}
              </Stack>
            )}
          </Paper>
        </Box>
      </Box>
    </Stack>
  );
}

export default MutualFunds;
