/**
 * Pump.fun Connector
 * 
 * Monitors new token launches on Pump.fun (Solana)
 * 
 * Pump.fun is a popular memecoin launchpad on Solana with bonding curves.
 * Tokens graduate to Raydium when they reach certain market cap thresholds.
 */

import type { LaunchpadConnector, LaunchpadToken } from '../../types.js';

// ============================================
// Types
// ============================================

export interface PumpFunConfig {
  enabled?: boolean;
  pollIntervalMs?: number;
  maxTokensPerRequest?: number;
  graduationOnly?: boolean; // Only track graduated tokens
}

export interface PumpFunToken {
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  image_uri?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  creator: string;
  created_timestamp: number;
  market_cap?: number;
  usd_market_cap?: number;
  virtual_sol_reserves?: number;
  virtual_token_reserves?: number;
  bonding_curve?: string;
  associated_bonding_curve?: string;
  complete?: boolean; // true if graduated
  raydium_pool?: string;
  king_of_the_hill_timestamp?: number;
  reply_count?: number;
  last_reply?: number;
  nsfw?: boolean;
  total_supply?: number;
}

export interface PumpFunApiResponse {
  success?: boolean;
  data?: PumpFunToken[];
  tokens?: PumpFunToken[];
}

// ============================================
// Constants
// ============================================

const DEFAULT_CONFIG: Required<PumpFunConfig> = {
  enabled: true,
  pollIntervalMs: 15000, // 15 seconds
  maxTokensPerRequest: 50,
  graduationOnly: false,
};

const PUMP_FUN_API_URL = 'https://frontend-api.pump.fun';
const SOLSCAN_URL = 'https://solscan.io';

// ============================================
// Pump.fun Connector
// ============================================

export class PumpFunConnector implements LaunchpadConnector {
  readonly id = 'pumpfun';
  readonly name = 'Pump.fun';
  readonly chain = 'solana' as const;
  readonly type = 'launchpad' as const;

  private config: Required<PumpFunConfig>;
  private lastFetchTime = 0;
  private lastTokenMints = new Set<string>();

  constructor(config: Partial<PumpFunConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if connector is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get connector status
   */
  async getStatus(): Promise<{ connected: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now();
    
    try {
      const response = await fetch(`${PUMP_FUN_API_URL}/coins?limit=1&sort=created_timestamp&order=DESC`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ClawFi/0.2.0',
        },
      });

      if (!response.ok) {
        return {
          connected: false,
          error: `API returned ${response.status}`,
        };
      }

      return {
        connected: true,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Fetch recent token launches
   */
  async fetchRecentLaunches(limit?: number): Promise<LaunchpadToken[]> {
    const tokensLimit = limit || this.config.maxTokensPerRequest;
    
    try {
      const url = new URL(`${PUMP_FUN_API_URL}/coins`);
      url.searchParams.set('limit', String(tokensLimit));
      url.searchParams.set('sort', 'created_timestamp');
      url.searchParams.set('order', 'DESC');
      
      // If graduation only, add filter
      if (this.config.graduationOnly) {
        url.searchParams.set('complete', 'true');
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ClawFi/0.2.0',
        },
      });

      if (!response.ok) {
        console.error(`[PumpFun] API error: ${response.status}`);
        return [];
      }

      const data = await response.json() as PumpFunApiResponse;
      const tokens = data.data || data.tokens || [];

      this.lastFetchTime = Date.now();
      
      return tokens.map((token) => this.mapToken(token));
    } catch (error) {
      console.error('[PumpFun] Fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch new launches since last check
   */
  async fetchNewLaunches(): Promise<LaunchpadToken[]> {
    const allTokens = await this.fetchRecentLaunches();
    
    // Filter to only new tokens
    const newTokens = allTokens.filter(t => !this.lastTokenMints.has(t.address));
    
    // Update cache
    const currentMints = new Set(allTokens.map(t => t.address));
    this.lastTokenMints = currentMints;
    
    return newTokens;
  }

  /**
   * Fetch token by mint address
   */
  async fetchToken(mint: string): Promise<LaunchpadToken | null> {
    try {
      const response = await fetch(`${PUMP_FUN_API_URL}/coins/${mint}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ClawFi/0.2.0',
        },
      });

      if (!response.ok) {
        return null;
      }

      const token = await response.json() as PumpFunToken;
      return this.mapToken(token);
    } catch (error) {
      console.error('[PumpFun] Fetch token error:', error);
      return null;
    }
  }

  /**
   * Fetch graduated tokens (bonded to Raydium)
   */
  async fetchGraduatedTokens(limit: number = 20): Promise<LaunchpadToken[]> {
    try {
      const url = new URL(`${PUMP_FUN_API_URL}/coins`);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('complete', 'true');
      url.searchParams.set('sort', 'king_of_the_hill_timestamp');
      url.searchParams.set('order', 'DESC');

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ClawFi/0.2.0',
        },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as PumpFunApiResponse;
      const tokens = data.data || data.tokens || [];
      
      return tokens.map((token) => this.mapToken(token));
    } catch (error) {
      console.error('[PumpFun] Fetch graduated error:', error);
      return [];
    }
  }

  /**
   * Fetch "King of the Hill" (trending) tokens
   */
  async fetchTrendingTokens(limit: number = 10): Promise<LaunchpadToken[]> {
    try {
      const url = new URL(`${PUMP_FUN_API_URL}/coins`);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('sort', 'usd_market_cap');
      url.searchParams.set('order', 'DESC');
      url.searchParams.set('complete', 'false'); // Still on bonding curve

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ClawFi/0.2.0',
        },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as PumpFunApiResponse;
      const tokens = data.data || data.tokens || [];
      
      return tokens.map((token) => this.mapToken(token));
    } catch (error) {
      console.error('[PumpFun] Fetch trending error:', error);
      return [];
    }
  }

  /**
   * Map Pump.fun token to LaunchpadToken
   */
  private mapToken(token: PumpFunToken): LaunchpadToken {
    const extensions: Record<string, unknown> = {};

    // Social links
    if (token.twitter) extensions.twitter = token.twitter;
    if (token.telegram) extensions.telegram = token.telegram;
    if (token.website) extensions.website = token.website;
    
    // Bonding curve data
    if (token.bonding_curve) extensions.bondingCurve = token.bonding_curve;
    if (token.virtual_sol_reserves !== undefined) {
      extensions.virtualSolReserves = token.virtual_sol_reserves;
    }
    if (token.virtual_token_reserves !== undefined) {
      extensions.virtualTokenReserves = token.virtual_token_reserves;
    }
    
    // Graduation status
    extensions.graduated = token.complete || false;
    if (token.raydium_pool) extensions.raydiumPool = token.raydium_pool;
    if (token.king_of_the_hill_timestamp) {
      extensions.kingOfTheHillTimestamp = token.king_of_the_hill_timestamp;
    }
    
    // Community engagement
    if (token.reply_count !== undefined) extensions.replyCount = token.reply_count;
    
    // Content flags
    if (token.nsfw) extensions.nsfw = true;

    return {
      address: token.mint,
      symbol: token.symbol,
      name: token.name,
      chain: 'solana',
      launchpad: 'pumpfun',
      creator: token.creator,
      createdAt: new Date(token.created_timestamp),
      marketCapUsd: token.usd_market_cap,
      imageUrl: token.image_uri,
      description: token.description,
      verified: false, // Pump.fun doesn't have verification
      warnings: token.nsfw ? ['NSFW content'] : undefined,
      extensions,
      urls: {
        launchpad: `https://pump.fun/${token.mint}`,
        explorer: `${SOLSCAN_URL}/token/${token.mint}`,
        raydium: token.raydium_pool 
          ? `https://raydium.io/swap/?inputCurrency=${token.mint}`
          : undefined,
      },
    };
  }
}

/**
 * Create Pump.fun connector from environment
 */
export function createPumpFunConnector(): PumpFunConnector {
  return new PumpFunConnector({
    enabled: process.env.PUMPFUN_ENABLED !== 'false',
    pollIntervalMs: parseInt(process.env.PUMPFUN_POLL_INTERVAL_MS || '15000', 10),
    graduationOnly: process.env.PUMPFUN_GRADUATION_ONLY === 'true',
  });
}
