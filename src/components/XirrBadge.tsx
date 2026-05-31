import { Box } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";

type Size = "sm" | "md" | "lg";

export default function XirrBadge({ value, size = "md" }: { value: number | null; size?: Size }) {
  const theme = useTheme();
  if (value == null || !isFinite(value)) return null;
  const isDark = theme.palette.mode === "dark";
  const pct = value * 100;
  const positive = pct >= 0;
  const color = positive ? (isDark ? "#34D399" : "#16A34A") : (isDark ? "#F87171" : "#DC2626");
  const fontMap: Record<Size, number> = { sm: 10, md: 11.5, lg: 13 };
  const padMap: Record<Size, { px: number; py: number }> = { sm: { px: 0.75, py: 0.2 }, md: { px: 1, py: 0.3 }, lg: { px: 1.25, py: 0.4 } };
  const iconMap: Record<Size, number> = { sm: 11, md: 13, lg: 15 };
  return (
    <Box
      sx={{
        display: "inline-flex", alignItems: "center", gap: 0.4,
        px: padMap[size].px, py: padMap[size].py,
        borderRadius: 999,
        bgcolor: alpha(color, isDark ? 0.18 : 0.12),
        border: `1px solid ${alpha(color, isDark ? 0.35 : 0.25)}`,
        fontSize: fontMap[size],
        fontWeight: 750, color, whiteSpace: "nowrap",
        letterSpacing: "0.01em", lineHeight: 1,
      }}
    >
      {positive
        ? <TrendingUpRoundedIcon sx={{ fontSize: iconMap[size] }} />
        : <TrendingDownRoundedIcon sx={{ fontSize: iconMap[size] }} />}
      <Box component="span" sx={{ fontSize: fontMap[size] - 1.5, fontWeight: 800, opacity: 0.85, mr: 0.15 }}>XIRR</Box>
      <Box component="span">{positive ? "+" : ""}{pct.toFixed(2)}%</Box>
    </Box>
  );
}
