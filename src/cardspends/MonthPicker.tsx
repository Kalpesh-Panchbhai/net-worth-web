import { useEffect, useState } from "react";
import { Box, ButtonBase, IconButton, Popover, Skeleton, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { useTokens } from "../context/ColorModeContext";
import { getCardSpends } from "../api/client";
import { fmtShort } from "./model";
import { monthKey, monthLabel, shiftMonth } from "./model";

/** Months shown in the grid, ending with the current one. */
const GRID_MONTHS = 12;

/**
 * ◀ October 2026 ▶. Tapping the name opens the last year as a grid with each month's spend, which
 * doubles as a quick year view; months over budget are tinted.
 */
export default function MonthPicker({ userId, month, onChange, budget, currency }: {
  userId: number | null;
  month: string;
  onChange: (m: string) => void;
  budget: number | null;
  currency: string;
}) {
  const { colors } = useTokens();
  const current = monthKey(new Date());
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [totals, setTotals] = useState<Record<string, number> | null>(null);

  const months = Array.from({ length: GRID_MONTHS }, (_, i) => shiftMonth(current, i - GRID_MONTHS + 1));

  // Loaded on each open (the API client caches them), so edits made since show up.
  useEffect(() => {
    if (!anchor || !userId || totals) return;
    let cancelled = false;
    Promise.all(months.map(m => getCardSpends(userId, m).then(s => [m, s.spent] as const).catch(() => [m, NaN] as const)))
      .then(rows => { if (!cancelled) setTotals(Object.fromEntries(rows)); });
    return () => { cancelled = true; };
  }, [anchor, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const max = totals ? Math.max(1, ...Object.values(totals).filter(Number.isFinite)) : 1;

  return (
    <Stack direction="row" alignItems="center" spacing={0.5}>
      <IconButton size="small" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeftRoundedIcon /></IconButton>
      <ButtonBase onClick={e => setAnchor(e.currentTarget)} aria-haspopup="dialog" aria-label={`${monthLabel(month)}, pick a month`}
        sx={{ borderRadius: 2, px: 1, py: 0.5, "&:hover": { bgcolor: colors.gray50 } }}>
        <Typography sx={{ fontWeight: 700, fontSize: "1.05rem", minWidth: 128, textAlign: "center" }}>{monthLabel(month)}</Typography>
        <ExpandMoreRoundedIcon sx={{ fontSize: 18, color: colors.gray400 }} />
      </ButtonBase>
      <IconButton size="small" onClick={() => onChange(shiftMonth(month, 1))} disabled={month >= current} aria-label="Next month"><ChevronRightRoundedIcon /></IconButton>

      <Popover open={!!anchor} anchorEl={anchor} onClose={() => { setAnchor(null); setTotals(null); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }} PaperProps={{ sx: { p: 1.5, borderRadius: 3, width: 320, maxWidth: "calc(100vw - 32px)" } }}>
        <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: colors.gray500, px: 0.5, mb: 1 }}>Last 12 months</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0.75 }}>
          {months.map(m => {
            const total = totals?.[m];
            const over = budget != null && total != null && total > budget;
            const selected = m === month;
            return (
              <ButtonBase key={m} onClick={() => { onChange(m); setAnchor(null); setTotals(null); }}
                sx={{
                  flexDirection: "column", alignItems: "stretch", borderRadius: 2, p: 1, textAlign: "left",
                  border: `1px solid ${selected ? colors.brand : colors.gray100}`,
                  bgcolor: selected ? alpha(colors.brand, 0.08) : over ? alpha(colors.error, 0.05) : "transparent",
                  "&:hover": { borderColor: colors.brand },
                }}>
                <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, color: colors.gray500 }}>
                  {monthLabel(m, "short")}{m.slice(0, 4) !== current.slice(0, 4) ? ` ${m.slice(2, 4)}` : ""}
                </Typography>
                {totals == null ? <Skeleton width="70%" /> : (
                  <Typography sx={{ fontSize: "0.82rem", fontWeight: 700, color: over ? colors.error : colors.gray800, fontVariantNumeric: "tabular-nums" }}>
                    {total != null && Number.isFinite(total) ? fmtShort(total, currency) : "—"}
                  </Typography>
                )}
                <Box sx={{ height: 3, borderRadius: 2, bgcolor: colors.gray100, mt: 0.5 }}>
                  <Box sx={{ height: "100%", borderRadius: 2, bgcolor: over ? colors.error : colors.brand, width: `${total && Number.isFinite(total) ? (total / max) * 100 : 0}%` }} />
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
      </Popover>
    </Stack>
  );
}
