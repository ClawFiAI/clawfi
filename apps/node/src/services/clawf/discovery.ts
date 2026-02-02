/**
 * ClawF Discovery Engine
 * 
 * Continuously scans market data to identify tokens entering high-momentum phases.
 * Uses N-of-M condition matching with evidence-based scoring.
 * 
 * PHILOSOPHY: Launch age is metadata only, NEVER a hard filter.
 * A token qualifies if demand acceleration outpaces supply constraints.
 */

import {
  TokenCandidate,
  TokenScores,
  DiscoveryCondition,
  DiscoveryResult,
  SupportedChain,
  SUPPORTED_CHAINS,
  ClawFConfig,
  DEFAULT_CONFIG,
  TokenFlag,
} from './types.js';

// ============================================
// API Endpoints
// ============================================

const DEXSCREENER_API = 'https://api.dexscreener.com';
const GECKOTERMINAL_API = 'https://api.geckoterminal.com/api/v2';

// ============================================
// Rate Limiting & Caching
// ============================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string, maxAgeMs: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > maxAgeMs) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// ============================================
// API Helpers
// ============================================

async function fetchWithCache<T>(
  url: string,
  cacheKey: string,
  cacheDuration: number = 30000
): Promise<T | null> {
  const cached = getCached<T>(cacheKey, cacheDuration);
  if (cached) return cached;

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'ClawF/1.0' },
    });
    if (!response.ok) return null;
    const data = await response.json() as T;
    setCache(cacheKey, data);
    return data;
  } catch {
    return null;
  }
}

// ============================================
// Discovery Engine
// ============================================

export class DiscoveryEngine {
  private config: ClawFConfig;
  private volumeBaselines: Map<string, number[]> = new Map(); // Rolling baselines

  constructor(config: Partial<ClawFConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main discovery scan - returns qualified candidates
   */
  async scan(options?: {
    chains?: SupportedChain[];
    limit?: number;
  }): Promise<DiscoveryResult[]> {
    const chains = options?.chains || SUPPORTED_CHAINS;
    const limit = options?.limit || 20;
    const results: DiscoveryResult[] = [];

    // Fetch from multiple sources in parallel
    const [trending, gainers, newPools] = await Promise.all([
      this.fetchTrending(),
      this.fetchGainers(),
      this.fetchNewPools(chains),
    ]);

    // Combine and deduplicate
    const allTokens = this.deduplicateTokens([
      ...trending,
      ...gainers,
      ...newPools,
    ]);

    // Evaluate each token
    for (const token of allTokens) {
      if (chains.length > 0 && !chains.includes(token.chain)) continue;

      const result = await this.evaluateCandidate(token);
      if (result.qualifies) {
        results.push(result);
      }
    }

    // Sort by composite score and return top candidates
    return results
      .sort((a, b) => b.candidate.scores.composite - a.candidate.scores.composite)
      .slice(0, limit);
  }

  /**
   * Analyze a specific token
   */
  async analyzeToken(address: string, chain?: SupportedChain): Promise<DiscoveryResult | null> {
    const token = await this.fetchTokenData(address);
    if (!token) return null;
    if (chain && token.chain !== chain) return null;

    return this.evaluateCandidate(token);
  }

  /**
   * Evaluate a token against discovery conditions
   */
  private async evaluateCandidate(token: Partial<TokenCandidate>): Promise<DiscoveryResult> {
    const conditions: DiscoveryCondition[] = [];

    // Ensure minimum required data
    const candidate = this.normalizeToken(token);

    // CONDITION 1: Volume spike vs baseline
    const volumeBaseline = this.getVolumeBaseline(candidate.address);
    const volumeSpike = volumeBaseline > 0 ? candidate.volume24h / volumeBaseline : 1;
    conditions.push({
      name: 'Volume Spike',
      passed: volumeSpike >= this.config.volumeSpikeThreshold,
      value: volumeSpike,
      threshold: this.config.volumeSpikeThreshold,
      evidence: `Current volume $${candidate.volume24h.toLocaleString()} vs baseline $${volumeBaseline.toLocaleString()} (${volumeSpike.toFixed(1)}x)`,
    });

    // CONDITION 2: Buy pressure dominance
    const totalTxns = candidate.buys24h + candidate.sells24h;
    const buyRatio = totalTxns > 0 ? candidate.buys24h / totalTxns : 0;
    conditions.push({
      name: 'Buy Pressure',
      passed: buyRatio >= this.config.buyPressureThreshold,
      value: buyRatio,
      threshold: this.config.buyPressureThreshold,
      evidence: `${(buyRatio * 100).toFixed(1)}% buys (${candidate.buys24h} buys / ${candidate.sells24h} sells)`,
    });

    // CONDITION 3: Price acceleration (short-term slope)
    const priceAcceleration = candidate.priceChange1h > 0 && 
      (candidate.priceChange1h > candidate.priceChange24h / 24);
    conditions.push({
      name: 'Price Acceleration',
      passed: priceAcceleration,
      value: candidate.priceChange1h,
      threshold: 'positive and accelerating',
      evidence: `1h: ${candidate.priceChange1h.toFixed(1)}%, 24h: ${candidate.priceChange24h.toFixed(1)}%`,
    });

    // CONDITION 4: Unique buyers growth
    const buyerGrowth = candidate.uniqueBuyers24h > candidate.uniqueSellers24h * 1.2;
    conditions.push({
      name: 'Buyer Growth',
      passed: buyerGrowth,
      value: candidate.uniqueBuyers24h,
      threshold: `> ${candidate.uniqueSellers24h * 1.2} (1.2x sellers)`,
      evidence: `${candidate.uniqueBuyers24h} unique buyers vs ${candidate.uniqueSellers24h} unique sellers`,
    });

    // CONDITION 5: Liquidity threshold
    const hasLiquidity = candidate.liquidity >= this.config.minLiquidity;
    conditions.push({
      name: 'Liquidity Threshold',
      passed: hasLiquidity,
      value: candidate.liquidity,
      threshold: this.config.minLiquidity,
      evidence: `$${candidate.liquidity.toLocaleString()} liquidity (min: $${this.config.minLiquidity.toLocaleString()})`,
    });

    // Count passed conditions
    const conditionsPassed = conditions.filter(c => c.passed).length;
    const qualifies = conditionsPassed >= this.config.minConditionsToPass;

    // Calculate scores and generate signals
    const { scores, signals } = this.calculateScores(candidate, conditions);
    candidate.scores = scores;
    candidate.signals = signals;

    // Update volume baseline for future comparisons
    this.updateVolumeBaseline(candidate.address, candidate.volume24h);

    return {
      candidate,
      conditionsPassed,
      conditionsTotal: conditions.length,
      conditions,
      qualifies,
    };
  }

  /**
   * Calculate all scores for a token
   */
  private calculateScores(
    token: TokenCandidate,
    conditions: DiscoveryCondition[]
  ): { scores: TokenScores; signals: string[] } {
    const signals: string[] = [];
    
    // Momentum Score (0-100)
    let momentum = 0;
    const totalTxns = token.buys24h + token.sells24h;
    const buyRatio = totalTxns > 0 ? token.buys24h / totalTxns : 0;
    
    // Price momentum contribution
    if (token.priceChange1h > 50) {
      momentum += 30;
      signals.push(`🚀 Pumping +${token.priceChange1h.toFixed(0)}% 1h`);
    }
    else if (token.priceChange1h > 20) {
      momentum += 25;
      signals.push(`📈 Strong momentum +${token.priceChange1h.toFixed(0)}% 1h`);
    }
    else if (token.priceChange1h > 10) momentum += 20;
    else if (token.priceChange1h > 5) momentum += 15;
    else if (token.priceChange1h > 0) momentum += 10;

    // Buy pressure contribution
    if (buyRatio > 0.8) {
      momentum += 30;
      signals.push(`🐋 Heavy accumulation (${(buyRatio * 100).toFixed(0)}% buys)`);
    }
    else if (buyRatio > 0.7) {
      momentum += 25;
      signals.push(`📊 Strong buying pressure`);
    }
    else if (buyRatio > 0.6) momentum += 20;
    else if (buyRatio > 0.5) momentum += 15;

    // Volume ratio contribution
    const volumeRatio = token.fdv > 0 ? token.volume24h / token.fdv : 0;
    if (volumeRatio > 2) {
      momentum += 25;
      signals.push(`🔥 Extreme volume (${(volumeRatio * 100).toFixed(0)}% of mcap)`);
    }
    else if (volumeRatio > 1) {
      momentum += 20;
      signals.push(`📈 High volume ratio`);
    }
    else if (volumeRatio > 0.5) momentum += 15;
    else if (volumeRatio > 0.2) momentum += 10;

    // Activity contribution
    if (totalTxns > 1000) momentum += 15;
    else if (totalTxns > 500) momentum += 10;
    else if (totalTxns > 100) momentum += 5;

    // Liquidity Score (0-100)
    let liquidity = 0;
    
    // Absolute liquidity
    if (token.liquidity >= 100000) liquidity += 40;
    else if (token.liquidity >= 50000) liquidity += 35;
    else if (token.liquidity >= 25000) liquidity += 30;
    else if (token.liquidity >= 10000) liquidity += 25;
    else if (token.liquidity >= 5000) liquidity += 15;
    else liquidity += 5;

    // Liquidity to mcap ratio
    const liqRatio = token.fdv > 0 ? (token.liquidity / token.fdv) * 100 : 0;
    if (liqRatio >= 20) liquidity += 30;
    else if (liqRatio >= 10) liquidity += 25;
    else if (liqRatio >= 5) liquidity += 20;
    else if (liqRatio >= 2) liquidity += 10;

    // Volume to liquidity (healthy turnover)
    const volLiqRatio = token.liquidity > 0 ? token.volume24h / token.liquidity : 0;
    if (volLiqRatio >= 1 && volLiqRatio <= 10) liquidity += 30;
    else if (volLiqRatio >= 0.5 && volLiqRatio <= 20) liquidity += 20;
    else liquidity += 10;

    // Risk Score (0-100, HIGHER = SAFER)
    let risk = 50; // Start neutral

    // Liquidity safety
    if (token.liquidity >= 50000) risk += 15;
    else if (token.liquidity >= 20000) risk += 10;
    else if (token.liquidity >= 10000) risk += 5;
    else risk -= 15;

    // Liq/mcap ratio safety
    if (liqRatio >= 10) risk += 15;
    else if (liqRatio >= 5) risk += 10;
    else if (liqRatio < 2) risk -= 15;

    // Sell activity (can people sell?)
    const sellRatio = totalTxns > 0 ? token.sells24h / totalTxns : 0;
    if (sellRatio >= 0.2 && sellRatio <= 0.5) risk += 15;
    else if (sellRatio < 0.1 && totalTxns > 50) risk -= 20; // Honeypot warning

    // Hard flags reduce risk score
    const hardFlags = token.flags.filter(f => f.severity === 'hard');
    risk -= hardFlags.length * 20;

    // Soft flags slightly reduce risk score
    const softFlags = token.flags.filter(f => f.severity === 'soft');
    risk -= softFlags.length * 5;

    // Confidence Score (0-100)
    let confidence = 0;
    const passedCount = conditions.filter(c => c.passed).length;
    confidence += (passedCount / conditions.length) * 50;
    
    // Data completeness
    if (token.volume24h > 0) confidence += 10;
    if (token.buys24h > 0 || token.sells24h > 0) confidence += 10;
    if (token.liquidity > 0) confidence += 10;
    if (token.fdv > 0) confidence += 10;
    if (token.priceChange1h !== 0) confidence += 10;

    // Clamp all scores to 0-100
    momentum = Math.max(0, Math.min(100, momentum));
    liquidity = Math.max(0, Math.min(100, liquidity));
    risk = Math.max(0, Math.min(100, risk));
    confidence = Math.max(0, Math.min(100, confidence));

    // Composite score (weighted)
    const composite = Math.round(
      momentum * 0.35 +
      liquidity * 0.20 +
      risk * 0.30 +
      confidence * 0.15
    );

    // Add market cap signal
    if (token.fdv < 100000) signals.push(`🎯 Micro cap (<$100K)`);
    else if (token.fdv < 500000) signals.push(`🎯 Ultra low cap (<$500K)`);
    else if (token.fdv < 1000000) signals.push(`💰 Low cap (<$1M)`);

    return { 
      scores: { momentum, liquidity, risk, confidence, composite },
      signals 
    };
  }

  /**
   * Fetch trending/boosted tokens from DexScreener
   */
  private async fetchTrending(): Promise<Partial<TokenCandidate>[]> {
    // Use token-boosts endpoint (more reliable than /trending)
    const boosts = await fetchWithCache<DexBoost[]>(
      `${DEXSCREENER_API}/token-boosts/top/v1`,
      'dex-boosts'
    );
    
    if (!boosts || !Array.isArray(boosts)) return [];
    
    // Fetch full token data for boosted tokens
    const candidates: Partial<TokenCandidate>[] = [];
    
    for (const boost of boosts.slice(0, 20)) {
      const data = await fetchWithCache<{ pairs?: DexPair[] }>(
        `${DEXSCREENER_API}/latest/dex/tokens/${boost.tokenAddress}`,
        `token-${boost.tokenAddress}`,
        15000
      );
      
      if (data?.pairs?.[0]) {
        candidates.push(this.pairToCandidate(data.pairs[0]));
      }
    }
    
    return candidates;
  }

  /**
   * Fetch top gainers from multiple chains
   */
  private async fetchGainers(): Promise<Partial<TokenCandidate>[]> {
    const candidates: Partial<TokenCandidate>[] = [];
    
    // Fetch latest pairs from each supported chain
    for (const chain of ['base', 'solana', 'bsc'] as const) {
      const data = await fetchWithCache<{ pairs?: DexPair[] }>(
        `${DEXSCREENER_API}/latest/dex/pairs/${chain}`,
        `dex-pairs-${chain}`,
        30000
      );
      
      if (data?.pairs) {
        // Filter for gainers (positive 24h change)
        const gainers = data.pairs
          .filter(p => (p.priceChange?.h24 || 0) > 10)
          .slice(0, 10);
        
        for (const pair of gainers) {
          candidates.push(this.pairToCandidate(pair));
        }
      }
    }
    
    return candidates;
  }

  /**
   * Fetch new pools from GeckoTerminal
   */
  private async fetchNewPools(chains: SupportedChain[]): Promise<Partial<TokenCandidate>[]> {
    const networkMap: Record<SupportedChain, string> = {
      base: 'base',
      ethereum: 'eth',
      bsc: 'bsc',
      solana: 'solana',
    };

    const results: Partial<TokenCandidate>[] = [];

    for (const chain of chains) {
      const network = networkMap[chain];
      const data = await fetchWithCache<{ data?: GeckoPair[] }>(
        `${GECKOTERMINAL_API}/networks/${network}/new_pools?page=1`,
        `gecko-new-${chain}`
      );
      if (data?.data) {
        for (const pool of data.data) {
          results.push(this.geckoToCandidate(pool, chain));
        }
      }
    }

    return results;
  }

  /**
   * Fetch specific token data
   */
  private async fetchTokenData(address: string): Promise<Partial<TokenCandidate> | null> {
    const data = await fetchWithCache<{ pairs?: DexPair[] }>(
      `${DEXSCREENER_API}/latest/dex/tokens/${address}`,
      `token-${address}`,
      10000 // 10 second cache for specific lookups
    );
    if (!data?.pairs?.[0]) return null;
    return this.pairToCandidate(data.pairs[0]);
  }

  /**
   * Convert DexScreener pair to candidate format
   */
  private pairToCandidate(pair: DexPair): Partial<TokenCandidate> {
    return {
      address: pair.baseToken.address,
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
      chain: this.normalizeChain(pair.chainId),
      priceUsd: parseFloat(pair.priceUsd || '0'),
      priceChange1h: pair.priceChange?.h1 || 0,
      priceChange6h: pair.priceChange?.h6 || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
      volume24h: pair.volume?.h24 || 0,
      liquidity: pair.liquidity?.usd || 0,
      fdv: pair.fdv || 0,
      buys24h: pair.txns?.h24?.buys || 0,
      sells24h: pair.txns?.h24?.sells || 0,
      uniqueBuyers24h: pair.txns?.h24?.buys || 0, // Approximation
      uniqueSellers24h: pair.txns?.h24?.sells || 0,
      pairAddress: pair.pairAddress,
      pairCreatedAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt) : undefined,
    };
  }

  /**
   * Convert GeckoTerminal pool to candidate format
   */
  private geckoToCandidate(pool: GeckoPair, chain: SupportedChain): Partial<TokenCandidate> {
    const attrs = pool.attributes;
    return {
      address: attrs.address,
      symbol: attrs.name?.split('/')[0] || 'UNKNOWN',
      name: attrs.name || 'Unknown',
      chain,
      priceUsd: parseFloat(attrs.base_token_price_usd || '0'),
      priceChange1h: 0, // Not provided
      priceChange6h: 0,
      priceChange24h: parseFloat(attrs.price_change_percentage?.h24 || '0'),
      volume24h: parseFloat(attrs.volume_usd?.h24 || '0'),
      liquidity: parseFloat(attrs.reserve_in_usd || '0'),
      fdv: parseFloat(attrs.fdv_usd || '0'),
      buys24h: 0,
      sells24h: 0,
      uniqueBuyers24h: 0,
      uniqueSellers24h: 0,
    };
  }

  /**
   * Normalize chain ID to supported chain
   */
  private normalizeChain(chainId: string): SupportedChain {
    const map: Record<string, SupportedChain> = {
      base: 'base',
      ethereum: 'ethereum',
      eth: 'ethereum',
      bsc: 'bsc',
      solana: 'solana',
    };
    return map[chainId.toLowerCase()] || 'ethereum';
  }

  /**
   * Normalize partial token data to full candidate
   */
  private normalizeToken(token: Partial<TokenCandidate>): TokenCandidate {
    return {
      address: token.address || '',
      symbol: token.symbol || 'UNKNOWN',
      name: token.name || 'Unknown',
      chain: token.chain || 'ethereum',
      priceUsd: token.priceUsd || 0,
      priceChange1h: token.priceChange1h || 0,
      priceChange6h: token.priceChange6h || 0,
      priceChange24h: token.priceChange24h || 0,
      volume24h: token.volume24h || 0,
      volumeChange: token.volumeChange || 0,
      liquidity: token.liquidity || 0,
      fdv: token.fdv || 0,
      buys24h: token.buys24h || 0,
      sells24h: token.sells24h || 0,
      uniqueBuyers24h: token.uniqueBuyers24h || 0,
      uniqueSellers24h: token.uniqueSellers24h || 0,
      tokenAge: token.tokenAge,
      launchpad: token.launchpad,
      pairAddress: token.pairAddress,
      pairCreatedAt: token.pairCreatedAt,
      scores: token.scores || { momentum: 0, liquidity: 0, risk: 50, confidence: 0, composite: 0 },
      signals: token.signals || [],
      flags: token.flags || [],
      socialSignals: token.socialSignals,
      walletIntelligence: token.walletIntelligence,
      discoveredAt: token.discoveredAt || new Date(),
      lastUpdated: new Date(),
    };
  }

  /**
   * Deduplicate tokens by address
   */
  private deduplicateTokens(tokens: Partial<TokenCandidate>[]): Partial<TokenCandidate>[] {
    const seen = new Map<string, Partial<TokenCandidate>>();
    for (const token of tokens) {
      if (!token.address) continue;
      const key = `${token.chain}-${token.address.toLowerCase()}`;
      if (!seen.has(key) || (token.volume24h || 0) > (seen.get(key)?.volume24h || 0)) {
        seen.set(key, token);
      }
    }
    return Array.from(seen.values());
  }

  /**
   * Get volume baseline for a token
   */
  private getVolumeBaseline(address: string): number {
    const history = this.volumeBaselines.get(address) || [];
    if (history.length === 0) return 0;
    return history.reduce((a, b) => a + b, 0) / history.length;
  }

  /**
   * Update volume baseline with new data point
   */
  private updateVolumeBaseline(address: string, volume: number): void {
    const history = this.volumeBaselines.get(address) || [];
    history.push(volume);
    // Keep last 10 data points
    if (history.length > 10) history.shift();
    this.volumeBaselines.set(address, history);
  }
}

// ============================================
// Type Definitions for APIs
// ============================================

interface DexPair {
  chainId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  priceChange?: { h24?: number; h6?: number; h1?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  txns?: { h24?: { buys: number; sells: number } };
  pairCreatedAt?: string;
}

interface DexBoost {
  chainId: string;
  tokenAddress: string;
  amount?: number;
}

interface GeckoPair {
  id: string;
  attributes: {
    name: string;
    address: string;
    base_token_price_usd: string | null;
    fdv_usd: string | null;
    reserve_in_usd: string | null;
    volume_usd?: { h24?: string };
    price_change_percentage?: { h24?: string };
  };
}
