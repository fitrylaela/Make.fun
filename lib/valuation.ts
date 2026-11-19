// The token radar's valuation engine: a comparable-company model fitted, at run time, from the
// snapshot's own token-bearing protocols.
//
// A protocol's implied value is what the market pays for the same kind of protocol at the same size.
// The model is not a hand-written list of multiples: it is a regression on the live half of the very
// snapshot it scores, so every number the board states can be recomputed from the input.
//
//   ln(mcap) = a + b·ln(tvl) + c·growth + d·ln(age) + category effect
//
// fitted by ordinary least squares over every protocol that already trades (a token, a market cap and
// a TVL). The category effect is the median residual of that category, shrunk toward zero by how few
// comparables it has, so a category with one comparable moves the estimate a little and a category
// with a dozen moves it a lot. Growth is clipped at ±50% a week, which is where the snapshot's own
// outliers stop being informative, and age is the protocol's time since DefiLlama first listed it.

import type { ModelConstants, SnapshotProtocol } from './types.ts';

const DAY_MS = 86_400_000;

/** How strongly a category's median residual is pulled toward the market's own level. */
const CATEGORY_SHRINK = 4;

/** Growth beyond this many per cent a week is clipped: the tail carries no more signal. */
export const GROWTH_CLIP = 50;

/** A pre-token protocol's age when the snapshot does not date it. */
export const UNKNOWN_AGE_DAYS = 365;

/** Whether the snapshot records a token for the protocol: a market cap, a CoinGecko id or a symbol. */
export function hasToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
}

/** Whether the protocol is a fit target: it trades, and both sides of the ratio are positive. */
export function isComparable(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

/** Whole days from the snapshot's date back to the protocol's listing, or null when undated. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(1, Math.floor((a - b) / DAY_MS));
}

/** The growth a row is scored on: the snapshot's seven-day change, clipped, with 0 when unreported. */
export function clippedGrowth(change7d: number | null): number {
  const g = change7d === null || !Number.isFinite(change7d) ? 0 : change7d;
  return Math.min(GROWTH_CLIP, Math.max(-GROWTH_CLIP, g));
}

/** One comparable's design row, with its response: the log of its market cap. */
export interface Comparable {
  slug: string;
  category: string;
  logTvl: number;
  growth: number;
  age: number;
  logMcap: number;
}

/** A protocol's score under the fitted model. */
export interface Score {
  implied: number;
  logTvl: number;
  growth: number;
  age: number;
  ageDated: boolean;
  categoryEffect: number;
  comparables: number;
}

/** The fitted model: every number the dashboard states, and the function that applies it. */
export interface Valuation {
  constants: ModelConstants;
  coefficients: { intercept: number; logTvl: number; growth: number; age: number };
  categoryEffects: Record<string, number>;
  categoryCounts: Record<string, number>;
  comparables: number;
  categories: number;
  rSquared: number;
  score: (p: SnapshotProtocol) => Score;
}

/** The design row of a protocol: [1, ln tvl, growth, ln age]. */
function design(p: SnapshotProtocol, asOf: string): number[] {
  const age = ageDays(asOf, p.listed_at) ?? UNKNOWN_AGE_DAYS;
  return [1, Math.log(p.tvl_usd), clippedGrowth(p.change_7d), Math.log(Math.max(1, age))];
}

/** Gauss-Jordan solve of A·x = b, with a tiny ridge so a collinear column cannot divide by zero. */
function solve(A: number[][], b: number[]): number[] {
  const k = A.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let i = 0; i < k; i++) M[i]![i]! += 1e-9;
  for (let i = 0; i < k; i++) {
    let pivot = i;
    for (let r = i + 1; r < k; r++) if (Math.abs(M[r]![i]!) > Math.abs(M[pivot]![i]!)) pivot = r;
    [M[i], M[pivot]] = [M[pivot]!, M[i]!];
    const d = M[i]![i]!;
    if (d === 0) continue;
    for (let c = i; c <= k; c++) M[i]![c]! /= d;
    for (let r = 0; r < k; r++) {
      if (r === i) continue;
      const f = M[r]![i]!;
      if (f === 0) continue;
      for (let c = i; c <= k; c++) M[r]![c]! -= f * M[i]![c]!;
    }
  }
  return M.map((row) => row[k]!);
}

/** Ordinary least squares over the design rows. */
function ols(rows: number[][], y: number[]): number[] {
  const k = rows[0]!.length;
  const XtX = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => rows.reduce((s, r) => s + r[i]! * r[j]!, 0)));
  const Xty = Array.from({ length: k }, (_, i) => rows.reduce((s, r, n) => s + r[i]! * y[n]!, 0));
  return solve(XtX, Xty);
}

/** The median of a list of numbers. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Fit the valuation from the snapshot's token-bearing protocols.
 *
 * Every protocol that trades is one comparable; nothing is excluded for being a wrapped product, a
 * versioned pool or an exchange, because those are exactly what a pre-token protocol of the same kind
 * would be priced against.
 */
export function fitValuation(
  snapshot: { as_of: string; protocols: SnapshotProtocol[] },
  constants: ModelConstants,
): Valuation {
  const comparables: Comparable[] = snapshot.protocols.filter(isComparable).map((p) => {
    const d = design(p, snapshot.as_of);
    return {
      slug: p.slug,
      category: p.category ?? 'Uncategorised',
      logTvl: d[1]!,
      growth: d[2]!,
      age: Math.exp(d[3]!),
      logMcap: Math.log(p.mcap_usd!),
    };
  });

  const X = comparables.map((c) => [1, c.logTvl, c.growth, Math.log(Math.max(1, c.age))]);
  const y = comparables.map((c) => c.logMcap);
  const coef = ols(X, y);
  const fitted = (c: Comparable) =>
    coef[0]! + coef[1]! * c.logTvl + coef[2]! * c.growth + coef[3]! * Math.log(Math.max(1, c.age));

  // Each category's effect is the median residual of its comparables, shrunk toward zero by count.
  const byCategory = new Map<string, number[]>();
  comparables.forEach((c, i) => {
    const list = byCategory.get(c.category) ?? [];
    list.push(y[i]! - fitted(c));
    byCategory.set(c.category, list);
  });
  const categoryEffects: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  for (const [category, residuals] of byCategory) {
    categoryEffects[category] = (residuals.length / (residuals.length + CATEGORY_SHRINK)) * median(residuals);
    categoryCounts[category] = residuals.length;
  }

  const mean = y.reduce((s, v) => s + v, 0) / y.length;
  const ssRes = y.reduce((s, v, i) => s + (v - fitted(comparables[i]!)) ** 2, 0);
  const ssTot = y.reduce((s, v) => s + (v - mean) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  const score = (p: SnapshotProtocol): Score => {
    const d = design(p, snapshot.as_of);
    const age = Math.exp(d[3]!);
    const category = p.category ?? 'Uncategorised';
    const categoryEffect = categoryEffects[category] ?? 0;
    const logImplied =
      coef[0]! + coef[1]! * d[1]! + coef[2]! * d[2]! + coef[3]! * Math.log(Math.max(1, age)) + categoryEffect;
    return {
      implied: Math.max(1, Math.round(Math.exp(logImplied))),
      logTvl: d[1]!,
      growth: d[2]!,
      age,
      ageDated: ageDays(snapshot.as_of, p.listed_at) !== null,
      categoryEffect,
      comparables: categoryCounts[category] ?? 0,
    };
  };

  return {
    constants,
    coefficients: { intercept: coef[0]!, logTvl: coef[1]!, growth: coef[2]!, age: coef[3]! },
    categoryEffects,
    categoryCounts,
    comparables: comparables.length,
    categories: byCategory.size,
    rSquared,
    score,
  };
}
