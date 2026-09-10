import { memo, useMemo, useRef, useState } from "react";
import { Box, Paper, Typography, Stack, ToggleButton, ToggleButtonGroup, useTheme, useMediaQuery } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import DonutLargeRoundedIcon from "@mui/icons-material/DonutLargeRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { useTokens } from "../context/ColorModeContext";
import { formatCurrency as fmt, formatCurrencyCompact as fmtCompact } from "../utils/format";
import { EmptyState } from "./shared";

/** Slices beyond this are collapsed into a single "Other" wedge to keep the donut readable. */
const MAX_SLICES = 6;
const OTHER_KEY = "__other__";

type Metric = "value" | "invested";
const METRICS: { id: Metric; label: string }[] = [
  { id: "value", label: "Value" },
  { id: "invested", label: "Invested" },
];

/** Any summary-shaped record works: accounts, holdings, etc. */
export interface AllocationItem {
  currentDayValue: number;
  invested: number;
  displayCurrency: string;
}

export interface AllocationGrouping<T> {
  /** Stable id used as the toggle value. */
  id: string;
  /** Toggle button label. */
  label: string;
  /** Group key for an item (the raw bucket key). */
  keyOf: (item: T) => string;
  /** Display label for a bucket key; defaults to the key itself. */
  labelOf?: (key: string) => string;
  /** "type" colors by the theme's per-type palette; otherwise the accent palette cycles. */
  colorBy?: "type" | "palette";
}

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Members folded into the "Other" wedge, so its panel can list them instead of hiding them. */
  children?: { label: string; value: number }[];
}

interface AllocationBreakdownProps<T extends AllocationItem> {
  items: T[];
  /** Fallback currency; the dominant display currency of the items wins when present. */
  currency: string;
  /** One or more ways to group; a toggle is shown only when there is more than one. */
  groupings: AllocationGrouping<T>[];
  title?: string;
  /** Noun for the "Other" hint / empty state, e.g. "accounts" or "holdings". */
  itemNoun?: string;
}

function AllocationBreakdown<T extends AllocationItem>({ items, currency, groupings, title = "Allocation", itemNoun = "items" }: AllocationBreakdownProps<T>) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, typeColors, accentPalette, shadow } = useTokens();
  const [groupingId, setGroupingId] = useState(groupings[0]?.id);
  const grouping = groupings.find(g => g.id === groupingId) ?? groupings[0];
  const [metric, setMetric] = useState<Metric>("value");
  // The "Other" wedge's members are revealed in a panel pinned inside the card. A short close delay
  // lets the cursor travel from the slice/legend onto the (scrollable) panel without it flickering shut.
  const [otherOpen, setOtherOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openOther = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } setOtherOpen(true); };
  const closeOther = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOtherOpen(false), 140); };

  const { slices, total, ccy } = useMemo(() => {
    // Amounts are only comparable within one currency (a row with no FX rate keeps its native one),
    // so allocate inside the dominant display currency and label the card with it.
    const valueOf = (a: T) => metric === "invested" ? a.invested : a.currentDayValue;

    const counts = new Map<string, number>();
    for (const a of items) counts.set(a.displayCurrency, (counts.get(a.displayCurrency) ?? 0) + 1);
    let ccy = currency, most = 0;
    for (const [code, n] of counts) if (n > most) { ccy = code; most = n; }

    // Allocation is over positive amounts only (a loan/credit balance can't be a slice of a pie).
    const rows = items.filter(a => a.displayCurrency === ccy && valueOf(a) > 0);
    const map = new Map<string, number>();
    for (const a of rows) {
      const key = grouping.keyOf(a);
      map.set(key, (map.get(key) ?? 0) + valueOf(a));
    }

    const labelFor = grouping.labelOf ?? ((key: string) => key);
    const sorted = [...map.entries()]
      .map(([key, value]) => ({ key, value, label: labelFor(key) }))
      .sort((a, b) => b.value - a.value);

    const total = sorted.reduce((s, e) => s + e.value, 0);
    const slices: Slice[] = sorted.slice(0, MAX_SLICES - (sorted.length > MAX_SLICES ? 1 : 0))
      .map((e, i) => ({
        key: e.key, value: e.value, label: e.label,
        color: grouping.colorBy === "type" ? (typeColors[e.key] ?? colors.gray400) : accentPalette[i % accentPalette.length],
      }));
    if (sorted.length > MAX_SLICES) {
      const tail = sorted.slice(MAX_SLICES - 1);
      slices.push({
        key: OTHER_KEY, label: "Other",
        value: tail.reduce((s, e) => s + e.value, 0),
        color: colors.gray400,
        children: tail.map(e => ({ label: e.label, value: e.value })),
      });
    }
    return { slices, total, ccy };
  }, [items, grouping, metric, currency, colors.gray400, typeColors, accentPalette]);

  const otherSlice = slices.find(s => (s.children?.length ?? 0) > 0);
  const otherPct = otherSlice && total > 0 ? (otherSlice.value / total) * 100 : 0;
  // Allocation amounts always show 2-decimal precision (e.g. ₹18,00,000.00), even for round values.
  const money = (v: number) => fmt(v, ccy, { maxDecimals: 2 });

  const toggleSx = {
    "& .MuiToggleButton-root": {
      px: { xs: 0.9, sm: 1.5 }, py: { xs: 0.2, sm: 0.3 },
      fontSize: { xs: "0.65rem", sm: "0.7rem" }, fontWeight: 700,
      border: `1px solid ${colors.gray200}`, color: colors.gray500,
      "&.Mui-selected": {
        bgcolor: alpha(colors.brand, 0.1), color: colors.brand,
        borderColor: alpha(colors.brand, 0.3),
        "&:hover": { bgcolor: alpha(colors.brand, 0.15) },
      },
    },
  } as const;

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, position: "relative", overflow: "hidden" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
        <Typography sx={{ fontWeight: 700, fontSize: "0.95rem" }}>{title}</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="flex-end">
          <ToggleButtonGroup value={metric} exclusive onChange={(_e, v) => { if (v) setMetric(v); }} size="small" sx={toggleSx}>
            {METRICS.map(m => <ToggleButton key={m.id} value={m.id}>{m.label}</ToggleButton>)}
          </ToggleButtonGroup>
          {groupings.length > 1 && (
            <ToggleButtonGroup value={groupingId} exclusive onChange={(_e, v) => { if (v) setGroupingId(v); }} size="small" sx={toggleSx}>
              {groupings.map(g => <ToggleButton key={g.id} value={g.id}>{g.label}</ToggleButton>)}
            </ToggleButtonGroup>
          )}
        </Stack>
      </Stack>

      {slices.length === 0 ? (
        <EmptyState
          icon={<DonutLargeRoundedIcon />}
          title="No allocation data"
          description={`No positive-value ${itemNoun} to break down for this selection.`}
        />
      ) : (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 2, sm: 3 }} alignItems="center">
          <Box sx={{ position: "relative", width: compact ? 200 : 224, height: compact ? 200 : 224, flexShrink: 0 }}>
            {/* Chart sits above the center label so its tooltip is never covered by "Total". */}
            <Box sx={{ position: "absolute", inset: 0, zIndex: 2 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices} dataKey="value" nameKey="label" cx="50%" cy="50%"
                  innerRadius={compact ? 62 : 70} outerRadius={compact ? 94 : 104}
                  paddingAngle={slices.length > 1 ? 2 : 0} stroke="none"
                  isAnimationActive animationDuration={600} animationEasing="ease-out"
                  onMouseEnter={(d: { key?: string }) => { if (d?.key === OTHER_KEY) openOther(); else closeOther(); }}
                  onMouseLeave={closeOther}
                >
                  {slices.map(s => <Cell key={s.key} fill={s.color} />)}
                </Pie>
                <Tooltip
                  cursor={false}
                  wrapperStyle={{ zIndex: 10, pointerEvents: "none" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const s = payload[0].payload as Slice;
                    const pct = total > 0 ? (s.value / total) * 100 : 0;
                    return (
                      <Box sx={{ bgcolor: colors.white, border: `1px solid ${colors.gray200}`, borderRadius: 2, boxShadow: shadow.md, px: 1.5, py: 1, maxWidth: 220 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
                          <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: s.color }} />
                          <Typography sx={{ fontSize: 12, fontWeight: 700, color: colors.gray700 }}>{s.label}</Typography>
                        </Stack>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: colors.gray600 }}>
                          {money(s.value)} <Typography component="span" sx={{ fontSize: 11, fontWeight: 600, color: s.color }}>· {pct.toFixed(1)}%</Typography>
                        </Typography>
                        {s.children && s.children.length > 0 && (
                          <Typography sx={{ fontSize: 10.5, color: colors.gray400, mt: 0.5 }}>
                            {s.children.length} {itemNoun} — see list
                          </Typography>
                        )}
                      </Box>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            </Box>
            <Box sx={{ position: "absolute", inset: 0, zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <Typography sx={{ fontSize: 10, fontWeight: 600, color: colors.gray400, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total</Typography>
              <Typography sx={{ fontSize: compact ? 15 : 17, fontWeight: 800, color: colors.gray800, letterSpacing: "-0.02em" }}>{fmtCompact(total, ccy)}</Typography>
            </Box>
          </Box>

          <Stack spacing={0.75} sx={{ flex: 1, width: "100%", minWidth: 0 }}>
            {slices.map(s => {
              const pct = total > 0 ? (s.value / total) * 100 : 0;
              const hasChildren = !!s.children?.length;
              return (
                <Box
                  key={s.key}
                  onMouseEnter={hasChildren ? openOther : undefined}
                  onMouseLeave={hasChildren ? closeOther : undefined}
                  sx={{ display: "flex", alignItems: "center", gap: 1, cursor: hasChildren ? "pointer" : "default" }}
                >
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: s.color, flexShrink: 0 }} />
                  <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, color: colors.gray600, flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 0.25 }}>
                    {s.label}
                    {hasChildren && (
                      <ExpandMoreRoundedIcon sx={{ fontSize: 16, color: colors.gray400, transition: "transform 0.2s", transform: otherOpen ? "rotate(180deg)" : "none" }} />
                    )}
                  </Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: colors.gray800, whiteSpace: "nowrap" }}>{money(s.value)}</Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: s.color, minWidth: 46, textAlign: "right" }}>{pct.toFixed(1)}%</Typography>
                </Box>
              );
            })}
          </Stack>
        </Stack>
      )}

      {/* Detail for the collapsed "Other" wedge. Absolutely positioned and clipped to the card
          (overflow:hidden on the Paper), so it never spills outside the allocation window; the inner
          list scrolls when it's taller than the card. */}
      {otherSlice && (
        <Box
          onMouseEnter={openOther}
          onMouseLeave={closeOther}
          sx={{
            position: "absolute", top: 12, right: 12,
            width: { xs: "calc(100% - 24px)", sm: 300 },
            maxHeight: "calc(100% - 24px)",
            display: "flex", flexDirection: "column", minHeight: 0,
            bgcolor: colors.white, border: `1px solid ${colors.gray200}`, borderRadius: 2.5,
            boxShadow: shadow.lg, p: 1.5, zIndex: 20,
            pointerEvents: otherOpen ? "auto" : "none",
            opacity: otherOpen ? 1 : 0,
            visibility: otherOpen ? "visible" : "hidden",
            transform: otherOpen ? "translateY(0)" : "translateY(-4px)",
            transition: "opacity 0.15s ease, transform 0.15s ease, visibility 0.15s",
          }}>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75, flexShrink: 0 }}>
            <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: otherSlice.color }} />
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: colors.gray700 }}>Other</Typography>
            <Box sx={{ flex: 1 }} />
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: colors.gray600 }}>
              {money(otherSlice.value)} <Typography component="span" sx={{ fontSize: 11, fontWeight: 600, color: colors.gray400 }}>· {otherPct.toFixed(1)}%</Typography>
            </Typography>
          </Stack>
          <Stack spacing={0.4} sx={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", pt: 0.75, borderTop: `1px solid ${colors.gray200}` }}>
            {otherSlice.children!.map(c => {
              const cpct = total > 0 ? (c.value / total) * 100 : 0;
              return (
                <Box key={c.label} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography noWrap sx={{ fontSize: 12, color: colors.gray500, flex: 1, minWidth: 0 }}>{c.label}</Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.gray700, whiteSpace: "nowrap" }}>{money(c.value)}</Typography>
                  <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: colors.gray400, minWidth: 44, textAlign: "right" }}>{cpct.toFixed(1)}%</Typography>
                </Box>
              );
            })}
          </Stack>
        </Box>
      )}
    </Paper>
  );
}

// memo keeps the generic call signature so callers still get type inference on `items`/`groupings`.
export default memo(AllocationBreakdown) as typeof AllocationBreakdown;
