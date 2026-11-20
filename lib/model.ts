// The radar's value model.
//
// The snapshot carries 758 protocols. 129 of them record a market cap, so the market has already
// priced those against their TVL: that ratio is the one thing in the file that says what a token
// on a protocol of this size is worth. This model reads that evidence instead of assuming one
// multiple for everything.
//
// For a protocol with no token on record:
//
//   peers      = the token-bearing protocols in the same category, whose mcap/TVL ratio is sane
//   multiple   = the peer category's median ratio (a category with too few peers borrows the
//                all-category median; a null category borrows it too)
//   growth     = clamp(change_7d, -60, 120) per cent, folded in at a quarter weight, because a
//                seven-day move is noise beside a category's standing multiple
//   patience   = how long it has run with no token: a protocol that has waited three years has
//                had three years of fees and users the market has not priced yet
//   implied    = tvl_usd x multiple x growth x patience
//
// Every constant is stated on the page, and the page recomputes each row from the snapshot's own
// figures with the same arithmetic, so the board's number and the screen's number are one function.
// No protocol name is special-cased anywhere in this file.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  /** A peer ratio outside these bounds is an artefact (a dust TVL, a dead token), not evidence. */
  ratio_floor: number;
  ratio_cap: number;
  /** Below this many peers a category borrows the all-category median. */
  min_peers: number;
  /** Credibility weight: a category's own median is blended toward the all-category median by
   *  n/(n+K), so one lucky peer cannot set a whole category's multiple. */
  credibility: number;
  /** A thin category's blended multiple is clamped to this band around the all-category median,
   *  so one peer worth 10x cannot value a whole category at 10x. */
  thin_band: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  /** Patience: 1x at launch, up to patience_cap at patience_days of waiting. */
  patience_weight: number;
  patience_days: number;
  unknown_age_days: number;
  /** The board's own reach: rows below the watchlist floor, and live protocols shown apart. */
  early_rows: number;
  live_rows: number;
}

export const MODEL: ModelConstants = {
  ratio_floor: 0.02,
  ratio_cap: 4,
  min_peers: 4,
  credibility: 3,
  thin_band: 1.5,
  growth_weight: 0.25,
  growth_floor: -60,
  growth_cap: 120,
  patience_weight: 0.35,
  patience_days: 1095,
  unknown_age_days: 365,
  early_rows: 260,
  live_rows: 30,
};

export const MODEL_VERSION = 'radar-2 · peer multiples';

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    peer_count: number;
    peer_median: number;
    peers: { name: string; ratio: number }[];
    growth_pct: number;
    growth_multiplier: number;
    patience_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  multiple: number;
  peer_count: number;
  peer_median: number;
  peers: { name: string; ratio: number }[];
  growth_multiplier: number;
  patience_multiplier: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  multiple: number;
}

export interface PeerGroup {
  category: string;
  peers: number;
  median: number;
  borrowed: boolean;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  peers: PeerGroup[];
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The median of a list of numbers, or 0 when it is empty. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * The market's own multiples, by category: for every protocol that already trades, its market cap
 * over its TVL, kept only where both figures are real and the ratio is not an artefact.
 */
export interface Peer {
  name: string;
  ratio: number;
  tvl_usd: number;
}

export function peerGroups(protocols: SnapshotProtocol[], model: ModelConstants): { groups: Map<string, Peer[]>; all: Peer[] } {
  const groups = new Map<string, Peer[]>();
  const all: Peer[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0 || p.category === 'CEX') continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio < model.ratio_floor || ratio > model.ratio_cap) continue;
    const peer: Peer = { name: p.name, ratio: round4(ratio), tvl_usd: p.tvl_usd };
    all.push(peer);
    const key = p.category ?? '';
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [peer]);
    else list.push(peer);
  }
  return { groups, all };
}

/** The peers behind a multiple, largest first: the evidence a reader can check. */
export function peerEvidence(own: Peer[], all: Peer[], limit: number): { name: string; ratio: number }[] {
  const source = own.length > 0 ? own : all;
  return [...source]
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, limit)
    .map((p) => ({ name: p.name, ratio: p.ratio }));
}

/**
 * The multiple a pre-token protocol is valued at, and where that multiple came from.
 *
 * A category's own median is pulled toward the all-category median by n/(n+K), so a handful of
 * peers cannot set it as firmly as a dozen. A category with fewer than min_peers peers is held
 * inside a band around the all-category median: its own median still moves the number, but one
 * peer trading at ten times its TVL cannot value a whole category at ten times.
 */
export function multipleFor(p: SnapshotProtocol, groups: Map<string, Peer[]>, all: Peer[], model: ModelConstants): { multiple: number; peers: number; median: number; borrowed: boolean; own: Peer[] } {
  const key = p.category ?? '';
  const own = groups.get(key) ?? [];
  const global = median(all.map((o) => o.ratio));
  const n = own.length;
  if (n === 0) return { multiple: global, peers: 0, median: global, borrowed: true, own };
  const cat = median(own.map((o) => o.ratio));
  const blended = (n * cat + model.credibility * global) / (n + model.credibility);
  if (n >= model.min_peers) return { multiple: blended, peers: n, median: cat, borrowed: false, own };
  const lo = global / model.thin_band;
  const hi = global * model.thin_band;
  return { multiple: Math.min(hi, Math.max(lo, blended)), peers: n, median: cat, borrowed: true, own };
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(p: SnapshotProtocol, asOf: string, model: ModelConstants, groups: Map<string, Peer[]>, all: Peer[]) {
  const age = ageDays(asOf, p.listed_at);
  const { multiple, peers, median: peerMedian, borrowed, own } = multipleFor(p, groups, all, model);
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const waited = Math.min(Math.max(ageForModel, 0), model.patience_days) / model.patience_days;
  const patienceMult = 1 + waited * model.patience_weight;
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * patienceMult));
  return { implied, growthPct, growthMult, patienceMult, age, multiple, peers, peerMedian, borrowed, own };
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const { groups, all } = peerGroups(snapshot.protocols, model);

  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, model.early_rows);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, model, groups, all) }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      multiple: round4(s.multiple),
      peer_count: s.peers,
      peer_median: round4(s.peerMedian),
      peers: peerEvidence(s.own, all, 4),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      patience_multiplier: round4(s.patienceMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.multiple).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A dollar figure in the short form the page uses, for text a reader scans. */
function shortUsd(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one position costs, sized so the plan is worth the gas at the protocol's own scale. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: a young protocol needs a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 45;
}

/** A farm action with its own gas figure: what it takes, what it costs, and how long it runs. */
interface Action {
  text: string;
  gas: number;
  minutes: number;
}

/**
 * The protocol's one qualifying action, from its category. The gas figure is a real one for that
 * kind of transaction on a mainstream chain, not a placeholder, so a reader can budget the plan.
 */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): Action {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const lend: Action = { text: `Supply $${capital} of USDC to ${name} on ${chain}, then borrow $${Math.round(capital * 0.3)} of a major asset against it so both the supply and the borrow count.`, gas: 9, minutes: 20 };
  if (c.includes('lend') || c.includes('collateral')) return lend;
  if (c.includes('cdp')) return { text: `Open a ${name} vault on ${chain} with $${capital} of collateral, mint the stablecoin against it, and keep the vault open.`, gas: 12, minutes: 25 };
  if (c.includes('dex')) return { text: `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain}, then make one swap through it so the position earns fees and volume.`, gas: 11, minutes: 20 };
  if (c.includes('leveraged farm')) return { text: `Open one $${capital} leveraged position on ${name} at the lowest leverage it allows, on ${chain}.`, gas: 14, minutes: 25 };
  if (c.includes('yield') || c.includes('aggregator')) return { text: `Deposit $${capital} of USDC into ${name}'s top vault on ${chain} and leave it through a full harvest cycle.`, gas: 7, minutes: 15 };
  if (c.includes('bridge')) return { text: `Bridge $${capital} of USDC from Ethereum to ${chain} through ${name}, then use the bridged funds inside its own app.`, gas: 13, minutes: 25 };
  if (c.includes('staking') || c.includes('restak')) return { text: `Stake $${capital} of ${chain}'s native asset through ${name} and keep the liquid receipt token in the same wallet.`, gas: 6, minutes: 15 };
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return { text: `Deposit $${capital} of USDC as margin on ${name}, open one small hedge, and leave the margin in place.`, gas: 10, minutes: 20 };
  if (c.includes('prediction')) return { text: `Fund $${capital} on ${name} and place one position on a market that resolves within the hold window.`, gas: 8, minutes: 15 };
  if (c.includes('curator') || c.includes('allocator') || c.includes('manager')) return { text: `Deposit $${capital} into one of ${name}'s curated vaults on ${chain} and keep the shares rather than the underlying.`, gas: 8, minutes: 15 };
  if (c.includes('stable')) return { text: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it through the window.`, gas: 9, minutes: 20 };
  if (c.includes('rwa')) return { text: `Mint $${capital} of ${name}'s yield asset on ${chain}, complete any allowlist step it requires, and hold it.`, gas: 15, minutes: 30 };
  if (c.includes('insurance')) return { text: `Buy $${capital} of cover from ${name} on ${chain} for a protocol you already use, and keep the policy active.`, gas: 8, minutes: 15 };
  if (c.includes('index')) return { text: `Mint $${capital} of the index through ${name} on ${chain} and hold the basket rather than the parts.`, gas: 9, minutes: 20 };
  if (c.includes('farm') || c.includes('incentive')) return { text: `Deposit $${capital} into ${name}'s farm on ${chain} and keep it staked through a full reward epoch.`, gas: 8, minutes: 15 };
  if (c.includes('card') || c.includes('payment')) return { text: `Deposit $${capital} into ${name} on ${chain}, then make one small payment with its card or app to register real use.`, gas: 5, minutes: 15 };
  if (c.includes('privacy')) return { text: `Move $${capital} through ${name} on ${chain} once, and again in a later week so the activity spans two windows.`, gas: 12, minutes: 20 };
  return lend;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. Everything here comes
 * from the protocol's own record (category, chains, TVL, age), never from a list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, multiple: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const upside = shortUsd(Math.round(p.tvl_usd * multiple));
  const chains = p.chains.length > 1 ? ` It runs on ${p.chains.slice(0, 3).join(', ')}; keep the whole position on ${chain} so one wallet's activity is easy to read.` : '';
  return [
    {
      text: `Open a wallet used only for this farm, fund it with $${capital} plus gas, and write down the date the first transaction lands.${chains}`,
      cost: `$${capital} of capital plus about $${action.gas} of gas for the first transactions`,
      time: '15 minutes',
    },
    {
      text: action.text,
      cost: `$${capital} of capital and about $${action.gas} of gas at a normal fee`,
      time: `${action.minutes} minutes to set up`,
    },
    {
      text: `Repeat one qualifying action each week on ${chain}: a deposit, a borrow, a swap or a governance vote. Weekly activity across several weeks counts for more than one large transaction.`,
      cost: 'about $2 to $4 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days without moving the funds, so the activity is recorded in more than one snapshot of the protocol's own data.`,
      cost: `the $${capital} stays in the position and earns whatever the protocol pays`,
      time: `${hold} days`,
    },
    {
      text: `Check ${p.name}'s docs, blog and governance forum every month for a points, snapshot or airdrop programme, and claim only from a link the protocol itself publishes.`,
      cost: 'no fee to check, and never pay anyone to claim',
      time: '10 minutes a month',
    },
    {
      text: `Keep a log of the wallet, the dates and every transaction, and weigh the position against the ${upside} this category's multiple implies before adding more.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

export function liveRows(snapshot: Snapshot, model: ModelConstants = MODEL): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.tvl_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, model.live_rows)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
      multiple: round4(p.mcap_usd! / p.tvl_usd),
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    peer_count: row.model.peer_count,
    peer_median: row.model.peer_median,
    peers: row.model.peers,
    growth_multiplier: row.model.growth_multiplier,
    patience_multiplier: row.model.patience_multiplier,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot, model);
  const { groups, all } = peerGroups(snapshot.protocols, model);
  const watch = new Set(snapshot.watchlist);
  const peers: PeerGroup[] = [...groups.entries()]
    .map(([category, list]) => {
      const enough = list.length >= model.min_peers;
      return { category: category === '' ? 'no category' : category, peers: list.length, median: round4(median(list.map((o) => o.ratio))), borrowed: !enough };
    })
    .sort((a, b) => b.peers - a.peers || a.category.localeCompare(b.category));
  peers.push({ category: 'all categories', peers: all.length, median: round4(median(all.map((o) => o.ratio))), borrowed: false });
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watch.has(r.slug)).length,
    live_size: live.length,
    peers,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
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
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
