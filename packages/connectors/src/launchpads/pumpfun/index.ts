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

// Pump.fun frontend API is often blocked, use DexScreener as fallback
const DEXSCREENER_API_URL = 'https://api.dexscreener.com';
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
   * Get connector status - uses DexScreener Solana data
   */
  async getStatus(): Promise<{ connected: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now();
    
    try {
      // Use DexScreener to check Solana connectivity
      const response = await fetch(`${DEXSCREENER_API_URL}/latest/dex/search?q=solana`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ClawFi/0.2.0',
        },
      });

      if (!response.ok) {
        return {
          connected: false,
          error: `DexScreener API returned ${response.status}`,
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
   * Fetch recent token launches from DexScreener (Solana new pairs)
   */
  async fetchRecentLaunches(limit?: number): Promise<LaunchpadToken[]> {
    const tokensLimit = limit || this.config.maxTokensPerRequest;
    
    try {
      // Use DexScreener to get latest Solana tokens
      const response = await fetch(`${DEXSCREENER_API_URL}/token-profiles/latest/v1`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ClawFi/0.2.0',
        },
      });

      if (!response.ok) {
        console.error(`[PumpFun] DexScreener API error: ${response.status}`);
        return [];
      }

      const profiles = await response.json() as Array<{
        url: string;
        chainId: string;
        tokenAddress: string;
        icon?: string;
        description?: string;
      }>;
      
      // Filter to Solana tokens only
      const solanaProfiles = profiles
        .filter(p => p.chainId === 'solana')
        .slice(0, tokensLimit);

      this.lastFetchTime = Date.now();

      // Convert to our format
      const tokens: LaunchpadToken[] = [];
      
      for (const profile of solanaProfiles.slice(0, 20)) {
        try {
          const tokenData = await this.fetchTokenFromDexScreener(profile.tokenAddress);
          if (tokenData) {
            tokens.push(tokenData);
          }
        } catch {
          // Skip failed tokens
        }
      }
      
      return tokens;
    } catch (error) {
      console.error('[PumpFun] Fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch token data from DexScreener
   */
  private async fetchTokenFromDexScreener(address: string): Promise<LaunchpadToken | null> {
    try {
      const response = await fetch(`${DEXSCREENER_API_URL}/tokens/v1/solana/${address}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ClawFi/0.2.0',
        },
      });

      if (!response.ok) return null;

      const pairs = await response.json() as Array<{
        chainId: string;
        pairAddress: string;
        baseToken: { address: string; name: string; symbol: string };
        quoteToken: { address: string; name: string; symbol: string };
        priceUsd: string;
        liquidity?: { usd: number };
        fdv?: number;
        pairCreatedAt?: number;
        info?: { imageUrl?: string };
      }>;

      if (!pairs || pairs.length === 0) return null;

      const pair = pairs[0];
      if (!pair) return null;
      
      const isBaseToken = pair.baseToken.address.toLowerCase() === address.toLowerCase();
      const token = isBaseToken ? pair.baseToken : pair.quoteToken;

      return {
        launchpad: 'pumpfun',
        chain: 'solana',
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        createdAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt) : new Date(),
        creator: '', // Not available from DexScreener
        priceUsd: parseFloat(pair.priceUsd) || undefined,
        marketCapUsd: pair.fdv,
        imageUrl: pair.info?.imageUrl,
        extensions: {
          liquidity: pair.liquidity?.usd,
        },
      };
    } catch {
      return null;
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
   * Fetch token by mint address using DexScreener
   */
  async fetchToken(mint: string): Promise<LaunchpadToken | null> {
    return this.fetchTokenFromDexScreener(mint);
  }

  /**
   * Fetch graduated tokens (bonded to Raydium)
   * Using DexScreener Solana data as Pump.fun API is blocked
   */
  async fetchGraduatedTokens(limit: number = 20): Promise<LaunchpadToken[]> {
    // Return recent launches as graduation data is not available via DexScreener
    return this.fetchRecentLaunches(limit);
  }

  /**
   * Fetch "King of the Hill" (trending) tokens
   * Using DexScreener Solana data as Pump.fun API is blocked
   */
  async fetchTrendingTokens(limit: number = 10): Promise<LaunchpadToken[]> {
    // Return recent launches as trending data is not available via DexScreener
    return this.fetchRecentLaunches(limit);
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
