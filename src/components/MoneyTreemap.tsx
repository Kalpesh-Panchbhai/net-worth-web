import { useMemo, useState } from "react";
import { Box, Breadcrumbs, Link, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import { useTokens } from "../context/ColorModeContext";
import { formatCurrency, formatCurrencyCompact } from "../utils/format";

/** One tile. `children` makes it drillable; leaves may carry `onClick` (e.g. open the holding). */
export interface TreemapNode {
  id: string;
  name: string;
  value: number;
  /** Absolute change that colors the tile (today's change, or gain vs. invested). */
  change: number;
  /** Change as a fraction of the base it is measured against (0.02 === +2%). */
  changePct: number | null;
  children?: TreemapNode[];
  onClick?: () => void;
}

interface Props {
  nodes: TreemapNode[];
  currency: string;
  /** |changePct| at which a tile reaches full color intensity. */
  saturateAt: number;
  /** Tooltip label for the change, e.g. "Today" or "Gain". */
  changeLabel: string;
  height?: number;
  /** Keep false while the data changes every frame (time-machine playback). */
  animate?: boolean;
}

interface TileProps {
  x: number; y: number; width: number; height: number; depth: number;
  name: string; value: number; changePct: number | null; fill: string; textColor: string; currency: string;
  node: TreemapNode; onSelect: (n: TreemapNode) => void;
}

function Tile({ x, y, width, height, depth, name, value, changePct, fill, textColor, currency, node, onSelect }: TileProps) {
  // Recharts also renders the root (depth 0) behind the tiles; it carries no tile data.
  if (depth === 0 || !node) return null;
  const clickable = !!node?.children?.length || !!node?.onClick;
  const showName = width > 56 && height > 28;
  const showValue = width > 72 && height > 46;
  return (
    <g onClick={() => clickable && onSelect(node)} style={{ cursor: clickable ? "pointer" : "default" }}>
      <rect x={x} y={y} width={width} height={height} rx={6} fill={fill} stroke="var(--treemap-gap)" strokeWidth={2} />
      {showName && (
        <text x={x + 8} y={y + 18} fill={textColor} fontSize={12} fontWeight={700}>
          {name.length * 7 > width - 16 ? `${name.slice(0, Math.max(1, Math.floor((width - 16) / 7) - 1))}…` : name}
        </text>
      )}
      {showValue && (
        <text x={x + 8} y={y + 36} fill={textColor} fontSize={11} opacity={0.85}>
          {formatCurrencyCompact(value, currency)}
          {changePct != null ? `  ${changePct >= 0 ? "+" : ""}${(changePct * 100).toFixed(1)}%` : ""}
        </text>
      )}
    </g>
  );
}

/**
 * Portfolio heat map: tile area is value, color is change (green up, red down, stronger = bigger
 * move). Click a tile with children to drill in; the breadcrumb walks back out.
 */
export default function MoneyTreemap({ nodes, currency, saturateAt, changeLabel, height = 360, animate = true }: Props) {
  const theme = useTheme();
  const { colors } = useTokens();
  // Drill path by node id, so it survives the data changing underneath (time-machine playback).
  const [path, setPath] = useState<string[]>([]);

  const { level, crumbs } = useMemo(() => {
    let level = nodes;
    const crumbs: TreemapNode[] = [];
    for (const id of path) {
      const next = level.find(n => n.id === id);
      if (!next?.children) break;
      crumbs.push(next);
      level = next.children;
    }
    return { level, crumbs };
  }, [nodes, path]);

  const data = useMemo(() => level
    .filter(n => n.value > 0)
    .sort((a, b) => b.value - a.value)
    .map(n => {
      const intensity = n.changePct == null ? 0 : Math.min(1, Math.abs(n.changePct) / saturateAt);
      const base = n.changePct == null || n.changePct === 0 ? theme.palette.text.secondary : n.changePct > 0 ? colors.success : colors.error;
      return {
        name: n.name, size: n.value, value: n.value, changePct: n.changePct, change: n.change, node: n, currency,
        fill: alpha(base, 0.18 + 0.62 * intensity),
        textColor: theme.palette.text.primary,
      };
    }), [level, saturateAt, theme, colors, currency]);

  const select = (n: TreemapNode) => {
    if (n.children?.length) setPath(p => [...p.slice(0, crumbs.length), n.id]);
    else n.onClick?.();
  };

  const total = level.reduce((s, n) => s + Math.max(0, n.value), 0);

  return (
    <Box sx={{ "--treemap-gap": theme.palette.background.paper } as object}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1, minHeight: 24, gap: 1 }}>
        <Breadcrumbs sx={{ fontSize: "0.8rem" }}>
          <Link component="button" underline="hover" color={crumbs.length ? "inherit" : "text.primary"} onClick={() => setPath([])} sx={{ fontSize: "0.8rem" }}>
            All
          </Link>
          {crumbs.map((c, i) => (
            <Link key={c.id} component="button" underline="hover" color={i === crumbs.length - 1 ? "text.primary" : "inherit"}
              onClick={() => setPath(crumbs.slice(0, i + 1).map(x => x.id))} sx={{ fontSize: "0.8rem" }}>
              {c.name}
            </Link>
          ))}
        </Breadcrumbs>
        <Typography variant="caption" color="text.secondary">{formatCurrency(total, currency, { maxDecimals: 0 })}</Typography>
      </Box>
      {data.length === 0 ? (
        <Box sx={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography variant="body2" color="text.secondary">Nothing to show</Typography>
        </Box>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <Treemap
            data={data} dataKey="size" isAnimationActive={animate} animationDuration={400}
            content={<Tile {...({} as TileProps)} onSelect={select} />}
          >
            <Tooltip
              content={({ payload }) => {
                const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!p) return null;
                return (
                  <Box sx={{ bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: 2, px: 1.5, py: 1, boxShadow: 3 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "0.85rem" }}>{p.name}</Typography>
                    <Typography sx={{ fontSize: "0.8rem" }}>{formatCurrency(p.value, currency, { maxDecimals: 0 })} · {total > 0 ? ((p.value / total) * 100).toFixed(1) : 0}%</Typography>
                    <Typography sx={{ fontSize: "0.8rem", color: p.change >= 0 ? colors.success : colors.error }}>
                      {changeLabel}: {p.change >= 0 ? "+" : ""}{formatCurrency(p.change, currency, { maxDecimals: 0 })}
                      {p.changePct != null ? ` (${p.changePct >= 0 ? "+" : ""}${(p.changePct * 100).toFixed(2)}%)` : ""}
                    </Typography>
                  </Box>
                );
              }}
            />
          </Treemap>
        </ResponsiveContainer>
      )}
    </Box>
  );
}
