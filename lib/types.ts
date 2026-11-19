// The shapes the radar passes around: the sealed snapshot, the fitted model's constants, a board row,
// and the compact dataset the dashboard renders.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's tunable constants: what the dashboard states as the model's settings. */
export interface ModelConstants {
  /** The watchlist floor the house drew, in whole dollars. */
  floor_usd: number;
  /** Growth beyond this many per cent a week is clipped. */
  growth_clip: number;
  /** The age an undated protocol is scored at, in days. */
  unknown_age_days: number;
  /** How strongly a category's effect is shrunk toward the market's own level. */
  category_shrink: number;
  /** The pre-token protocols below the floor the early radar carries, by TVL. */
  early_rows: number;
}

/** A farm step: the action, what it costs and how long it takes, as one string the gate accepts. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row, with the model's own arithmetic on it. */
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
  age_days: number | null;
  token_status: 'pre-token';
  implied_value_usd: number;
  value_per_tvl: number;
  comparables: number;
  category_effect: number;
  farm_steps: string[];
}

/** The dashboard's compact view of one ranked row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  value_per_tvl: number;
  comparables: number;
  /** The size-only estimate: the market cap the fit predicts before growth and age are applied. */
  size_only_usd: number;
  growth_factor: number;
  age_factor: number;
  farm_steps: string[];
}

/** A token-bearing protocol: it already trades, so the board shows the market's value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

/** One category's fitted effect and comparable count, for the model panel. */
export interface CategoryEffect {
  category: string;
  effect: number;
  comparables: number;
  median_multiple: number;
}

/** Everything the dashboard needs: the board, the live set, the fit and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  model: ModelConstants;
  model_version: string;
  coefficients: { intercept: number; logTvl: number };
  /** The multipliers growth and age enter by, as assumptions the page states openly. */
  multipliers: {
    growth_weight: number;
    age_weight: number;
    growth_band: [number, number];
    age_band: [number, number];
  };
  r_squared: number;
  comparables: number;
  categories: CategoryEffect[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}
