import { Box, Chip, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import { useTokens } from "../context/ColorModeContext";

/** The category-standing fields shared by MfPortfolioHolding — enough to draw the "Top X%" badge. */
export interface MfRankInfo {
  rank: number | null;
  percentile: number | null;
  peerCount: number | null;
  rankHorizon: string | null;
  rankCagr: number | null;
}

/**
 * The same category-rank badge shown on "My funds": a "Top X%" chip (gold + trophy when the fund is
 * top-3 or top-decile), with the exact rank and CAGR in its tooltip. Renders nothing when the fund
 * has no standing (too little history to rank). `showSub` adds the "#rank of peers · horizon" line.
 */
export default function MfRankBadge({ info, showSub = false }: { info: MfRankInfo; showSub?: boolean }) {
  const { colors } = useTokens();
  if (info.percentile == null) return null;

  const topPct = Math.max(1, Math.round(100 - info.percentile));
  const strong = info.percentile >= 90 || (info.rank != null && info.rank <= 3);
  const badgeColor = strong ? "#F59E0B" : colors.brand;

  return (
    <Box sx={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 0.15 }}>
      <Tooltip title={`Rank ${info.rank} of ${info.peerCount} · ${info.rankHorizon ?? ""} CAGR ${info.rankCagr == null ? "—" : (info.rankCagr * 100).toFixed(1) + "%"}`}>
        <Chip size="small" icon={strong ? <EmojiEventsRoundedIcon sx={{ fontSize: 14 }} /> : undefined}
          label={`Top ${topPct}%`}
          sx={{ height: 20, fontWeight: 700, fontSize: "0.68rem", bgcolor: alpha(badgeColor, 0.12), color: badgeColor, "& .MuiChip-icon": { color: badgeColor } }} />
      </Tooltip>
      {showSub && info.rank != null && (
        <Typography sx={{ fontSize: "0.62rem", color: colors.gray400 }}>
          #{info.rank} of {info.peerCount} · {info.rankHorizon} CAGR
        </Typography>
      )}
    </Box>
  );
}
