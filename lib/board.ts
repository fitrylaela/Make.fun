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
import {
  AGE_FACTOR_BAND,
  AGE_WEIGHT,
  GROWTH_FACTOR_BAND,
  GROWTH_WEIGHT,
  ageDays,
  fitValuation,
  hasToken,
  isComparable,
} from './valuation.ts';

export const MODEL_VERSION = 'comps-2';

export const MODEL: ModelConstants = {
  floor_usd: 50_000_000,
  growth_clip: 50,
  unknown_age_days: 365,
  category_shrink: 20,
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

/** A dollar figure in the unit a reader thinks in: $2.8B, $513.8M, $45.2K. */
function compactUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
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

/** A category's plan: what to do, how to stay active, what to check before claiming, what to record. */
interface CategoryPlan {
  qualify: string;
  earns: string;
  retain: string;
  claim: string;
  record: string;
}

/** The category's plan, in words a farmer can follow, from the protocol's own record. */
function planFor(p: SnapshotProtocol, capital: number, chain: string): CategoryPlan {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return {
      qualify: `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`,
      earns: 'supply-side interest and a borrowing position that counts as usage',
      retain: `Borrow a small amount against the supply — well under the position's limit — and repay it a few days later. A lending protocol counts a wallet that both supplies and borrows as a real user, not a one-way depositor.`,
      claim: `Check ${name}'s own app for a points or rewards tab before withdrawing, and confirm whether rewards accrue on supplied balance, borrowed balance or both; claiming from a link anyone else posted is how farm wallets get drained.`,
      record: `the supply and borrow transaction hashes, the market you used, and the health factor you left the position at`,
    };
  if (c.includes('dex') || c.includes('leveraged farm'))
    return {
      qualify: `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain}.`,
      earns: 'swap fees and a liquidity position in the protocol\'s own pool',
      retain: `Re-range or rebalance the position once a week rather than leaving it out of range; an out-of-range position earns nothing and reads as inactive, while a rebalance is a second week of qualifying activity.`,
      claim: `Check whether ${name} rewards the pool you chose or only listed pools, and whether fees must be claimed before the position is closed; unclaimed fees are the most commonly forfeited reward on a DEX.`,
      record: `the pool address, the position NFT id if the DEX issues one, and each rebalance's transaction hash`,
    };
  if (c.includes('yield'))
    return {
      qualify: `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain}.`,
      earns: 'vault yield and a deposit that stays through the snapshot',
      retain: `Leave the deposit through at least one full epoch and check the vault's share price moved, rather than adding and removing in the same week; a deposit that spans a snapshot is what a points program can see.`,
      claim: `Confirm on ${name}'s own page whether rewards are paid in the vault's own token or a separate one, and whether the vault must be exited to claim.`,
      record: `the vault address, the share count you received, and the entry and exit share prices`,
    };
  if (c.includes('bridge'))
    return {
      qualify: `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds there.`,
      earns: 'bridging volume in both directions',
      retain: `Bridge back a portion after a few days rather than leaving funds stranded. Volume in both directions is what a bridge measures, and a round trip costs little on a cheap chain.`,
      claim: `Bridge points are usually counted per direction and per chain pair, so check ${name}'s own dashboard for which pairs qualify before you assume your route counted.`,
      record: `each route's source and destination chain, the transaction hash on both sides, and the amount that actually arrived after fees`,
    };
  if (c.includes('staking') || c.includes('restak'))
    return {
      qualify: `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`,
      earns: 'staking yield on the receipt, held rather than sold',
      retain: `Hold the receipt token rather than selling it; a receipt that is sold back to the market is a wallet that took the yield and left, which is the opposite of what a restaking points program rewards.`,
      claim: `Check whether ${name} rewards the receipt token holder or the underlying staker, and whether an unbonding period delays the exit past the snapshot.`,
      record: `the receipt token's contract address, the amount minted, and the unbonding period that applies to your position`,
    };
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('basis'))
    return {
      qualify: `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedge.`,
      earns: 'trading volume with the margin kept on the venue',
      retain: `Keep the margin on the venue between trades instead of withdrawing after each one; a margin balance that stays is what a trading points program measures, and it costs nothing to leave it there.`,
      claim: `Check ${name}'s own fee and rewards page for whether points follow volume, open interest or margin held — the three reward very different behaviour.`,
      record: `each position's size, entry and exit, the funding paid, and the margin balance you kept on the venue`,
    };
  if (c.includes('prediction'))
    return {
      qualify: `Fund $${capital} on ${name} and take one position on a market you can follow.`,
      earns: 'a settled position in the protocol\'s own market',
      retain: `Let at least one position settle rather than closing it early; a settled position is a resolved trade the protocol can verify, while an early exit is indistinguishable from wash activity.`,
      claim: `Check whether ${name} rewards volume, liquidity provided, or markets resolved, and claim only from the protocol's own site.`,
      record: `the market you took, the price you entered at, the resolution, and the payout transaction hash`,
    };
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk') || c.includes('liquidity manager'))
    return {
      qualify: `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`,
      earns: 'vault shares that stay allocated through the snapshot',
      retain: `Stay in one vault across a full reallocation cycle instead of hopping between vaults; a curator's points follow allocation that persisted, not deposits that moved weekly.`,
      claim: `Read the vault's own fee and rewards terms on ${name}'s page; a curator vault can pay rewards in the underlying, in a separate token, or not at all, and the terms differ per vault.`,
      record: `the vault address, the shares you hold, and the curator's stated fee so you can net the yield against it`,
    };
  if (c.includes('stable'))
    return {
      qualify: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`,
      earns: 'supply of the stable asset and its peg volume',
      retain: `Hold the minted asset across a snapshot rather than minting and redeeming in one session; a stablecoin's usage is measured by supply that persisted.`,
      claim: `Check ${name}'s own page for whether rewards follow minting, holding or providing liquidity, and whether a redemption fee eats the yield.`,
      record: `the mint and redemption hashes, the collateral ratio you left the position at, and the redemption fee that applied`,
    };
  if (c.includes('rwa'))
    return {
      qualify: `Mint $${capital} of ${name}'s yield asset on ${chain} and hold it.`,
      earns: 'the yield the asset pays while it is held',
      retain: `Hold through at least one distribution date; an RWA pays on a schedule, so a position closed before the date earns the exposure and none of the yield.`,
      claim: `Check ${name}'s own terms for the distribution schedule, any lock-up, and whether the asset can be redeemed at all on ${chain}.`,
      record: `the asset's contract address, the distribution dates you held through, and the yield actually paid`,
    };
  if (c.includes('insurance'))
    return {
      qualify: `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`,
      earns: 'premium the protocol keeps, with the cover held',
      retain: `Keep the policy active past its first period rather than cancelling; underwriting capacity that stayed is what an insurance protocol counts.`,
      claim: `Check ${name}'s own page for whether rewards follow premium paid, cover provided as an underwriter, or capital staked in the backstop.`,
      record: `the policy id, the premium paid, the cover period, and the claim terms you were given`,
    };
  if (c.includes('index'))
    return {
      qualify: `Mint $${capital} of ${name}'s index on ${chain} and hold the basket.`,
      earns: 'the index exposure, held rather than redeemed',
      retain: `Hold the index across a rebalance rather than minting and redeeming around it; a rebalance is where an index protocol sees who actually tracks it.`,
      claim: `Check ${name}'s own page for the rebalance schedule and whether rewards follow holding or minting volume.`,
      record: `the index token address, the components you received, and the rebalance dates you held through`,
    };
  if (c.includes('launchpad'))
    return {
      qualify: `Fund $${capital} on ${name} on ${chain} and take part in one launch.`,
      earns: 'a subscription that counts as demand on the launchpad',
      retain: `Take part in a second launch rather than one; a launchpad measures repeat participation, and a single subscription reads as a one-off.`,
      claim: `Check ${name}'s own page for whether rewards follow subscription size, number of launches joined, or tokens held after the sale.`,
      record: `each launch you joined, the amount subscribed, the allocation received, and the vesting terms`,
    };
  if (c.includes('chain'))
    return {
      qualify: `Bridge $${capital} of USDC onto ${name} through its official bridge and use the funds there.`,
      earns: 'bridged liquidity and on-chain activity on the chain itself',
      retain: `Keep the funds on ${name} and make a few transactions over separate weeks; a chain measures addresses that stayed and used it, not addresses that bridged in and straight out.`,
      claim: `Check ${name}'s own official channels for an incentives or points program, and treat any other link as hostile — chain airdrop phishing is the most common drain of farm wallets.`,
      record: `the bridge transaction hash, the address you used on ${name}, and every transaction you made there`,
    };
  if (c.includes('payment') || c.includes('card'))
    return {
      qualify: `Move $${capital} through ${name} on ${chain} and complete one real transaction end to end.`,
      earns: 'settled volume the protocol can verify, not a deposit that sat idle',
      retain: `Complete a second transaction in a later week rather than one large one; payment products measure recurring settled volume.`,
      claim: `Check ${name}'s own terms for whether rewards follow volume, cards issued or merchants onboarded, and whether a fee applies to the route you used.`,
      record: `each transaction's amount, date and hash, and the fee the protocol charged`,
    };
  if (c.includes('otc') || c.includes('governance') || c.includes('farm') || c.includes('cedefi') || c.includes('cefi') || c.includes('btc'))
    return {
      qualify: `Deposit $${capital} into ${name} on ${chain} through the product its own site documents, and keep the position open.`,
      earns: 'a position the protocol itself records against your address',
      retain: `Return in a later week and make one more qualifying action rather than depositing once; a protocol with no points page yet still measures wallets that came back.`,
      claim: `Read ${name}'s own documentation for how it intends to recognise users, and claim only from a link the protocol itself publishes — never from a third party.`,
      record: `the product you used, the transaction hashes, and the terms the protocol published when you entered`,
    };
  return {
    qualify: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    earns: 'a deposit that stays in the protocol through the snapshot',
    retain: `Return in a later week and make one more qualifying action rather than depositing once; a protocol with no points page yet still measures wallets that came back.`,
    claim: `Check ${name}'s own site or docs for a points or rewards page before withdrawing, and claim only from a link the protocol itself publishes.`,
    record: `the transaction hashes, the amount deposited, and the terms the protocol published when you entered`,
  };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. Every step is derived from
 * the protocol's own record (category, chains, TVL, growth, age), never from a hand-written list of
 * names, and no step is the same sentence for every protocol.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  const { qualify, earns, retain, claim, record } = planFor(p, capital, chain);
  const otherChains = p.chains.slice(1, 3);
  const growth = p.change_7d;
  const growthNote =
    growth === null || !Number.isFinite(growth)
      ? 'its seven-day change is unrecorded'
      : growth > 0
        ? `it grew ${growth.toFixed(1)}% over seven days`
        : `it fell ${Math.abs(growth).toFixed(1)}% over seven days`;
  return [
    {
      text: `Fund a wallet on ${chain} with $${capital} of USDC plus about $${gas} of the chain's own gas token${otherChains.length > 0 ? `; ${p.name} also runs on ${otherChains.join(' and ')}, but ${chain} is where its TVL is largest` : ''}. Use a wallet you keep for this position alone.`,
      cost: `$${capital + gas} in total, of which $${gas} is gas`,
      time: '10 minutes',
    },
    {
      text: `${qualify} This is the qualifying action: ${earns}.`,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: retain,
      cost: 'about $2 to $5 of gas for the second action',
      time: '10 minutes, in a later week',
    },
    {
      text: `Keep the position open for at least ${hold} days. ${p.name} holds ${compactUsd(p.tvl_usd)} of TVL and has run ${age === null ? 'an unrecorded time' : `${age} days`} without a token, and ${growthNote} — a record like that rewards positions held across snapshots, not one-day in-and-out.`,
      cost: `the $${capital} stays in the position and is not spent`,
      time: `${hold} days`,
    },
    {
      text: claim,
      cost: 'nothing to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Log ${record}, and keep the log where the position is not — a wallet compromised with its own history is a farm lost with its proof.`,
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
    size_only_usd: score.sizeOnly,
    growth_factor: Math.round(score.growthFactor * 1e4) / 1e4,
    age_factor: Math.round(score.ageFactor * 1e4) / 1e4,
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
    size_only_usd: row.size_only_usd,
    growth_factor: row.growth_factor,
    age_factor: row.age_factor,
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
    },
    multipliers: {
      growth_weight: GROWTH_WEIGHT,
      age_weight: AGE_WEIGHT,
      growth_band: [GROWTH_FACTOR_BAND[0], GROWTH_FACTOR_BAND[1]],
      age_band: [AGE_FACTOR_BAND[0], AGE_FACTOR_BAND[1]],
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
