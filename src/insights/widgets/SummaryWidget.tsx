import { Box, Paper, Typography, Stack, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import { useTokens } from "../../context/ColorModeContext";
import XirrBadge from "../../components/XirrBadge";
import { formatCurrency as fmt } from "../../utils/format";
import type { SummaryMetrics } from "../../api/types";
import type { SummaryConfig } from "../types";
import type { InsightsData } from "../useInsightsData";

function Stat({ label, value, sub, color, muted }: { label: string; value: string; sub?: string; color: string; muted: string }) {
  return (
    <Box sx={{ flex: "1 1 auto", minWidth: { xs: "calc(50% - 6px)", sm: 130 }, p: { xs: 1, sm: 1.5 }, borderRadius: 2, bgcolor: alpha(color, 0.08), overflow: "hidden" }}>
      <Typography sx={{ fontSize: { xs: "0.6rem", sm: "0.65rem" }, fontWeight: 500, color: muted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>{label}</Typography>
      <Typography noWrap sx={{ fontSize: { xs: "0.85rem", sm: "1rem" }, fontWeight: 750, color }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: { xs: "0.6rem", sm: "0.65rem" }, fontWeight: 600, color, opacity: 0.8 }}>{sub}</Typography>}
    </Box>
  );
}

export default function SummaryWidget({ config, data }: { config: SummaryConfig; data: InsightsData }) {
  const theme = useTheme();
  const { colors } = useTokens();
  const isDark = theme.palette.mode === "dark";

  const s: SummaryMetrics | undefined = config.entityType === "watchlist"
    ? (config.entityId === 0 ? data.allWatchlist ?? undefined : data.watchlists.find(w => w.id === config.entityId))
    : data.accounts.find(a => a.id === config.entityId);

  if (!s) {
    return (
      <Paper sx={{ p: 3, borderRadius: 3, height: "100%" }}>
        <Typography color="text.secondary" sx={{ fontSize: "0.85rem" }}>No summary available for this selection.</Typography>
      </Paper>
    );
  }

  const ccy = s.displayCurrency;
  const gainPct = s.invested > 0 ? (s.gain / s.invested) * 100 : 0;
  const dayPct = s.previousDayValue > 0 ? (s.dayChange / s.previousDayValue) * 100 : 0;
  const success = isDark ? "#34D399" : colors.success;
  const error = isDark ? "#F87171" : colors.error;
  const invColor = isDark ? "#60A5FA" : colors.brand;
  const muted = colors.gray400;

  return (
    <Paper sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3, height: "100%", borderLeft: `4px solid ${colors.brand}` }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: 1.5, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: alpha(colors.brand, 0.1), color: colors.brand }}>
          <AccountBalanceWalletRoundedIcon sx={{ fontSize: 18 }} />
        </Box>
        <Typography sx={{ fontSize: "0.9rem", fontWeight: 700, color: colors.gray500 }}>{config.label}</Typography>
        <Box sx={{ flex: 1 }} />
        <XirrBadge value={s.xirr} size="lg" />
      </Stack>

      <Box sx={{ px: 2, py: 1.5, borderRadius: 2, bgcolor: alpha(colors.gray400, 0.08), display: "inline-block", mb: 2 }}>
        <Typography sx={{ fontSize: "0.7rem", fontWeight: 500, color: muted, textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.25 }}>Total Value</Typography>
        <Typography sx={{ fontSize: { xs: "1.6rem", sm: "2rem" }, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, color: colors.gray800 }}>{fmt(s.currentDayValue, ccy)}</Typography>
      </Box>

      <Stack direction="row" sx={{ gap: { xs: 0.75, sm: 1.5 }, flexWrap: "wrap" }}>
        <Stat label="Invested" value={fmt(s.invested, ccy)} color={invColor} muted={muted} />
        {s.invested > 0 && (
          <Stat label="Total P&L" value={`${s.gain >= 0 ? "+" : ""}${fmt(s.gain, ccy)}`} sub={`${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(2)}%`} color={s.gain >= 0 ? success : error} muted={muted} />
        )}
        <Stat label="Today" value={`${s.dayChange >= 0 ? "+" : ""}${fmt(s.dayChange, ccy)}`} sub={`${dayPct >= 0 ? "+" : ""}${dayPct.toFixed(2)}%`} color={s.dayChange >= 0 ? success : error} muted={muted} />
      </Stack>
    </Paper>
  );
}
