/**
 * FourMeme Connector
 * 
 * Monitors new token launches on Four.meme (BSC)
 * 
 * Four.meme is a memecoin launchpad on BNB Smart Chain with 
 * bonding curves similar to Pump.fun.
 */

import type { LaunchpadConnector, LaunchpadToken, LaunchpadChain } from '../../types.js';

// ============================================
// Types
// ============================================

export interface FourMemeConfig {
  enabled?: boolean;
  pollIntervalMs?: number;
  maxTokensPerRequest?: number;
  minMarketCapUsd?: number;
}

export interface FourMemeToken {
  address: string;
  symbol: string;
  name: string;
  image?: string;
  description?: string;
  creator?: string;
  createdAt?: string;
  launchAt?: number;
  marketCap?: number;
  priceUsd?: number;
  holders?: number;
  volume24h?: number;
  priceChange24h?: number;
  bondingCurve?: string;
  graduated?: boolean;
  pancakePool?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  status?: 'active' | 'graduated' | 'failed';
}

export interface FourMemeApiResponse {
  success?: boolean;
  code?: number;
  data?: FourMemeToken[] | { list?: FourMemeToken[]; total?: number };
  message?: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_CONFIG: Required<FourMemeConfig> = {
  enabled: true,
  pollIntervalMs: 15000,
  maxTokensPerRequest: 50,
  minMarketCapUsd: 0,
};

const FOURMEME_API_URL = 'https://four.meme/api';
const BSCSCAN_URL = 'https://bscscan.com';

// ============================================
// FourMeme Connector
// ============================================

export class FourMemeConnector implements LaunchpadConnector {
  readonly id = 'fourmeme';
  readonly name = 'Four.meme';
  readonly chain: LaunchpadChain = 'bsc';
  readonly type = 'launchpad' as const;

  private config: Required<FourMemeConfig>;
  private lastFetchTime = 0;
  private lastTokenAddresses = new Set<string>();

  constructor(config: Partial<FourMemeConfig> = {}) {
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
      const response = await fetch(`${FOURMEME_API_URL}/tokens?limit=1&sort=created`, {
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
      const url = new URL(`${FOURMEME_API_URL}/tokens`);
      url.searchParams.set('limit', String(tokensLimit));
      url.searchParams.set('sort', 'created');
      url.searchParams.set('order', 'desc');

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ClawFi/0.2.0',
        },
      });

      if (!response.ok) {
        console.error(`[FourMeme] API error: ${response.status}`);
        return [];
      }

      const json = await response.json() as FourMemeApiResponse;
      
      // Handle different response formats
      let tokens: FourMemeToken[] = [];
      if (Array.isArray(json.data)) {
        tokens = json.data;
      } else if (json.data && 'list' in json.data) {
        tokens = json.data.list || [];
      }

      this.lastFetchTime = Date.now();
      
      // Filter by minimum market cap if set
      if (this.config.minMarketCapUsd > 0) {
        tokens = tokens.filter(t => (t.marketCap || 0) >= this.config.minMarketCapUsd);
      }
      
      return tokens.map((token) => this.mapToken(token));
    } catch (error) {
      console.error('[FourMeme] Fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch new launches since last check
   */
  async fetchNewLaunches(): Promise<LaunchpadToken[]> {
    const allTokens = await this.fetchRecentLaunches();
    
    // Filter to only new tokens
    const newTokens = allTokens.filter(t => !this.lastTokenAddresses.has(t.address));
    
    // Update cache
    const currentAddresses = new Set(allTokens.map(t => t.address));
    this.lastTokenAddresses = currentAddresses;
    
    return newTokens;
  }

  /**
   * Fetch token by address
   */
  async fetchToken(address: string): Promise<LaunchpadToken | null> {
    try {
      const response = await fetch(`${FOURMEME_API_URL}/tokens/${address}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ClawFi/0.2.0',
        },
      });

      if (!response.ok) {
        return null;
      }

      const json = await response.json() as { data?: FourMemeToken };
      if (!json.data) return null;

      return this.mapToken(json.data);
    } catch (error) {
      console.error('[FourMeme] Fetch token error:', error);
      return null;
    }
  }

  /**
   * Fetch graduated tokens (listed on PancakeSwap)
   */
  async fetchGraduatedTokens(limit: number = 20): Promise<LaunchpadToken[]> {
    try {
      const url = new URL(`${FOURMEME_API_URL}/tokens`);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('status', 'graduated');
      url.searchParams.set('sort', 'graduatedAt');
      url.searchParams.set('order', 'desc');

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ClawFi/0.2.0',
        },
      });

      if (!response.ok) {
        return [];
      }

      const json = await response.json() as FourMemeApiResponse;
      let tokens: FourMemeToken[] = [];
      if (Array.isArray(json.data)) {
        tokens = json.data;
      } else if (json.data && 'list' in json.data) {
        tokens = json.data.list || [];
      }
      
      return tokens.map((token) => this.mapToken(token));
    } catch (error) {
      console.error('[FourMeme] Fetch graduated error:', error);
      return [];
    }
  }

  /**
   * Fetch trending tokens by market cap
   */
  async fetchTrendingTokens(limit: number = 10): Promise<LaunchpadToken[]> {
    try {
      const url = new URL(`${FOURMEME_API_URL}/tokens`);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('sort', 'marketCap');
      url.searchParams.set('order', 'desc');
      url.searchParams.set('status', 'active');

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ClawFi/0.2.0',
        },
      });

      if (!response.ok) {
        return [];
      }

      const json = await response.json() as FourMemeApiResponse;
      let tokens: FourMemeToken[] = [];
      if (Array.isArray(json.data)) {
        tokens = json.data;
      } else if (json.data && 'list' in json.data) {
        tokens = json.data.list || [];
      }
      
      return tokens.map((token) => this.mapToken(token));
    } catch (error) {
      console.error('[FourMeme] Fetch trending error:', error);
      return [];
    }
  }

  /**
   * Map FourMeme token to LaunchpadToken
   */
  private mapToken(token: FourMemeToken): LaunchpadToken {
    const extensions: Record<string, unknown> = {};

    // Social links
    if (token.twitter) extensions.twitter = token.twitter;
    if (token.telegram) extensions.telegram = token.telegram;
    if (token.website) extensions.website = token.website;
    
    // Bonding curve data
    if (token.bondingCurve) extensions.bondingCurve = token.bondingCurve;
    
    // Graduation status
    extensions.graduated = token.graduated || token.status === 'graduated';
    if (token.pancakePool) extensions.pancakePool = token.pancakePool;
    
    // Market data
    if (token.holders !== undefined) extensions.holders = token.holders;
    if (token.volume24h !== undefined) extensions.volume24h = token.volume24h;
    if (token.priceChange24h !== undefined) extensions.priceChange24h = token.priceChange24h;
    
    // Status
    if (token.status) extensions.status = token.status;

    // Parse created date
    let createdAt: Date;
    if (token.launchAt) {
      createdAt = new Date(token.launchAt * 1000);
    } else if (token.createdAt) {
      createdAt = new Date(token.createdAt);
    } else {
      createdAt = new Date();
    }

    return {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      chain: 'bsc',
      launchpad: 'fourmeme',
      creator: token.creator,
      createdAt,
      marketCapUsd: token.marketCap,
      priceUsd: token.priceUsd,
      imageUrl: token.image,
      description: token.description,
      verified: false,
      extensions,
      urls: {
        launchpad: `https://four.meme/token/${token.address}`,
        explorer: `${BSCSCAN_URL}/token/${token.address}`,
        dex: token.pancakePool 
          ? `https://pancakeswap.finance/swap?outputCurrency=${token.address}`
          : undefined,
      },
    };
  }
}

/**
 * Create FourMeme connector from environment
 */
export function createFourMemeConnector(): FourMemeConnector {
  return new FourMemeConnector({
    enabled: process.env.FOURMEME_ENABLED !== 'false',
    pollIntervalMs: parseInt(process.env.FOURMEME_POLL_INTERVAL_MS || '15000', 10),
    minMarketCapUsd: parseInt(process.env.FOURMEME_MIN_MARKET_CAP || '0', 10),
  });
}
