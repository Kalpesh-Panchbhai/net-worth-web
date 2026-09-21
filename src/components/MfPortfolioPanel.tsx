import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, Stack, Chip, LinearProgress, Tooltip,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { getMfPortfolio } from "../api/client";
import type { MfPortfolio, MfPortfolioHolding } from "../api/types";
import { EmptyState, ErrorState, ListSkeleton } from "./shared";
import { useTokens } from "../context/ColorModeContext";
import { assetClassLabel, assetClassRank } from "../utils/mfMetrics";

function inr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function groupSum(holdings: MfPortfolioHolding[], keyFn: (h: MfPortfolioHolding) => string) {
  const m = new Map<string, number>();
  for (const h of holdings) m.set(keyFn(h), (m.get(keyFn(h)) ?? 0) + h.currentValue);
  return [...m.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
}

export default function MfPortfolioPanel({ userId }: { userId: number }) {
  const navigate = useNavigate();
  const { colors, shadow } = useTokens();
  const [pf, setPf] = useState<MfPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    getMfPortfolio(userId)
      .then(d => { if (!cancelled) setPf(d); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  const ranked = useMemo(
    () => (pf ? [...pf.holdings].sort((a, b) => (b.percentile ?? -1) - (a.percentile ?? -1)) : []),
    [pf],
  );
  const byAsset = useMemo(() => (pf ? groupSum(pf.holdings, h => h.assetClass).sort((a, b) => assetClassRank(a.key) - assetClassRank(b.key)) : []), [pf]);
  const bySub = useMemo(() => (pf ? groupSum(pf.holdings, h => h.subCategory) : []), [pf]);
  const byAmc = useMemo(() => (pf ? groupSum(pf.holdings, h => h.amc) : []), [pf]);

  if (loading) return <ListSkeleton rows={8} />;
  if (error) return <ErrorState message={error} onRetry={() => setPf(p => p)} />;
  if (!pf || pf.holdings.length === 0) {
    return <EmptyState icon={<EmojiEventsRoundedIcon />} title="No mutual funds found"
      description="Sync a broker or add mutual-fund holdings to see how they rank and their allocation." />;
  }

  const gain = pf.totalValue - pf.totalInvested;
  const gainPct = pf.totalInvested > 0 ? (gain / pf.totalInvested) * 100 : 0;
  const total = pf.totalValue || 1;

  const Bar = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.25 }}>
        <Typography sx={{ fontSize: "0.8rem", fontWeight: 600 }} noWrap>{label}</Typography>
        <Typography sx={{ fontSize: "0.75rem", color: colors.gray500, whiteSpace: "nowrap", ml: 1 }}>
          {((value / total) * 100).toFixed(1)}% · {inr(value)}
        </Typography>
      </Box>
      <LinearProgress variant="determinate" value={Math.min(100, (value / total) * 100)}
        sx={{ height: 6, borderRadius: 3, bgcolor: alpha(color, 0.12), "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 3 } }} />
    </Box>
  );

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      {/* Summary */}
      <Paper sx={{ p: { xs: 1.5, sm: 2 }, display: "flex", flexWrap: "wrap", gap: { xs: 2, sm: 4 } }}>
        {[
          { label: "Funds", value: String(pf.holdings.length) },
          { label: "Invested", value: inr(pf.totalInvested) },
          { label: "Current value", value: inr(pf.totalValue) },
          { label: "Gain", value: `${gain >= 0 ? "+" : ""}${inr(gain)} (${gainPct.toFixed(1)}%)`, color: gain >= 0 ? colors.success : colors.error },
        ].map(s => (
          <Box key={s.label}>
            <Typography sx={{ fontSize: "0.62rem", fontWeight: 600, color: colors.gray400, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</Typography>
            <Typography sx={{ fontSize: "1.05rem", fontWeight: 750, color: (s as any).color ?? colors.gray900, fontVariantNumeric: "tabular-nums" }}>{s.value}</Typography>
          </Box>
        ))}
      </Paper>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.4fr 1fr" }, gap: 2, alignItems: "start" }}>
        {/* How my funds rank */}
        <Paper sx={{ p: { xs: 1.5, sm: 2.5 } }}>
          <Typography variant="subtitle1" sx={{ mb: 0.5 }}>How my funds rank</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            Each fund's standing in its category on 5-year CAGR — where your pick sits among its peers.
          </Typography>
          <Stack spacing={0.75}>
            {ranked.map(h => {
              const topPct = h.percentile == null ? null : Math.max(1, Math.round(100 - h.percentile));
              const strong = h.percentile != null && (h.percentile >= 90 || (h.rank != null && h.rank <= 3));
              const badgeColor = strong ? "#F59E0B" : colors.brand;
              return (
                <Box key={h.schemeCode} onClick={() => navigate(`/mutual-funds/${h.schemeCode}`)}
                  sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 1.25, py: 1, borderRadius: 2, cursor: "pointer", border: `1px solid ${colors.gray200}`, transition: "all .15s", "&:hover": { borderColor: alpha(colors.brand, 0.5), boxShadow: shadow.sm } }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: "0.83rem", fontWeight: 600 }} noWrap>{h.name}</Typography>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }} alignItems="center">
                      <Chip label={h.subCategory} size="small" sx={{ height: 18, fontSize: "0.62rem", fontWeight: 600, bgcolor: colors.gray100, color: colors.gray500 }} />
                      <Typography variant="caption" color="text.secondary">{inr(h.currentValue)}</Typography>
                    </Stack>
                  </Box>
                  <Box sx={{ textAlign: "right", minWidth: 96 }}>
                    {topPct == null ? (
                      <Typography variant="caption" color="text.secondary">Not ranked</Typography>
                    ) : (
                      <Tooltip title={`Rank ${h.rank} of ${h.peerCount} · 5Y CAGR ${h.cagr5y == null ? "—" : (h.cagr5y * 100).toFixed(1) + "%"}`}>
                        <Chip size="small" icon={strong ? <EmojiEventsRoundedIcon sx={{ fontSize: 14 }} /> : undefined}
                          label={`Top ${topPct}%`}
                          sx={{ height: 22, fontWeight: 700, bgcolor: alpha(badgeColor, 0.12), color: badgeColor, "& .MuiChip-icon": { color: badgeColor } }} />
                      </Tooltip>
                    )}
                    <Typography variant="caption" sx={{ display: "block", color: colors.gray400 }}>
                      {h.rank != null ? `#${h.rank} of ${h.peerCount}` : ""}
                    </Typography>
                  </Box>
                  <ChevronRightRoundedIcon sx={{ color: colors.gray400, fontSize: 20 }} />
                </Box>
              );
            })}
          </Stack>
        </Paper>

        {/* Portfolio X-ray */}
        <Paper sx={{ p: { xs: 1.5, sm: 2.5 } }}>
          <Typography variant="subtitle1" sx={{ mb: 1.5 }}>Portfolio X-ray</Typography>
          <Typography variant="overline" sx={{ color: colors.gray400 }}>By asset class</Typography>
          <Box sx={{ mt: 0.5, mb: 2 }}>
            {byAsset.map(g => <Bar key={g.key} label={assetClassLabel(g.key)} value={g.value} color={colors.brand} />)}
          </Box>
          <Typography variant="overline" sx={{ color: colors.gray400 }}>By category</Typography>
          <Box sx={{ mt: 0.5, mb: 2 }}>
            {bySub.slice(0, 8).map(g => <Bar key={g.key} label={g.key} value={g.value} color={colors.accent} />)}
          </Box>
          <Typography variant="overline" sx={{ color: colors.gray400 }}>Top AMCs</Typography>
          <Box sx={{ mt: 0.5 }}>
            {byAmc.slice(0, 6).map(g => <Bar key={g.key} label={g.key.split(" ").slice(0, 2).join(" ")} value={g.value} color={colors.success} />)}
          </Box>
        </Paper>
      </Box>
    </Stack>
  );
}
