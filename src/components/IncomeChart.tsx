import { memo } from "react";
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from "recharts";
import type { TooltipProps } from "recharts";
import { Box, Typography, Stack } from "@mui/material";
import { useTheme, useMediaQuery } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useTokens } from "../context/ColorModeContext";
import { formatCurrency as fmtCurrency, formatCurrencyCompact } from "../utils/format";

export interface IncomeChartPoint {
  label: string;
  net: number;
  tax: number;
}

interface IncomeChartProps {
  data: IncomeChartPoint[];
  currency?: string;
}

// Custom bar shape that grows from bottom with a staggered left-to-right delay
function AnimatedBar(props: Record<string, unknown>) {
  const { x, y, width, height, fill, index, stagger } = props as {
    x: number; y: number; width: number; height: number; fill: string; index: number; stagger: number;
  };
  const delay = (index ?? 0) * (stagger ?? 20);
  return (
    <g>
      <rect
        x={x} y={y} width={width} height={height} rx={0} ry={0}
        fill={fill}
        style={{
          animation: `barGrow 150ms ${delay}ms ease-out both`,
          transformOrigin: "bottom",
        }}
      />
      <style>{`
        @keyframes barGrow {
          from { transform: scaleY(0); opacity: 0; }
          to { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
    </g>
  );
}

function AnimatedBarTop(props: Record<string, unknown>) {
  const { x, y, width, height, fill, index, stagger } = props as {
    x: number; y: number; width: number; height: number; fill: string; index: number; stagger: number;
  };
  const delay = (index ?? 0) * (stagger ?? 20);
  const r = 4;
  const h = Math.max(height, 0);
  const w = Math.max(width, 0);
  const path = h > 0
    ? `M${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} L${x},${y + h} Z`
    : "";
  return (
    <g>
      <path
        d={path} fill={fill}
        style={{
          animation: `barGrow 150ms ${delay}ms ease-out both`,
          transformOrigin: "bottom",
        }}
      />
    </g>
  );
}

// Vertical dashed line cursor matching Dashboard style
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomCursor(props: any) {
  const { x, y, width, height, stroke } = props;
  if (x == null || height == null) return null;
  const cx = x + (width ?? 0) / 2;
  return (
    <line x1={cx} y1={y ?? 0} x2={cx} y2={(y ?? 0) + height} stroke={stroke} strokeWidth={1} strokeDasharray="4 4" />
  );
}

// Compact stat pill for an average, color-matched to its dashed reference line on the chart.
function AvgPill({ color, muted, label, value }: { color: string; muted: string; label: string; value: string }) {
  return (
    <Box sx={{
      display: "inline-flex", alignItems: "center", gap: 1,
      px: 1.25, py: 0.6, borderRadius: 2,
      bgcolor: alpha(color, 0.1), border: `1px solid ${alpha(color, 0.25)}`,
    }}>
      <Box sx={{ width: 16, flexShrink: 0, borderTop: `2px dashed ${color}` }} />
      <Box>
        <Typography sx={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: muted, lineHeight: 1, mb: 0.35 }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 800, color, lineHeight: 1, letterSpacing: "-0.01em" }}>
          {value}
        </Typography>
      </Box>
    </Box>
  );
}

const TOTAL_ANIMATION_MS = 600;
const BAR_DURATION_MS = 150;

function IncomeChart({ data, currency }: IncomeChartProps) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("sm"));
  const { colors, shadow } = useTokens();
  const stagger = data.length > 1 ? Math.round((TOTAL_ANIMATION_MS - BAR_DURATION_MS) / (data.length - 1)) : 0;

  // Averages over exactly the groups being shown, so they follow the page's filters and grouping.
  const n = data.length;
  const avgTotal = n ? data.reduce((s, d) => s + d.net + d.tax, 0) / n : 0;
  const avgNet = n ? data.reduce((s, d) => s + d.net, 0) / n : 0;

  return (
    <>
      {n > 0 && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap"
          justifyContent={{ xs: "center", sm: "flex-end" }} sx={{ mb: 1.5 }}>
          <AvgPill color={colors.brand} muted={colors.gray500} label="Avg Total" value={fmtCurrency(avgTotal, currency)} />
          <AvgPill color={colors.accent} muted={colors.gray500} label="Avg Net" value={fmtCurrency(avgNet, currency)} />
        </Stack>
      )}
      <ResponsiveContainer width="100%" height={compact ? 240 : 340}>
      <BarChart data={data} margin={{ top: 4, right: compact ? 4 : 8, left: compact ? -20 : 0, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke={colors.gray100} />
        <XAxis
          dataKey="label" tickLine={false} axisLine={false}
          tick={{ fontSize: compact ? 10 : 11, fill: colors.gray500 }}
          interval={compact ? "preserveStartEnd" : undefined}
        />
        <YAxis
          tickLine={false} axisLine={false} width={compact ? 40 : 52}
          tick={{ fontSize: compact ? 10 : 11, fill: colors.gray400 }}
          tickFormatter={(v: number) => formatCurrencyCompact(v, currency)}
        />
        <Tooltip
          cursor={<CustomCursor stroke={colors.gray200} />}
          content={(tipProps: TooltipProps<number, string>) => {
            const { active, payload, label } = tipProps;
            if (!active || !payload?.length) return null;
            const net = (payload.find(p => p.dataKey === "net")?.value as number) ?? 0;
            const tax = (payload.find(p => p.dataKey === "tax")?.value as number) ?? 0;
            const total = net + tax;
            return (
              <Box sx={{
                bgcolor: colors.white, border: `1px solid ${colors.gray200}`,
                borderRadius: 3, boxShadow: shadow.md, px: 2, py: 1.5, minWidth: 140,
              }}>
                <Typography sx={{ fontSize: 11, color: colors.gray400, mb: 0.75 }}>{label}</Typography>
                <Stack spacing={0.5}>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.success }}>Net</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{fmtCurrency(net, currency)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.error }}>Tax</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{fmtCurrency(tax, currency)}</Typography>
                  </Stack>
                  <Box sx={{ borderTop: `1px solid ${colors.gray200}`, pt: 0.5, mt: 0.25 }}>
                    <Stack direction="row" justifyContent="space-between" spacing={2}>
                      <Typography sx={{ fontSize: 12, fontWeight: 700 }}>Total</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{fmtCurrency(total, currency)}</Typography>
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            );
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
          content={() => {
            const items = [
              { label: "Net", color: colors.success },
              { label: "Tax", color: colors.error },
            ];
            return (
              <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
                {items.map((item) => (
                  <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: item.color, display: "inline-block" }} />
                    <span style={{ color: item.color, fontWeight: 500 }}>{item.label}</span>
                  </span>
                ))}
              </div>
            );
          }}
        />
        <Bar dataKey="net" name="Net" stackId="income" isAnimationActive={false}
          shape={<AnimatedBar fill={colors.success} stagger={stagger} />}>
          {data.map((_, i) => <Cell key={i} fill={colors.success} />)}
        </Bar>
        <Bar dataKey="tax" name="Tax" stackId="income" isAnimationActive={false}
          shape={<AnimatedBarTop fill={colors.error} stagger={stagger} />}>
          {data.map((_, i) => <Cell key={i} fill={colors.error} />)}
        </Bar>
        {/* Average lines over the shown groups. Values live in the pills above the chart, so no
            on-chart labels to collide with the bars or each other when the two lines sit close. */}
        {n > 0 && <ReferenceLine y={avgTotal} stroke={colors.brand} strokeDasharray="5 4" strokeWidth={2} isFront />}
        {n > 0 && <ReferenceLine y={avgNet} stroke={colors.accent} strokeDasharray="5 4" strokeWidth={2} isFront />}
      </BarChart>
      </ResponsiveContainer>
    </>
  );
}

// The page re-renders on every filter and grouping change; the chart only needs to follow its data.
export default memo(IncomeChart);
