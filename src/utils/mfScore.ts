import type { MfTableRow } from "../api/types";
import { metricMeta } from "./mfMetrics";

/**
 * Composite fund score: a weighted blend of category-relative percentiles across returns,
 * risk-adjusted return, downside protection, and rolling-window consistency. Category-relative
 * because a 15% CAGR means something different for a Debt fund than an Equity fund — every
 * component is "how does this fund rank against its own subCategory peers," not a raw value.
 *
 * Weights (sum to 1): CAGR .20, rolling avg .12, rolling worst .08 (Returns 40%) · Sharpe .18,
 * Sortino .12 (Risk-adjusted 30%) · max drawdown .12, rolling share-negative .08 (Downside 20%)
 * · rolling share-above-12% .10 (Consistency 10%).
 *
 * Every one of these metrics is available at any single non-SI horizon (see horizonsFor in
 * mfMetrics.ts), so the score for a whole MfTable is computable from that one fetch — no extra
 * per-horizon requests.
 */
const SCORE_WEIGHTS: { metric: string; weight: number }[] = [
  { metric: "cagr", weight: 0.20 },
  { metric: "rolling_avg", weight: 0.12 },
  { metric: "rolling_worst", weight: 0.08 },
  { metric: "sharpe", weight: 0.18 },
  { metric: "sortino", weight: 0.12 },
  { metric: "max_drawdown", weight: 0.12 },
  { metric: "rolling_share_negative", weight: 0.08 },
  { metric: "rolling_share_above_12", weight: 0.10 },
];

/**
 * A fund needs at least this much of the formula's total weight backed by real data to get a
 * score. Below this (usually a very young fund missing rolling/ratio metrics that need a longer
 * history), there isn't enough signal to trust a 0-100 number, so it's left unscored rather than
 * given a misleadingly confident one built off a sliver of the formula.
 */
const MIN_COVERAGE = 0.5;

/** What fraction of `peers` (0-100, 100 = best) `target` beats, respecting metric direction. */
function percentileRank(peers: number[], target: number, higherIsBetter: boolean): number {
  if (peers.length <= 1) return 50;
  const beaten = peers.filter(v => (higherIsBetter ? v < target : v > target)).length;
  return (beaten / (peers.length - 1)) * 100;
}

export interface MfScore {
  score: number;
  /** Each weighted component's category-relative percentile, for a breakdown tooltip. */
  breakdown: { metric: string; percentile: number; weight: number }[];
}

/**
 * Scores every row against its subCategory peers, all within `rows` (pass the full unfiltered
 * table so peer groups aren't skewed by whatever search/asset/category filter the UI has applied).
 * Returns a Map keyed by schemeCode; funds under MIN_COVERAGE are omitted entirely.
 */
export function scoreMfRows(rows: MfTableRow[]): Map<number, MfScore> {
  const bySubCategory = new Map<string, MfTableRow[]>();
  for (const r of rows) {
    if (!bySubCategory.has(r.subCategory)) bySubCategory.set(r.subCategory, []);
    bySubCategory.get(r.subCategory)!.push(r);
  }

  const out = new Map<number, MfScore>();
  for (const peers of bySubCategory.values()) {
    for (const row of peers) {
      let weightedSum = 0;
      let totalWeight = 0;
      const breakdown: MfScore["breakdown"] = [];
      for (const { metric, weight } of SCORE_WEIGHTS) {
        const target = row.values[metric];
        if (target == null) continue;
        const peerValues = peers.map(p => p.values[metric]).filter((v): v is number => v != null);
        const percentile = percentileRank(peerValues, target, metricMeta(metric).higherIsBetter);
        weightedSum += percentile * weight;
        totalWeight += weight;
        breakdown.push({ metric, percentile, weight });
      }
      if (totalWeight >= MIN_COVERAGE) {
        out.set(row.schemeCode, { score: weightedSum / totalWeight, breakdown });
      }
    }
  }
  return out;
}

export interface CategoryRank {
  /** 1 = best in the subCategory. */
  rank: number;
  /** 100 = best, matching the backend's MfFundRank scale. */
  percentile: number;
  peerCount: number;
}

/**
 * Ranks every row against its subCategory peers on a single metric — the same shape as the
 * backend's per-fund MfFundRank, computed client-side from a whole MfTable so a list view can
 * show every row's standing (e.g. a "Top X%" badge) without one API call per fund.
 */
export function rankWithinCategory(rows: MfTableRow[], metric: string): Map<number, CategoryRank> {
  const higherIsBetter = metricMeta(metric).higherIsBetter;
  const bySubCategory = new Map<string, MfTableRow[]>();
  for (const r of rows) {
    if (r.values[metric] == null) continue;
    if (!bySubCategory.has(r.subCategory)) bySubCategory.set(r.subCategory, []);
    bySubCategory.get(r.subCategory)!.push(r);
  }

  const out = new Map<number, CategoryRank>();
  for (const peers of bySubCategory.values()) {
    const sorted = [...peers].sort((a, b) =>
      higherIsBetter ? b.values[metric] - a.values[metric] : a.values[metric] - b.values[metric]);
    sorted.forEach((r, i) => {
      const rank = i + 1;
      const percentile = peers.length <= 1 ? 50 : ((peers.length - rank) / (peers.length - 1)) * 100;
      out.set(r.schemeCode, { rank, percentile, peerCount: peers.length });
    });
  }
  return out;
}
