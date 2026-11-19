// The radar's board: which protocols to rank, in what order, and the farm plan each row carries.
//
// The watchlist is the floor, never the ceiling. Every watchlist slug is on the board, and the early
// radar adds the pre-token protocols below the house's floor, by size: they are the launches the
// radar exists to find before anyone else does. Token-bearing protocols are never ranked against
// pre-token ones: the market already prices them, so they are shown apart with their own market caps.

import type {
  BoardRow,
  CategoryEffect,
  FarmStep,
  LiveRow,
  ModelConstants,
  RadarData,
  RadarRow,
  Snapshot,
  SnapshotProtocol,
} from './types.ts';
import { ageDays, clippedGrowth, fitValuation, hasToken, isComparable } from './valuation.ts';

export const MODEL_VERSION = 'comps-1';

export const MODEL: ModelConstants = {
  floor_usd: 50_000_000,
  growth_clip: 50,
  unknown_age_days: 365,
  category_shrink: 4,
  early_rows: 200,
};

/** How many token-bearing protocols the Live view carries, by market cap. */
const LIVE_ROWS = 24;

/** DefiLlama's version marker: a name ending in a release is a pool of another protocol, not a launch. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The exchange prefixes a wrapped product carries. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * The categories whose protocols are a representation of a token that already trades, not a protocol
 * still waiting on a launch of its own: a canonical bridge, a liquid staking receipt, a restaked BTC
 * wrapper and an exchange's own product all carry someone else's asset, so they are never a launch.
 */
const NOT_A_LAUNCH = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Whether the protocol records no token at all: the radar's subject. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a pre-token protocol is a launch candidate rather than a pool, a bridge or an exchange's
 * product. WBTC is Bitcoin on Ethereum and Base Bridge is Base's canonical gateway: neither is a
 * protocol still waiting on a token of its own, so neither is what this radar is looking for.
 */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && NOT_A_LAUNCH.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  if (EXCHANGES.some((e) => p.name.toLowerCase().startsWith(e.toLowerCase()))) return false;
  return true;
}

/** A step as one string within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The chain a reader will actually use: the first one, which is where the TVL is largest. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one position takes, from the protocol's own size. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long a position has to stay open, from how long the protocol has run: young ones need longer. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's qualifying action, in words a farmer can follow, and what it earns on. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): { action: string; earns: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return { action: `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`, earns: 'supply-side interest and a borrowing position that counts as usage' };
  if (c.includes('dex') || c.includes('leveraged farm'))
    return { action: `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain}.`, earns: 'swap fees and a liquidity position in the protocol\'s own pool' };
  if (c.includes('yield'))
    return { action: `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain}.`, earns: 'vault yield and a deposit that stays through the snapshot' };
  if (c.includes('bridge'))
    return { action: `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds there.`, earns: 'bridging volume in both directions' };
  if (c.includes('staking') || c.includes('restak'))
    return { action: `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`, earns: 'staking yield on the receipt, held rather than sold' };
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options'))
    return { action: `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedge.`, earns: 'trading volume with the margin kept on the venue' };
  if (c.includes('prediction'))
    return { action: `Fund $${capital} on ${name} and take one position on a market you can follow.`, earns: 'a settled position in the protocol\'s own market' };
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk'))
    return { action: `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`, earns: 'vault shares that stay allocated through the snapshot' };
  if (c.includes('stable'))
    return { action: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`, earns: 'supply of the stable asset and its peg volume' };
  if (c.includes('rwa'))
    return { action: `Mint $${capital} of ${name}'s yield asset on ${chain} and hold it.`, earns: 'the yield the asset pays while it is held' };
  if (c.includes('insurance'))
    return { action: `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`, earns: 'premium the protocol keeps, with the cover held' };
  if (c.includes('index'))
    return { action: `Mint $${capital} of ${name}'s index on ${chain} and hold the basket.`, earns: 'the index exposure, held rather than redeemed' };
  if (c.includes('launchpad'))
    return { action: `Fund $${capital} on ${name} on ${chain} and take part in one launch.`, earns: 'a subscription that counts as demand on the launchpad' };
  return { action: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`, earns: 'a deposit that stays in the protocol through the snapshot' };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. Every step is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  const { action, earns } = actionFor(p, capital, chain);
  return [
    {
      text: `Open a fresh wallet for this position alone and keep its seed phrase offline; never reuse the wallet you hold long-term funds in.`,
      cost: 'under $3 of gas to create and fund the wallet',
      time: '5 minutes',
    },
    {
      text: `${action} This is the qualifying action: ${earns}.`,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Return once a week and make one more qualifying action, such as a deposit, a borrow, a swap or a vote, so the wallet is active in more than one week.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days. A protocol that has run ${age === null ? 'an unrecorded time' : `${age} days`} without a token is most likely to reward positions that were open across several snapshots, not one-day in-and-out.`,
      cost: `the $${capital} stays in the position and is not spent`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own site or docs and check for a points or rewards page; claim only from the link the protocol itself publishes, and never pay a fee to claim.`,
      cost: 'nothing to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet address, every date and every transaction hash in a farm log, so the position can be repeated or unwound without guessing what it was.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The board: every watchlist slug, then the early pre-token protocols below the floor, ranked. */
export function buildBoard(snapshot: Snapshot, constants: ModelConstants = MODEL): BoardRow[] {
  const valuation = fitValuation(snapshot, constants);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();

  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }

  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isLaunchCandidate(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, constants.early_rows);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, score: valuation.score(p) }));
  scored.sort((a, b) => b.score.implied - a.score.implied || (a.p.slug < b.p.slug ? -1 : 1));

  return scored.map(({ p, score }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    age_days: ageDays(snapshot.as_of, p.listed_at),
    token_status: 'pre-token' as const,
    implied_value_usd: score.implied,
    value_per_tvl: Math.round((score.implied / p.tvl_usd) * 1e4) / 1e4,
    comparables: score.comparables,
    category_effect: Math.round(score.categoryEffect * 1e3) / 1e3,
    farm_steps: farmSteps(p, ageDays(snapshot.as_of, p.listed_at)).map(stepText),
  }));
}

/** The token-bearing protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter(isComparable)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd!)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
    }));
}

/** Each category's fitted effect, strongest first, with the median multiple its comparables trade at. */
export function categoryEffects(snapshot: Snapshot, constants: ModelConstants = MODEL): CategoryEffect[] {
  const valuation = fitValuation(snapshot, constants);
  const multiples = new Map<string, number[]>();
  for (const p of snapshot.protocols.filter(isComparable)) {
    const c = p.category ?? 'Uncategorised';
    const list = multiples.get(c) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    multiples.set(c, list);
  }
  return Object.entries(valuation.categoryEffects)
    .map(([category, effect]) => {
      const list = (multiples.get(category) ?? []).sort((a, b) => a - b);
      const mid = list.length >> 1;
      const medianMultiple = list.length === 0 ? 0 : list.length % 2 === 1 ? list[mid]! : (list[mid - 1]! + list[mid]!) / 2;
      return {
        category,
        effect: Math.round(effect * 1e3) / 1e3,
        comparables: valuation.categoryCounts[category] ?? 0,
        median_multiple: Math.round(medianMultiple * 1e4) / 1e4,
      };
    })
    .sort((a, b) => b.effect - a.effect);
}

/** A board row's compact form for data.js. */
function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    value_per_tvl: row.value_per_tvl,
    comparables: row.comparables,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, constants: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const valuation = fitValuation(snapshot, constants);
  const board = buildBoard(snapshot, constants);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    model: constants,
    model_version: MODEL_VERSION,
    coefficients: {
      intercept: Math.round(valuation.coefficients.intercept * 1e4) / 1e4,
      logTvl: Math.round(valuation.coefficients.logTvl * 1e4) / 1e4,
      growth: Math.round(valuation.coefficients.growth * 1e5) / 1e5,
      age: Math.round(valuation.coefficients.age * 1e4) / 1e4,
    },
    r_squared: Math.round(valuation.rSquared * 1e3) / 1e3,
    comparables: valuation.comparables,
    categories: categoryEffects(snapshot, constants),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug(s): ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++)
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd)
    return `all ${board.length} rows share one implied value`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the gate's 100`;
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new Error('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new Error('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || o.floor_usd <= 0) throw new Error('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new Error('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string'))
    throw new Error('snapshot.json has no watchlist of slugs');
  const protocols = (o.protocols as unknown[]).map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd))
      throw new Error(`protocol ${i} lacks a slug, a name or a TVL`);
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    } satisfies SnapshotProtocol;
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}
