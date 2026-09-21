// Shared vocabulary for the Mutual Fund Analyzer, mirroring the backend's MfMetricKey.
//
// Every backend metric value is a fraction (0.12 === 12%) except Sharpe/Sortino (a unitless ratio)
// and rolling_windows (a count). Formatting and sign-colouring both branch on that kind.

export type MetricKind = "pct" | "ratio" | "count";

export interface MetricMeta {
  code: string;
  /** Full name for menus and section labels. */
  label: string;
  /** Terse column header. */
  short: string;
  kind: MetricKind;
  /** Ranking direction: high wins for returns, low wins for volatility. */
  higherIsBetter: boolean;
  /** One-line explanation surfaced as a tooltip / helper text. */
  help: string;
}

export const MF_METRICS: Record<string, MetricMeta> = {
  cagr: { code: "cagr", label: "CAGR (annualised return)", short: "CAGR", kind: "pct", higherIsBetter: true, help: "Compound annual growth rate over the horizon, ending at the latest NAV." },
  absolute: { code: "absolute", label: "Absolute return", short: "Return", kind: "pct", higherIsBetter: true, help: "Simple, non-annualised return over the window." },
  rolling_avg: { code: "rolling_avg", label: "Rolling return (average)", short: "Roll avg", kind: "pct", higherIsBetter: true, help: "Average of every rolling window of this length — the typical outcome, not a lucky start date." },
  rolling_worst: { code: "rolling_worst", label: "Rolling return (worst)", short: "Roll worst", kind: "pct", higherIsBetter: true, help: "Worst annualised return an investor entering on any single day actually got." },
  rolling_best: { code: "rolling_best", label: "Rolling return (best)", short: "Roll best", kind: "pct", higherIsBetter: true, help: "Best annualised return across all rolling windows of this length." },
  rolling_share_negative: { code: "rolling_share_negative", label: "Share of windows negative", short: "% negative", kind: "pct", higherIsBetter: false, help: "Fraction of rolling windows that lost money — lower is better." },
  rolling_share_above_12: { code: "rolling_share_above_12", label: "Share of windows above 12%", short: "% > 12%", kind: "pct", higherIsBetter: true, help: "Fraction of rolling windows that returned more than 12% a year." },
  rolling_windows: { code: "rolling_windows", label: "Rolling windows counted", short: "Windows", kind: "count", higherIsBetter: true, help: "How many rolling windows the averages are over." },
  volatility: { code: "volatility", label: "Volatility (annualised)", short: "Volatility", kind: "pct", higherIsBetter: false, help: "Annualised standard deviation of daily returns — lower is steadier." },
  sharpe: { code: "sharpe", label: "Sharpe ratio", short: "Sharpe", kind: "ratio", higherIsBetter: true, help: "Excess return per unit of total volatility (risk-free 6.5%)." },
  sortino: { code: "sortino", label: "Sortino ratio", short: "Sortino", kind: "ratio", higherIsBetter: true, help: "Excess return per unit of downside volatility only." },
  max_drawdown: { code: "max_drawdown", label: "Maximum drawdown", short: "Max DD", kind: "pct", higherIsBetter: true, help: "Largest peak-to-trough fall over the full history (a negative number)." },
  current_drawdown: { code: "current_drawdown", label: "Current drawdown", short: "Cur DD", kind: "pct", higherIsBetter: true, help: "How far below its all-time high the fund currently sits." },
};

/** Metrics offered in the leaderboard's metric picker, in a sensible order. */
export const LEADERBOARD_METRICS: string[] = [
  "cagr", "rolling_avg", "rolling_worst", "rolling_share_above_12",
  "volatility", "sharpe", "sortino", "max_drawdown",
];

/** The leaderboard metrics split into intuitive groups, for a sectioned picker. */
export const LEADERBOARD_METRIC_GROUPS: { label: string; metrics: string[] }[] = [
  { label: "Returns", metrics: ["cagr", "rolling_avg", "rolling_worst", "rolling_share_above_12"] },
  { label: "Risk & consistency", metrics: ["volatility", "sharpe", "sortino", "max_drawdown"] },
];

/** Every metric shown on the fund-detail heatmap, grouped, in reading order. */
export const DETAIL_METRIC_GROUPS: { label: string; metrics: string[] }[] = [
  { label: "Returns", metrics: ["cagr", "absolute"] },
  { label: "Rolling returns", metrics: ["rolling_avg", "rolling_worst", "rolling_best", "rolling_share_above_12", "rolling_share_negative"] },
  { label: "Risk", metrics: ["volatility", "sharpe", "sortino", "max_drawdown", "current_drawdown"] },
];

export const HORIZONS = ["1Y", "2Y", "3Y", "4Y", "5Y", "7Y", "10Y", "SI"] as const;
export type Horizon = (typeof HORIZONS)[number];

/** Horizons that make sense for a given metric. Rolling/volatility/ratios need a fixed-length window. */
export function horizonsFor(metricCode: string): Horizon[] {
  if (metricCode === "cagr" || metricCode === "absolute" || metricCode === "max_drawdown" || metricCode === "current_drawdown") {
    return ["1Y", "2Y", "3Y", "4Y", "5Y", "7Y", "10Y", "SI"];
  }
  return ["1Y", "2Y", "3Y", "4Y", "5Y", "7Y", "10Y"];
}

export function metricMeta(code: string): MetricMeta {
  return MF_METRICS[code] ?? { code, label: code, short: code, kind: "pct", higherIsBetter: true, help: "" };
}

/** Human-readable metric value: 12.34%, a 1.42 ratio, or a 107 count. */
export function formatMetricValue(code: string, value: number): string {
  const meta = metricMeta(code);
  if (meta.kind === "count") return String(Math.round(value));
  if (meta.kind === "ratio") return value.toFixed(2);
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * Whether this metric's value carries a good/bad sense worth colouring.
 * Returns and ratios do (green up / red down); volatility and window counts are neutral.
 */
export function isSignedMetric(code: string): boolean {
  return code !== "volatility" && code !== "rolling_windows" && code !== "rolling_share_negative";
}

const ASSET_ORDER = ["EQUITY", "HYBRID", "DEBT", "SOLUTION", "OTHER", "UNKNOWN"];

export function assetClassLabel(code: string): string {
  const map: Record<string, string> = {
    EQUITY: "Equity", HYBRID: "Hybrid", DEBT: "Debt", SOLUTION: "Solution Oriented", OTHER: "Other", UNKNOWN: "Unclassified",
  };
  return map[code] ?? code;
}

export function assetClassRank(code: string): number {
  const i = ASSET_ORDER.indexOf(code);
  return i === -1 ? ASSET_ORDER.length : i;
}
