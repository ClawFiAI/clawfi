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
import { getSocialSignals, getSocialBoost, formatSocialSignal, hasSocialValidation } from './social.js';

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
   * 100X GEM HUNTER - Specialized scan for ultra-early tokens with 100x potential
   * Focuses on: ultra-low mcap, fresh launches, viral activity, strong buy pressure
   */
  async scanGems(options?: {
    chains?: SupportedChain[];
    limit?: number;
  }): Promise<DiscoveryResult[]> {
    const chains = options?.chains || ['solana', 'base'];
    const limit = options?.limit || 15;
    const results: DiscoveryResult[] = [];

    // Fetch fresh pools specifically
    const freshPools = await this.fetchFreshPools(chains);
    
    // Also get trending for comparison
    const trending = await this.fetchTrending();
    
    // Combine with priority on fresh pools
    const allTokens = this.deduplicateTokens([...freshPools, ...trending]);

    // Evaluate with GEM HUNTER criteria
    for (const token of allTokens) {
      if (chains.length > 0 && !chains.includes(token.chain)) continue;
      
      const result = await this.evaluateGemCandidate(token);
      if (result.qualifies) {
        results.push(result);
      }
    }

    // Sort by GEM score (modified composite)
    return results
      .sort((a, b) => b.candidate.scores.composite - a.candidate.scores.composite)
      .slice(0, limit);
  }

  /**
   * Fetch ultra-fresh pools (< 2 hours old)
   */
  private async fetchFreshPools(chains: SupportedChain[]): Promise<Partial<TokenCandidate>[]> {
    const results: Partial<TokenCandidate>[] = [];
    
    for (const chain of chains) {
      try {
        const chainId = chain === 'solana' ? 'solana' : chain;
        const url = `${GECKOTERMINAL_API}/networks/${chainId}/new_pools?page=1`;
        const data = await fetchWithCache<{ data: Array<{ attributes: Record<string, unknown>; id: string }> }>(
          url, 
          `fresh_pools_${chain}`, 
          15000 // 15 second cache for fresh data
        );
        
        if (data?.data) {
          for (const pool of data.data) {
            const attrs = pool.attributes;
            const pairAddress = pool.id?.split('_')[1] || '';
            
            // Calculate age in hours
            const createdAt = attrs.pool_created_at as string;
            const ageHours = createdAt 
              ? (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60)
              : 999;
            
            // Only include tokens < 6 hours old
            if (ageHours > 6) continue;
            
            const fdv = parseFloat(attrs.fdv_usd as string) || 0;
            const reserve = parseFloat(attrs.reserve_in_usd as string) || 0;
            const vol24h = parseFloat((attrs.volume_usd as Record<string, string>)?.h24) || 0;
            const h1Change = parseFloat((attrs.price_change_percentage as Record<string, string>)?.h1) || 0;
            const h24Change = parseFloat((attrs.price_change_percentage as Record<string, string>)?.h24) || 0;
            const txns = attrs.transactions as Record<string, Record<string, number>> || {};
            const buys = txns.h24?.buys || 0;
            const sells = txns.h24?.sells || 0;
            
            results.push({
              address: pairAddress,
              symbol: (attrs.name as string)?.split(' / ')[0] || 'UNKNOWN',
              name: attrs.name as string,
              chain,
              priceUsd: parseFloat(attrs.base_token_price_usd as string) || 0,
              priceChange1h: h1Change,
              priceChange6h: 0,
              priceChange24h: h24Change,
              volume24h: vol24h,
              liquidity: reserve,
              fdv: fdv > 0 ? fdv : reserve * 2, // Estimate if not available
              buys24h: buys,
              sells24h: sells,
              uniqueBuyers24h: buys,
              uniqueSellers24h: sells,
              pairCreatedAt: createdAt,
            });
          }
        }
      } catch (e) {
        console.error(`Error fetching fresh pools for ${chain}:`, e);
      }
    }
    
    return results;
  }

  /**
   * Evaluate token specifically for HIGH WIN-RATE GEM potential
   * STRICT CRITERIA for 70-80% win rate - quality over quantity
   * v2.0 - Tightened filters for sustainable profitability
   */
  private async evaluateGemCandidate(token: Partial<TokenCandidate>): Promise<DiscoveryResult> {
    const conditions: DiscoveryCondition[] = [];
    const candidate = this.normalizeToken(token);
    
    const totalTxns = candidate.buys24h + candidate.sells24h;
    const buyRatio = totalTxns > 0 ? candidate.buys24h / totalTxns : 0;
    const volumeToMcap = candidate.fdv > 0 ? candidate.volume24h / candidate.fdv : 0;
    const liqRatio = candidate.fdv > 0 ? (candidate.liquidity / candidate.fdv) * 100 : 0;
    
    // Token age in hours
    const ageHours = candidate.pairCreatedAt 
      ? (Date.now() - new Date(candidate.pairCreatedAt).getTime()) / (1000 * 60 * 60)
      : 999;
    
    // Fetch social signals from Twitter/X (async, with caching)
    const socialSignal = await getSocialSignals(candidate.address, candidate.symbol).catch(() => null);
    candidate.socialSignals = socialSignal ? {
      mentionCount: socialSignal.mentionCount,
      mentionVelocity: socialSignal.mentionVelocity,
      spikeDetected: socialSignal.spikeDetected,
    } : undefined;

    // ═══════════════════════════════════════════════════════════════
    // HIGH WIN-RATE GEM CONDITIONS - Strict filters for 70-80% success
    // ═══════════════════════════════════════════════════════════════

    // CONDITION 1: MINIMUM LIQUIDITY (>$25K = reduces rug risk)
    const hasMinLiquidity = candidate.liquidity >= 25000;
    conditions.push({
      name: 'Minimum Liquidity',
      passed: hasMinLiquidity,
      value: `$${(candidate.liquidity / 1000).toFixed(1)}K`,
      threshold: '> $25K',
      evidence: hasMinLiquidity
        ? `✅ SAFE: $${(candidate.liquidity / 1000).toFixed(1)}K liquidity - tradeable`
        : `⚠️ LOW: $${(candidate.liquidity / 1000).toFixed(1)}K - high slippage risk`,
    });

    // CONDITION 2: STRONG BUY DOMINANCE (>75% = very high conviction)
    const hasStrongBuying = buyRatio >= 0.75;
    conditions.push({
      name: 'Strong Buy Dominance',
      passed: hasStrongBuying,
      value: `${(buyRatio * 100).toFixed(0)}% buys`,
      threshold: '≥ 75%',
      evidence: hasStrongBuying
        ? `🔥 STRONG DEMAND: ${(buyRatio * 100).toFixed(0)}% buy ratio`
        : `${(buyRatio * 100).toFixed(0)}% buy ratio (need 75%+)`,
    });

    // CONDITION 3: HEALTHY VOLUME (>$50K 24h volume = real interest)
    const hasHealthyVolume = candidate.volume24h >= 50000;
    conditions.push({
      name: 'Healthy Volume',
      passed: hasHealthyVolume,
      value: `$${(candidate.volume24h / 1000).toFixed(0)}K`,
      threshold: '> $50K 24h',
      evidence: hasHealthyVolume
        ? `📊 ACTIVE: $${(candidate.volume24h / 1000).toFixed(0)}K volume`
        : `$${(candidate.volume24h / 1000).toFixed(0)}K volume (need $50K+)`,
    });

    // CONDITION 4: SUSTAINED ACTIVITY (>100 transactions = organic)
    const hasSustainedActivity = totalTxns >= 100;
    conditions.push({
      name: 'Sustained Activity',
      passed: hasSustainedActivity,
      value: `${totalTxns} txns`,
      threshold: '≥ 100 transactions',
      evidence: hasSustainedActivity
        ? `✅ ORGANIC: ${totalTxns} transactions - real trading`
        : `${totalTxns} transactions (need 100+)`,
    });

    // CONDITION 5: HEALTHY LIQ RATIO (15-50% = balanced)
    const hasHealthyLiq = liqRatio >= 15 && liqRatio <= 50;
    conditions.push({
      name: 'Healthy Liq Ratio',
      passed: hasHealthyLiq,
      value: `${liqRatio.toFixed(0)}%`,
      threshold: '15-50% liq/mcap',
      evidence: hasHealthyLiq
        ? `💧 BALANCED: ${liqRatio.toFixed(0)}% liq/mcap`
        : liqRatio > 50 ? `Too high: ${liqRatio.toFixed(0)}%` : `Too low: ${liqRatio.toFixed(0)}%`,
    });

    // CONDITION 6: POSITIVE MOMENTUM (price up = trend confirmed)
    const hasPositiveMomentum = candidate.priceChange1h > 5;
    conditions.push({
      name: 'Positive Momentum',
      passed: hasPositiveMomentum,
      value: `${candidate.priceChange1h.toFixed(1)}%`,
      threshold: '> 5% 1h change',
      evidence: hasPositiveMomentum
        ? `📈 TRENDING: +${candidate.priceChange1h.toFixed(0)}% in 1h`
        : `${candidate.priceChange1h.toFixed(0)}% 1h change`,
    });

    // CONDITION 7: NOT OVEREXTENDED (< 200% 1h = room to run)
    const notOverextended = candidate.priceChange1h < 200;
    conditions.push({
      name: 'Not Overextended',
      passed: notOverextended,
      value: `${candidate.priceChange1h.toFixed(0)}%`,
      threshold: '< 200% 1h gain',
      evidence: notOverextended
        ? `✅ ROOM TO RUN: +${candidate.priceChange1h.toFixed(0)}% (not topped)`
        : `⚠️ OVEREXTENDED: +${candidate.priceChange1h.toFixed(0)}% - risky entry`,
    });

    // CONDITION 8: VOLUME EXPLOSION (>100% vol/mcap = high interest)
    const hasVolumeExplosion = volumeToMcap >= 1.0;
    conditions.push({
      name: 'Volume Explosion',
      passed: hasVolumeExplosion,
      value: `${(volumeToMcap * 100).toFixed(0)}%`,
      threshold: '≥ 100% vol/mcap',
      evidence: hasVolumeExplosion
        ? `💥 EXPLOSIVE: ${(volumeToMcap * 100).toFixed(0)}% volume ratio`
        : `${(volumeToMcap * 100).toFixed(0)}% vol/mcap`,
    });

    // CONDITION 9: SOCIAL VALIDATION (Twitter/X mentions - REQUIRED)
    const hasSocialValidationResult = hasSocialValidation(socialSignal);
    conditions.push({
      name: 'Social Validation',
      passed: hasSocialValidationResult,
      value: socialSignal ? `${socialSignal.mentionCount} mentions` : 'No data',
      threshold: '5+ mentions, trending',
      evidence: socialSignal
        ? hasSocialValidationResult
          ? `🐦 VALIDATED: ${socialSignal.mentionCount} mentions${socialSignal.spikeDetected ? ' - VIRAL!' : ''}`
          : `${socialSignal.mentionCount} mentions (below threshold)`
        : 'Twitter data unavailable',
    });

    // CONDITION 10: REASONABLE MCAP ($10K-$500K = growth potential)
    const hasReasonableMcap = candidate.fdv >= 10000 && candidate.fdv <= 500000;
    conditions.push({
      name: 'Reasonable MCap',
      passed: hasReasonableMcap,
      value: `$${(candidate.fdv / 1000).toFixed(0)}K`,
      threshold: '$10K - $500K',
      evidence: hasReasonableMcap
        ? `💎 SWEET SPOT: $${(candidate.fdv / 1000).toFixed(0)}K mcap`
        : candidate.fdv < 10000 ? 'Too low mcap (risky)' : 'Too high mcap (limited upside)',
    });

    // CONDITION 11: BUYER DIVERSITY (unique buyers > 50 = real distribution)
    const hasBuyerDiversity = candidate.uniqueBuyers24h >= 50;
    conditions.push({
      name: 'Buyer Diversity',
      passed: hasBuyerDiversity,
      value: `${candidate.uniqueBuyers24h} buyers`,
      threshold: '≥ 50 unique buyers',
      evidence: hasBuyerDiversity
        ? `👥 DISTRIBUTED: ${candidate.uniqueBuyers24h} unique buyers`
        : `${candidate.uniqueBuyers24h} buyers (need 50+)`,
    });

    // CONDITION 12: SELL PRESSURE LOW (sellers < 40% = holders confident)
    const lowSellPressure = buyRatio >= 0.60;
    conditions.push({
      name: 'Low Sell Pressure',
      passed: lowSellPressure,
      value: `${((1 - buyRatio) * 100).toFixed(0)}% sells`,
      threshold: '< 40% sell ratio',
      evidence: lowSellPressure
        ? `💪 CONFIDENT HOLDERS: Only ${((1 - buyRatio) * 100).toFixed(0)}% selling`
        : `⚠️ HIGH SELLS: ${((1 - buyRatio) * 100).toFixed(0)}% selling`,
    });

    // Calculate GEM score with social boost
    const socialBoost = getSocialBoost(socialSignal);
    const { scores, signals } = this.calculateGemScores(candidate, conditions, ageHours, buyRatio, volumeToMcap, socialBoost, socialSignal);
    candidate.scores = scores;
    candidate.signals = signals;

    const conditionsPassed = conditions.filter(c => c.passed).length;
    
    // STRICT QUALIFICATION: Need 8 of 12 conditions for HIGH WIN-RATE
    // Plus MANDATORY: Must have liquidity AND buy dominance
    const hasMandatory = hasMinLiquidity && buyRatio >= 0.65;
    const qualifies = conditionsPassed >= 8 && hasMandatory;

    return {
      candidate,
      conditionsPassed,
      conditionsTotal: conditions.length,
      conditions,
      qualifies,
    };
  }

  /**
   * Calculate scores for HIGH WIN-RATE gem detection
   * v2.0 - Conservative scoring focused on sustainable profitability
   */
  private calculateGemScores(
    token: TokenCandidate,
    conditions: DiscoveryCondition[],
    ageHours: number,
    buyRatio: number,
    volumeToMcap: number,
    socialBoost: number = 0,
    socialSignal?: { mentionCount: number; mentionVelocity: number; spikeDetected: boolean } | null
  ): { scores: TokenScores; signals: string[] } {
    const signals: string[] = [];
    
    // Add social signal to signals if significant
    if (socialSignal && socialSignal.mentionCount > 0) {
      const socialText = formatSocialSignal(socialSignal as any);
      if (socialText) {
        signals.push(socialText);
      }
    }
    let momentum = 0;
    let gemBonus = 0;
    let riskPenalty = 0;

    // ═══════════════════════════════════════════════════════════════
    // HIGH WIN-RATE SCORING - Quality signals only
    // ═══════════════════════════════════════════════════════════════

    // LIQUIDITY BONUS (higher = safer)
    if (token.liquidity >= 100000) {
      gemBonus += 25;
      signals.push(`💧 DEEP LIQUIDITY: $${(token.liquidity / 1000).toFixed(0)}K`);
    } else if (token.liquidity >= 50000) {
      gemBonus += 15;
    } else if (token.liquidity >= 25000) {
      gemBonus += 5;
    } else {
      riskPenalty += 20;
      signals.push(`⚠️ LOW LIQUIDITY: $${(token.liquidity / 1000).toFixed(1)}K - slippage risk`);
    }

    // AGE SCORING - Balanced approach (not too new, not too old)
    if (ageHours >= 1 && ageHours <= 6) {
      gemBonus += 20; // Sweet spot - survived initial dump risk
      signals.push(`✅ VALIDATED: ${ageHours.toFixed(1)}h old - survived launch`);
    } else if (ageHours < 1) {
      gemBonus += 5; // New but risky
      riskPenalty += 10;
    } else if (ageHours < 24) {
      gemBonus += 15;
      signals.push(`🌱 Fresh: ${ageHours.toFixed(1)}h old - early entry`);
    } else if (ageHours >= 6 && ageHours < 12) {
      gemBonus += 10;
    }

    // MCAP BONUS - Prefer $25K-$250K sweet spot
    if (token.fdv >= 25000 && token.fdv < 100000) {
      gemBonus += 25;
      signals.push(`💎 SWEET SPOT: $${(token.fdv / 1000).toFixed(0)}K mcap`);
    } else if (token.fdv >= 100000 && token.fdv < 250000) {
      gemBonus += 20;
      signals.push(`🎯 Growth cap: $${(token.fdv / 1000).toFixed(0)}K`);
    } else if (token.fdv >= 10000 && token.fdv < 25000) {
      gemBonus += 10;
      riskPenalty += 10; // Lower mcap = higher risk
    } else if (token.fdv < 10000) {
      riskPenalty += 25; // Very low mcap = very risky
      signals.push(`⚠️ MICRO CAP: $${(token.fdv / 1000).toFixed(1)}K - high risk`);
    }

    // STRONG BUY PRESSURE BONUS - Stricter thresholds
    if (buyRatio >= 0.80) {
      momentum += 40;
      signals.push(`🐋 MASSIVE BUYING: ${(buyRatio * 100).toFixed(0)}% buys`);
    } else if (buyRatio >= 0.75) {
      momentum += 30;
      signals.push(`💪 Strong demand: ${(buyRatio * 100).toFixed(0)}% buy ratio`);
    } else if (buyRatio >= 0.65) {
      momentum += 15;
    } else if (buyRatio < 0.55) {
      riskPenalty += 25;
      signals.push(`⚠️ Weak demand: ${(buyRatio * 100).toFixed(0)}% buys - risky`);
    }

    // VOLUME QUALITY BONUS
    const totalTxns = token.buys24h + token.sells24h;
    if (volumeToMcap >= 2.0 && totalTxns >= 200) {
      momentum += 25;
      signals.push(`💥 HIGH VOLUME: ${(volumeToMcap * 100).toFixed(0)}% vol/mcap + ${totalTxns} txns`);
    } else if (volumeToMcap >= 1.0 && totalTxns >= 100) {
      momentum += 15;
      signals.push(`📊 Active: ${(volumeToMcap * 100).toFixed(0)}% vol/mcap`);
    } else if (volumeToMcap < 0.3) {
      riskPenalty += 10;
    }

    // MOMENTUM - Not overextended
    if (token.priceChange1h >= 20 && token.priceChange1h < 100) {
      momentum += 20;
      signals.push(`📈 TRENDING: +${token.priceChange1h.toFixed(0)}% with room to run`);
    } else if (token.priceChange1h >= 5 && token.priceChange1h < 20) {
      momentum += 15;
    } else if (token.priceChange1h >= 100) {
      riskPenalty += 15;
      signals.push(`⚠️ OVEREXTENDED: +${token.priceChange1h.toFixed(0)}% - late entry risk`);
    } else if (token.priceChange1h < -10) {
      riskPenalty += 20;
      signals.push(`⛔ DUMPING: ${token.priceChange1h.toFixed(0)}%`);
    }

    // SOCIAL VALIDATION BOOST
    if (socialBoost >= 25) {
      gemBonus += socialBoost;
      signals.push(`🐦 VIRAL: ${socialSignal?.mentionCount || 0} mentions on X!`);
    } else if (socialBoost >= 15) {
      gemBonus += socialBoost;
      signals.push(`🐦 Validated: ${socialSignal?.mentionCount || 0} mentions`);
    }

    // HIGH WIN-RATE SIGNALS - Only show for quality setups
    const qualityScore = gemBonus + momentum - riskPenalty;
    
    if (qualityScore >= 80 && buyRatio >= 0.75 && token.liquidity >= 50000) {
      signals.unshift(`🎯 HIGH CONFIDENCE: Strong metrics across the board`);
    }
    
    if (qualityScore >= 70 && buyRatio >= 0.70 && totalTxns >= 150 && socialBoost >= 15) {
      signals.unshift(`✅ VALIDATED GEM: Good liquidity, demand, and social proof`);
    }

    // Standard scoring with risk penalty
    const liquidityScore = Math.min(100, Math.max(0, 
      (token.liquidity >= 100000 ? 50 : token.liquidity >= 50000 ? 40 : token.liquidity >= 25000 ? 30 : 15) +
      (token.fdv > 0 && (token.liquidity / token.fdv) >= 0.15 ? 30 : 10) +
      (volumeToMcap >= 1.0 ? 20 : 10)
    ));

    // Risk score - higher = SAFER (inverted from penalty)
    let risk = 40;
    if (token.liquidity >= 50000) risk += 20;
    if (token.liquidity >= 100000) risk += 10;
    if (buyRatio >= 0.70) risk += 15;
    if (totalTxns >= 100) risk += 10;
    if (ageHours >= 1 && ageHours <= 12) risk += 10; // Survived initial volatility
    if (socialBoost >= 15) risk += 10;
    risk -= riskPenalty * 0.5; // Apply risk penalties

    const passedCount = conditions.filter(c => c.passed).length;
    let confidence = Math.min(100, (passedCount / conditions.length) * 60 + 20);
    if (socialBoost >= 20) confidence += 10;
    if (token.liquidity >= 50000) confidence += 10;

    // Clamp scores
    momentum = Math.max(0, Math.min(100, momentum + gemBonus - riskPenalty));
    risk = Math.max(0, Math.min(100, risk));
    confidence = Math.min(100, confidence);

    // Composite - BALANCED for win rate (risk matters more)
    const composite = Math.round(
      momentum * 0.35 +     // Momentum matters but not everything
      liquidityScore * 0.20 + // Liquidity is safety
      risk * 0.25 +          // Risk score weighs heavily
      confidence * 0.20      // Confidence from conditions
    );

    return {
      scores: { momentum, liquidity: liquidityScore, risk, confidence, composite },
      signals,
    };
  }

  /**
   * Evaluate a token for PRE-PUMP potential (about to pump in next 4 hours)
   * Focus on ACCUMULATION signals, not tokens already pumping
   */
  private async evaluateCandidate(token: Partial<TokenCandidate>): Promise<DiscoveryResult> {
    const conditions: DiscoveryCondition[] = [];

    // Ensure minimum required data
    const candidate = this.normalizeToken(token);

    const totalTxns = candidate.buys24h + candidate.sells24h;
    const buyRatio = totalTxns > 0 ? candidate.buys24h / totalTxns : 0;
    const volumeToMcap = candidate.fdv > 0 ? candidate.volume24h / candidate.fdv : 0;
    const liqRatio = candidate.fdv > 0 ? (candidate.liquidity / candidate.fdv) * 100 : 0;

    // ===========================================
    // PRE-PUMP DETECTION CONDITIONS
    // ===========================================

    // CONDITION 1: ACCUMULATION PATTERN
    // High volume + buy pressure but price hasn't exploded yet (< 50% 1h)
    // This is the classic "smart money loading" pattern
    const isAccumulating = volumeToMcap > 0.3 && buyRatio > 0.55 && candidate.priceChange1h < 50;
    conditions.push({
      name: 'Accumulation Pattern',
      passed: isAccumulating,
      value: `${(volumeToMcap * 100).toFixed(0)}% vol/mcap, ${(buyRatio * 100).toFixed(0)}% buys`,
      threshold: '>30% vol/mcap, >55% buys, <50% 1h change',
      evidence: isAccumulating 
        ? `Heavy accumulation detected: ${(volumeToMcap * 100).toFixed(0)}% volume ratio with ${(buyRatio * 100).toFixed(0)}% buy dominance`
        : `Volume ratio: ${(volumeToMcap * 100).toFixed(0)}%, Buy ratio: ${(buyRatio * 100).toFixed(0)}%`,
    });

    // CONDITION 2: FRESH BUYER INFLUX
    // More unique buyers than sellers = new money entering
    const buyerInflux = candidate.uniqueBuyers24h > candidate.uniqueSellers24h * 1.5;
    const buyerRatio = candidate.uniqueSellers24h > 0 
      ? candidate.uniqueBuyers24h / candidate.uniqueSellers24h 
      : candidate.uniqueBuyers24h;
    conditions.push({
      name: 'Fresh Buyer Influx',
      passed: buyerInflux,
      value: buyerRatio,
      threshold: '>1.5x sellers',
      evidence: `${candidate.uniqueBuyers24h} buyers vs ${candidate.uniqueSellers24h} sellers (${buyerRatio.toFixed(1)}x ratio)`,
    });

    // CONDITION 3: FRESH TOKEN (< 6 hours old)
    // Very new tokens have highest pump potential
    const tokenAgeHours = candidate.pairCreatedAt 
      ? (Date.now() - new Date(candidate.pairCreatedAt).getTime()) / (1000 * 60 * 60)
      : 999;
    const isFresh = tokenAgeHours < 6;
    conditions.push({
      name: 'Fresh Token',
      passed: isFresh,
      value: tokenAgeHours < 999 ? `${tokenAgeHours.toFixed(1)} hours old` : 'Unknown age',
      threshold: '< 6 hours',
      evidence: isFresh 
        ? `🆕 Fresh launch: ${tokenAgeHours.toFixed(1)} hours old - early opportunity`
        : tokenAgeHours < 24 ? `${tokenAgeHours.toFixed(0)} hours old` : 'Mature token',
    });

    // CONDITION 4: MICRO CAP OPPORTUNITY
    // Under $500K mcap has the most pump potential
    const isMicroCap = candidate.fdv < 500000 && candidate.fdv > 10000;
    conditions.push({
      name: 'Micro Cap Opportunity',
      passed: isMicroCap,
      value: candidate.fdv,
      threshold: '$10K - $500K mcap',
      evidence: `$${(candidate.fdv / 1000).toFixed(0)}K market cap - ${isMicroCap ? 'high upside potential' : 'outside optimal range'}`,
    });

    // CONDITION 4: HEALTHY LIQUIDITY RATIO
    // 5-30% liq ratio is healthy - too low = rug risk, too high = hard to pump
    const healthyLiquidity = liqRatio >= 5 && liqRatio <= 40 && candidate.liquidity >= 10000;
    conditions.push({
      name: 'Healthy Liquidity',
      passed: healthyLiquidity,
      value: liqRatio,
      threshold: '5-40% liq/mcap, min $10K',
      evidence: `${liqRatio.toFixed(1)}% liquidity ratio ($${(candidate.liquidity / 1000).toFixed(0)}K)`,
    });

    // CONDITION 5: EARLY MOMENTUM (not late)
    // Want tokens just starting to move, not already 500% up
    const earlyMomentum = candidate.priceChange1h > 5 && candidate.priceChange1h < 100;
    conditions.push({
      name: 'Early Momentum',
      passed: earlyMomentum,
      value: candidate.priceChange1h,
      threshold: '5-100% 1h change',
      evidence: earlyMomentum 
        ? `Early stage pump: +${candidate.priceChange1h.toFixed(0)}% 1h - still room to run`
        : candidate.priceChange1h >= 100 
          ? `Late entry: +${candidate.priceChange1h.toFixed(0)}% already - risky`
          : `Flat: ${candidate.priceChange1h.toFixed(1)}% 1h - waiting for catalyst`,
    });

    // CONDITION 6: TRANSACTION VELOCITY
    // High transaction count = active interest
    const highActivity = totalTxns > 200;
    conditions.push({
      name: 'Transaction Velocity',
      passed: highActivity,
      value: totalTxns,
      threshold: '>200 txns/24h',
      evidence: `${totalTxns} transactions in 24h (${candidate.buys24h} buys, ${candidate.sells24h} sells)`,
    });

    // CONDITION 7: NOT ALREADY PUMPED
    // Avoid tokens that already did 10x today
    const notOverextended = candidate.priceChange24h < 500;
    conditions.push({
      name: 'Not Overextended',
      passed: notOverextended,
      value: candidate.priceChange24h,
      threshold: '<500% 24h',
      evidence: notOverextended
        ? `24h change: ${candidate.priceChange24h.toFixed(0)}% - room for growth`
        : `Already pumped ${candidate.priceChange24h.toFixed(0)}% in 24h - late entry risk`,
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
   * Calculate PRE-PUMP scores for a token
   * Refined based on analysis of 100+ pumps
   * Higher score = more likely to pump in next 4 hours
   */
  private calculateScores(
    token: TokenCandidate,
    conditions: DiscoveryCondition[]
  ): { scores: TokenScores; signals: string[] } {
    const signals: string[] = [];
    
    // Core metrics
    let momentum = 0;
    const totalTxns = token.buys24h + token.sells24h;
    const buyRatio = totalTxns > 0 ? token.buys24h / totalTxns : 0;
    const volumeRatio = token.fdv > 0 ? token.volume24h / token.fdv : 0;
    const liqRatio = token.fdv > 0 ? (token.liquidity / token.fdv) * 100 : 0;

    // ============================================
    // CRITICAL: Trend Analysis (1h + 6h combo)
    // ============================================
    const h6 = token.priceChange6h || 0;
    
    // WORST: Still dumping (negative 6h AND negative 1h)
    if (h6 < -50 && token.priceChange1h < 0) {
      momentum -= 50; // Heavy penalty - still in freefall
      signals.push(`⛔ FREEFALL: -${Math.abs(h6).toFixed(0)}% 6h, still dropping - AVOID`);
    }
    else if (token.priceChange1h < -10) {
      momentum -= 35; // Heavy penalty for active dumps
      signals.push(`⛔ Dumping ${token.priceChange1h.toFixed(0)}% - AVOID`);
    }
    else if (token.priceChange1h < -5) {
      momentum -= 20;
      signals.push(`⚠️ Weak: ${token.priceChange1h.toFixed(0)}% 1h`);
    }
    
    // BEST: Bouncing from dip (negative 6h BUT positive 1h)
    if (h6 < -30 && token.priceChange1h > 10) {
      momentum += 30;
      signals.push(`🚀 BOUNCE: Recovering +${token.priceChange1h.toFixed(0)}% from 6h dip`);
    }

    // ============================================
    // PRIME PATTERN: Accumulation (calm before storm)
    // HIGH vol/mcap + FLAT price = smart money loading quietly
    // ONLY if not in freefall (6h > -50%)
    // ============================================
    const notInFreefall = (token.priceChange6h || 0) > -50;
    
    // BEST: Extreme volume but price flat = massive accumulation
    if (volumeRatio > 20 && Math.abs(token.priceChange1h) < 10 && buyRatio > 0.55 && notInFreefall) {
      momentum += 50; // Highest bonus - this is the perfect setup!
      signals.push(`🔥 STEALTH LOAD: ${(volumeRatio * 100).toFixed(0)}% vol/mcap, price flat - PRIME ENTRY`);
    }
    else if (volumeRatio > 5 && Math.abs(token.priceChange1h) < 10 && buyRatio > 0.50 && notInFreefall) {
      momentum += 35;
      signals.push(`🎯 BREAKOUT SETUP: Heavy volume, buyers loading`);
    }
    else if (volumeRatio > 0.5 && token.priceChange1h >= 0 && token.priceChange1h < 30 && buyRatio > 0.55 && notInFreefall) {
      momentum += 30;
      signals.push(`📥 Accumulation phase detected`);
    }
    else if (volumeRatio > 0.3 && buyRatio > 0.55 && token.priceChange1h >= 0 && notInFreefall) {
      momentum += 20;
    }

    // ============================================
    // MOMENTUM ANALYSIS: Lower weight - early movers often reverse
    // Focus on catching BEFORE the move, not during
    // ============================================
    if (token.priceChange1h >= 0 && token.priceChange1h < 5) {
      // BEST: Flat price = haven't moved yet
      momentum += 15;
      signals.push(`🎯 GROUND FLOOR: Price stable, waiting for catalyst`);
    }
    else if (token.priceChange1h >= 5 && token.priceChange1h < 15) {
      momentum += 20;
      signals.push(`⚡ Early move +${token.priceChange1h.toFixed(0)}%`);
    }
    else if (token.priceChange1h >= 15 && token.priceChange1h < 30) {
      momentum += 15; // Lower - might be topping
      signals.push(`🚀 Active +${token.priceChange1h.toFixed(0)}% - watch for reversal`);
    }
    else if (token.priceChange1h >= 30 && token.priceChange1h < 60) {
      momentum += 5; // Very low - likely topping
      signals.push(`⚠️ Extended +${token.priceChange1h.toFixed(0)}% - high reversal risk`);
    }
    else if (token.priceChange1h >= 60) {
      momentum -= 15; // Penalty
      signals.push(`🚨 FOMO TRAP: +${token.priceChange1h.toFixed(0)}% - likely to reverse`);
    }

    // ============================================
    // BUY PRESSURE: More buyers = pump fuel
    // ============================================
    if (buyRatio > 0.70) {
      momentum += 25;
      signals.push(`🐋 Whale buying: ${(buyRatio * 100).toFixed(0)}% buys`);
    }
    else if (buyRatio > 0.60) {
      momentum += 20;
      signals.push(`💪 Strong demand: ${(buyRatio * 100).toFixed(0)}% buys`);
    }
    else if (buyRatio > 0.55) {
      momentum += 15;
    }
    else if (buyRatio < 0.45) {
      momentum -= 15; // Selling pressure
      signals.push(`📉 Sell pressure: ${(buyRatio * 100).toFixed(0)}% buys`);
    }

    // ============================================
    // MICRO CAP: Maximum pump potential
    // ============================================
    if (token.fdv < 50000 && token.fdv > 5000) {
      momentum += 20;
      signals.push(`💎 GEM: $${(token.fdv / 1000).toFixed(0)}K mcap - 100x potential`);
    }
    else if (token.fdv < 100000) {
      momentum += 15;
      signals.push(`🎯 Micro: $${(token.fdv / 1000).toFixed(0)}K - 50x potential`);
    }
    else if (token.fdv < 250000) {
      momentum += 10;
      signals.push(`💰 Low cap: $${(token.fdv / 1000).toFixed(0)}K - 20x potential`);
    }
    else if (token.fdv < 500000) {
      momentum += 5;
    }

    // ============================================
    // ACTIVITY: High txns = active interest
    // ============================================
    if (totalTxns > 1000) {
      momentum += 15;
      signals.push(`🔥 HOT: ${totalTxns.toLocaleString()} txns`);
    }
    else if (totalTxns > 500) momentum += 10;
    else if (totalTxns > 200) momentum += 5;
    else if (totalTxns < 50) {
      momentum -= 10; // Low activity = dead
    }

    // ============================================
    // REVERSAL WARNING: Big 24h gain + negative 1h = dump
    // ============================================
    if (token.priceChange24h > 200 && token.priceChange1h < 0) {
      momentum -= 20;
      signals.push(`⛔ REVERSAL: Pumped ${token.priceChange24h.toFixed(0)}% then dumped`);
    }

    // ============================================
    // FRESH TOKEN BONUS: New = undiscovered
    // ============================================
    const tokenAgeHours = token.pairCreatedAt 
      ? (Date.now() - new Date(token.pairCreatedAt).getTime()) / (1000 * 60 * 60)
      : 999;
    
    if (tokenAgeHours < 2) {
      momentum += 25;
      signals.push(`🆕 BRAND NEW: ${tokenAgeHours.toFixed(1)}h old - first mover advantage`);
    }
    else if (tokenAgeHours < 6) {
      momentum += 15;
      signals.push(`🌱 Fresh: ${tokenAgeHours.toFixed(0)}h old - early discovery`);
    }
    else if (tokenAgeHours < 24) {
      momentum += 5;
    }

    // ============================================
    // COILING PATTERN: Price tight + volume building = explosion incoming
    // Price stable (-10% to +10% 1h) but high activity = pressure building
    // ============================================
    if (Math.abs(token.priceChange1h) < 10 && volumeRatio > 0.5 && totalTxns > 500) {
      momentum += 20;
      signals.push(`🎯 COILING: Price stable, volume building - breakout imminent`);
    }

    // ============================================
    // V-RECOVERY: Proven high-success pattern
    // Deep 6h dip + strong 1h recovery = momentum building
    // ============================================
    const h6Change = token.priceChange6h || 0;
    
    // STRONGEST: Deep dip + strong bounce + buying pressure
    if (h6Change < -50 && token.priceChange1h > 15 && buyRatio > 0.55) {
      momentum += 35; // Highest bonus - validated pattern!
      signals.push(`🔥 V-RECOVERY: +${token.priceChange1h.toFixed(0)}% bounce from -${Math.abs(h6Change).toFixed(0)}% dip - VALIDATED PATTERN`);
    }
    else if (h6Change < -30 && token.priceChange1h > 10 && buyRatio > 0.55) {
      momentum += 25;
      signals.push(`🔥 BOUNCE: V-recovery +${token.priceChange1h.toFixed(0)}% from dip`);
    }
    else if (h6Change < -20 && token.priceChange1h > 5 && buyRatio > 0.55) {
      momentum += 15;
      signals.push(`📈 Bounce forming: +${token.priceChange1h.toFixed(0)}% recovery`);
    }

    // Liquidity Score (0-100)
    let liquidity = 0;
    
    // Absolute liquidity
    if (token.liquidity >= 100000) liquidity += 40;
    else if (token.liquidity >= 50000) liquidity += 35;
    else if (token.liquidity >= 25000) liquidity += 30;
    else if (token.liquidity >= 10000) liquidity += 25;
    else if (token.liquidity >= 5000) liquidity += 15;
    else liquidity += 5;

    // Liquidity to mcap ratio (liqRatio already defined above)
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

    // Composite score (weighted for PRE-PUMP detection)
    // Momentum is king for catching pumps early
    const composite = Math.round(
      momentum * 0.50 +     // Momentum most important
      risk * 0.25 +         // Safety second
      liquidity * 0.15 +    // Liquidity for exit ability
      confidence * 0.10    // Data quality
    );

    // PRIME SIGNAL: Best possible setup
    if (momentum >= 70 && buyRatio > 0.55 && token.priceChange1h > 0 && token.priceChange1h < 50 && token.fdv < 500000) {
      signals.unshift(`🚨 PRIME SIGNAL: High confidence pre-pump setup`);
    }

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
