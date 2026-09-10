/**
 * Shared forward projection for value time-series charts (entity Value line, dashboard net worth).
 *
 * Geometric (CAGR) model, mirroring the income chart's forecast concept: daily log returns give a
 * drift µ and volatility σ, so over k steps the series compounds as x·e^(µk) and the ±1σ cone
 * widens with e^(±σ√k). The horizon is a fraction of the visible window.
 *
 * `value` is the primary series (always projected, with a band). `invested` and `savingsRate` are
 * optionally projected as line-only extensions (no band) to keep secondary series from cluttering.
 */

/** Projection fields overlaid onto plot rows. Present on the last actual point (anchor) and future points. */
export interface ForecastFields {
  /** Projected value; the last actual point carries its own value so the dashed line joins on. */
  fcValue?: number | null;
  /** [lower, upper] ±1σ range around the value projection. */
  fcBand?: [number, number] | null;
  /** Projected invested (line only, no band). */
  fcInvested?: number | null;
  /** Projected savings rate (line only, no band). */
  fcSaved?: number | null;
  /** True only on appended future points. */
  projected?: boolean;
}

interface ForecastInputRow {
  date: string;
  value: number | null;
  invested?: number | null;
  savingsRate?: number | null;
}

interface BuildForecastOptions {
  /** Horizon as a fraction of the window; defaults to ~25%. */
  fraction?: number;
  /** Also project the `invested` series as a dashed line. */
  invested?: boolean;
  /** Also project the `savingsRate` series as a dashed line. */
  saved?: boolean;
}

const MS_PER_DAY = 86_400_000;
const DEFAULT_FRACTION = 0.25;

/** Geometric drift µ and volatility σ from a series' consecutive positive log returns; null if too sparse. */
function logReturnStats<T>(rows: T[], get: (r: T) => number | null | undefined): { mu: number; sigma: number } | null {
  const rets: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const a = get(rows[i - 1]), b = get(rows[i]);
    if (a != null && b != null && a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  if (rets.length < 2) return null;
  const mu = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mu) ** 2, 0) / (rets.length - 1);
  return { mu, sigma: Math.sqrt(variance) };
}

/**
 * @param base ascending-by-date rows carrying a numeric `value` (null allowed for gaps).
 * @returns merged rows (actuals then projected future points) and whether a forecast was produced.
 */
export function buildValueForecast<T extends ForecastInputRow>(
  base: T[],
  options: BuildForecastOptions = {},
): { plotData: Array<T & ForecastFields>; hasForecast: boolean } {
  const { fraction = DEFAULT_FRACTION, invested = false, saved = false } = options;
  const rows: Array<T & ForecastFields> = base.map(r => ({ ...r }));
  const n = rows.length;
  if (n < 3) return { plotData: rows, hasForecast: false };

  const valStats = logReturnStats(base, r => r.value);
  const last = rows[n - 1];
  if (!valStats || last.value == null || !(last.value > 0)) return { plotData: rows, hasForecast: false };
  const baseValue = last.value;

  const parseMs = (s: string) => new Date(s + "T00:00:00").getTime();
  const firstMs = parseMs(rows[0].date);
  const lastMs = parseMs(last.date);
  const spanDays = Math.max(1, Math.round((lastMs - firstMs) / MS_PER_DAY));
  const avgStepDays = Math.max(1, spanDays / (n - 1));
  const steps = Math.max(1, Math.round((n - 1) * fraction));

  const invStats = invested ? logReturnStats(base, r => r.invested) : null;
  const savStats = saved ? logReturnStats(base, r => r.savingsRate) : null;
  const baseInv = last.invested;
  const baseSav = last.savingsRate;
  const canInv = invStats != null && baseInv != null && baseInv > 0;
  const canSav = savStats != null && baseSav != null && baseSav > 0;

  // Anchor each projection to the last actual point (zero-width band there) so the dashed lines join on.
  last.fcValue = baseValue;
  last.fcBand = [baseValue, baseValue];
  if (canInv) last.fcInvested = baseInv;
  if (canSav) last.fcSaved = baseSav;

  const future: Array<T & ForecastFields> = [];
  for (let k = 1; k <= steps; k++) {
    const spread = Math.sqrt(k);
    const dMs = lastMs + Math.round(k * avgStepDays) * MS_PER_DAY;
    const row: ForecastFields & { date: string; value: null } = {
      date: new Date(dMs).toISOString().slice(0, 10),
      value: null,
      fcValue: baseValue * Math.exp(valStats.mu * k),
      fcBand: [
        baseValue * Math.exp(valStats.mu * k - valStats.sigma * spread),
        baseValue * Math.exp(valStats.mu * k + valStats.sigma * spread),
      ],
      projected: true,
    };
    if (canInv) row.fcInvested = baseInv * Math.exp(invStats!.mu * k);
    if (canSav) row.fcSaved = baseSav * Math.exp(savStats!.mu * k);
    future.push(row as unknown as T & ForecastFields);
  }
  return { plotData: [...rows, ...future], hasForecast: true };
}
