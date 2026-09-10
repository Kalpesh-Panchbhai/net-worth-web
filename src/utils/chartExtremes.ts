/**
 * Best/worst points of a chart series, ranked three ways: return %, absolute P&L, and XIRR.
 *
 * Pure and self-contained so it can be unit-tested without React. The input is the chart's daily
 * series; only the fields used here are required, so a full `ChartDataPoint` satisfies it.
 */
export interface ExtremeInput {
  date: string;
  value: number;
  invested: number;
  /** Currency `value`/`invested` are in. A series may mix these when old points predate FX history. */
  displayCurrency: string;
  /** Money-weighted return as a fraction; null/undefined before the first flow or where N/A. */
  xirr?: number | null;
}

export interface ExtremePoint {
  date: string;
  pl: number;
  plPct: number;
  xirr: number | null | undefined;
}

export interface ExtremePair {
  best: ExtremePoint;
  worst: ExtremePoint;
}

export interface Extremes {
  /** Currency the ranked points (and their P&L amounts) are all expressed in. */
  currency: string;
  byPct: ExtremePair;
  byAmount: ExtremePair;
  /** Null when no point has a meaningful XIRR (e.g. all warm-up, all null, or non-investment). */
  byXirr: ExtremePair | null;
}

/** Elapsed days from the window's first XIRR point below which an explosive figure is discarded. */
const XIRR_WARMUP_DAYS = 60;
/** Above this |XIRR| a point is treated as still in the inception "explosion" range. */
const XIRR_INCEPTION_THRESHOLD = 1; // 100%

function ms(date: string): number {
  return new Date(date + "T00:00:00").getTime();
}

/**
 * @param data chart series (ascending by date)
 * @returns null when there are fewer than two comparable points
 */
export function computeExtremes(data: ExtremeInput[]): Extremes | null {
  if (!data || data.length < 2) return null;

  // Only points that actually have capital at work can have a P&L or return.
  const invested = data.filter(d => d.invested > 0);
  if (invested.length < 2) return null;

  // A series can mix currencies (a point with no FX rate keeps its native one). Amounts are only
  // comparable within one currency, so rank inside the dominant one and label the cards with it.
  const counts = new Map<string, number>();
  for (const d of invested) counts.set(d.displayCurrency, (counts.get(d.displayCurrency) ?? 0) + 1);
  let currency = invested[0].displayCurrency;
  let most = 0;
  for (const [code, n] of counts) if (n > most) { currency = code; most = n; }

  const points: ExtremePoint[] = invested
    .filter(d => d.displayCurrency === currency)
    .map(d => ({
      date: d.date,
      pl: d.value - d.invested,
      plPct: ((d.value - d.invested) / d.invested) * 100,
      xirr: d.xirr,
    }));
  if (points.length < 2) return null;

  const byPct: ExtremePair = {
    best: points.reduce((a, b) => (b.plPct > a.plPct ? b : a)),
    worst: points.reduce((a, b) => (b.plPct < a.plPct ? b : a)),
  };
  const byAmount: ExtremePair = {
    best: points.reduce((a, b) => (b.pl > a.pl ? b : a)),
    worst: points.reduce((a, b) => (b.pl < a.pl ? b : a)),
  };

  // XIRR extremes: annualising a few days near inception explodes the figure. Discard any point
  // that is BOTH inside the warm-up window AND still in the explosive range — done per point, so a
  // tame-looking first point can't wave through a later day-10 explosion, while a zoomed view of a
  // mature holding (no explosive figures) keeps all its points. Fall back to the full set if the
  // filter would leave nothing to rank.
  let byXirr: ExtremePair | null = null;
  const defined = points.filter(p => p.xirr != null && isFinite(p.xirr as number));
  if (defined.length > 0) {
    const start = ms(defined[0].date);
    const stable = defined.filter(p => {
      const withinWarmup = ms(p.date) - start < XIRR_WARMUP_DAYS * 86_400_000;
      const explosive = Math.abs(p.xirr as number) > XIRR_INCEPTION_THRESHOLD;
      return !(withinWarmup && explosive);
    });
    const pool = stable.length > 0 ? stable : defined;
    byXirr = {
      best: pool.reduce((a, b) => ((b.xirr as number) > (a.xirr as number) ? b : a)),
      worst: pool.reduce((a, b) => ((b.xirr as number) < (a.xirr as number) ? b : a)),
    };
  }

  return { currency, byPct, byAmount, byXirr };
}
