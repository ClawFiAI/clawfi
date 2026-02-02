/**
 * ClawF Social Signal Analyzer
 * 
 * Monitors X (Twitter) for public posts containing token contract addresses.
 * Provides informational context only - NEVER a sole trigger.
 * 
 * RULES:
 * - Query public posts only
 * - Count mentions and velocity
 * - Detect spikes and spam patterns
 * - Never store or profile users
 * - Never republish post content
 */

import { SocialSignals, ClawFConfig, DEFAULT_CONFIG } from './types.js';

// ============================================
// X API Configuration
// ============================================

const X_API_BASE = 'https://api.twitter.com/2';

interface XApiConfig {
  bearerToken: string;
  consumerKey?: string;
  consumerSecret?: string;
}

// ============================================
// Rate Limiting
// ============================================

interface RateLimitState {
  remaining: number;
  resetTime: number;
}

const rateLimits: Map<string, RateLimitState> = new Map();

function canMakeRequest(endpoint: string): boolean {
  const state = rateLimits.get(endpoint);
  if (!state) return true;
  if (Date.now() > state.resetTime) return true;
  return state.remaining > 0;
}

function updateRateLimit(endpoint: string, remaining: number, resetTime: number): void {
  rateLimits.set(endpoint, { remaining, resetTime });
}

// ============================================
// Caching
// ============================================

interface CacheEntry {
  data: SocialSignals;
  timestamp: number;
}

const signalCache = new Map<string, CacheEntry>();
const CACHE_DURATION_MS = 60000; // 1 minute

// ============================================
// Social Signal Analyzer
// ============================================

export class SocialSignalAnalyzer {
  private config: ClawFConfig;
  private apiConfig: XApiConfig | null = null;
  private mentionHistory: Map<string, number[]> = new Map(); // For velocity calculation

  constructor(config: Partial<ClawFConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeApi();
  }

  /**
   * Initialize X API credentials from environment
   */
  private initializeApi(): void {
    const bearerToken = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN;
    
    if (bearerToken) {
      this.apiConfig = {
        bearerToken,
        consumerKey: process.env.X_CONSUMER_KEY || process.env.TWITTER_CONSUMER_KEY,
        consumerSecret: process.env.X_CONSUMER_SECRET || process.env.TWITTER_CONSUMER_SECRET,
      };
      console.log('📱 ClawF Social Signal Analyzer initialized with X API');
    } else {
      console.warn('⚠️ X API credentials not configured - social signals disabled');
    }
  }

  /**
   * Check if social analysis is available
   */
  isAvailable(): boolean {
    return this.apiConfig !== null;
  }

  /**
   * Analyze social signals for a token address
   */
  async analyzeToken(tokenAddress: string): Promise<SocialSignals> {
    // Check cache first
    const cached = this.getCached(tokenAddress);
    if (cached) return cached;

    // Return empty signals if API not configured
    if (!this.apiConfig) {
      return this.emptySignals();
    }

    try {
      // Search for posts containing the token address
      const searchResults = await this.searchPosts(tokenAddress);
      
      if (!searchResults) {
        return this.emptySignals();
      }

      // Analyze results
      const signals = this.processSearchResults(tokenAddress, searchResults);
      
      // Cache results
      this.setCache(tokenAddress, signals);
      
      return signals;
    } catch (error) {
      console.error('Social analysis error:', error);
      return this.emptySignals();
    }
  }

  /**
   * Search X for posts containing a token address
   */
  private async searchPosts(tokenAddress: string): Promise<XSearchResponse | null> {
    if (!this.apiConfig || !canMakeRequest('search')) {
      return null;
    }

    try {
      // Search for exact contract address mentions
      // Use quotes to search for exact match
      const query = encodeURIComponent(`"${tokenAddress}"`);
      const url = `${X_API_BASE}/tweets/search/recent?query=${query}&max_results=100&tweet.fields=created_at,public_metrics,author_id`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiConfig.bearerToken}`,
          'Content-Type': 'application/json',
        },
      });

      // Update rate limits from response headers
      const remaining = parseInt(response.headers.get('x-rate-limit-remaining') || '100');
      const resetTime = parseInt(response.headers.get('x-rate-limit-reset') || '0') * 1000;
      updateRateLimit('search', remaining, resetTime);

      if (!response.ok) {
        if (response.status === 429) {
          console.warn('X API rate limited');
        }
        return null;
      }

      return await response.json() as XSearchResponse;
    } catch (error) {
      console.error('X API search error:', error);
      return null;
    }
  }

  /**
   * Process search results into signals
   */
  private processSearchResults(tokenAddress: string, results: XSearchResponse): SocialSignals {
    const tweets = results.data || [];
    const mentionCount = tweets.length;
    
    // Calculate unique posters
    const uniqueAuthors = new Set(tweets.map(t => t.author_id));
    const uniquePosters = uniqueAuthors.size;
    
    // Calculate repeat poster ratio (spam indicator)
    const repeatPostersRatio = mentionCount > 0 
      ? 1 - (uniquePosters / mentionCount) 
      : 0;

    // Calculate velocity (mentions per minute)
    const velocity = this.calculateVelocity(tokenAddress, mentionCount);
    
    // Update mention history for velocity tracking
    this.updateMentionHistory(tokenAddress, mentionCount);

    // Detect spike
    const spikeDetected = this.detectSpike(tokenAddress, mentionCount, velocity);

    // Calculate spam score
    const spamScore = this.calculateSpamScore(repeatPostersRatio, mentionCount, velocity);

    return {
      mentionCount,
      mentionVelocity: velocity,
      spikeDetected,
      spamScore,
      lastChecked: new Date(),
      uniquePosters,
      repeatPostersRatio,
    };
  }

  /**
   * Calculate mention velocity (mentions per minute)
   */
  private calculateVelocity(tokenAddress: string, currentCount: number): number {
    const history = this.mentionHistory.get(tokenAddress) || [];
    
    if (history.length === 0) {
      return 0;
    }

    // Calculate change from last reading
    const lastCount = history[history.length - 1];
    const change = currentCount - lastCount;
    
    // Assuming ~1 minute between readings
    return Math.max(0, change);
  }

  /**
   * Update mention history for a token
   */
  private updateMentionHistory(tokenAddress: string, count: number): void {
    const history = this.mentionHistory.get(tokenAddress) || [];
    history.push(count);
    
    // Keep last 10 readings
    if (history.length > 10) {
      history.shift();
    }
    
    this.mentionHistory.set(tokenAddress, history);
  }

  /**
   * Detect if there's a mention spike
   */
  private detectSpike(tokenAddress: string, currentCount: number, velocity: number): boolean {
    // Spike if velocity exceeds threshold
    if (velocity >= this.config.socialSpikeThreshold) {
      return true;
    }

    // Spike if count suddenly increased significantly
    const history = this.mentionHistory.get(tokenAddress) || [];
    if (history.length >= 3) {
      const avgRecent = history.slice(-3).reduce((a, b) => a + b, 0) / 3;
      if (currentCount > avgRecent * 3) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate spam score (0-100, higher = more spam-like)
   */
  private calculateSpamScore(repeatRatio: number, mentionCount: number, velocity: number): number {
    let score = 0;

    // High repeat ratio is spammy
    if (repeatRatio > 0.7) score += 40;
    else if (repeatRatio > 0.5) score += 25;
    else if (repeatRatio > 0.3) score += 10;

    // Extremely high velocity can indicate bot activity
    if (velocity > 20) score += 30;
    else if (velocity > 10) score += 20;
    else if (velocity > 5) score += 10;

    // Low mention count with high velocity = likely coordinated
    if (mentionCount < 20 && velocity > 5) {
      score += 20;
    }

    return Math.min(100, score);
  }

  /**
   * Get cached signals
   */
  private getCached(tokenAddress: string): SocialSignals | null {
    const entry = signalCache.get(tokenAddress);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_DURATION_MS) {
      signalCache.delete(tokenAddress);
      return null;
    }
    return entry.data;
  }

  /**
   * Set cached signals
   */
  private setCache(tokenAddress: string, signals: SocialSignals): void {
    signalCache.set(tokenAddress, {
      data: signals,
      timestamp: Date.now(),
    });
  }

  /**
   * Return empty signals when unavailable
   */
  private emptySignals(): SocialSignals {
    return {
      mentionCount: 0,
      mentionVelocity: 0,
      spikeDetected: false,
      spamScore: 0,
      lastChecked: new Date(),
      uniquePosters: 0,
      repeatPostersRatio: 0,
    };
  }

  /**
   * Bulk analyze multiple tokens
   */
  async analyzeTokens(addresses: string[]): Promise<Map<string, SocialSignals>> {
    const results = new Map<string, SocialSignals>();
    
    // Process in batches to respect rate limits
    for (const address of addresses) {
      if (!canMakeRequest('search')) {
        // Return cached or empty for remaining
        results.set(address, this.getCached(address) || this.emptySignals());
        continue;
      }

      const signals = await this.analyzeToken(address);
      results.set(address, signals);
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): { remaining: number; resetIn: number } {
    const state = rateLimits.get('search');
    if (!state) {
      return { remaining: 100, resetIn: 0 };
    }
    return {
      remaining: state.remaining,
      resetIn: Math.max(0, state.resetTime - Date.now()),
    };
  }
}

// ============================================
// X API Types
// ============================================

interface XSearchResponse {
  data?: XTweet[];
  meta?: {
    newest_id?: string;
    oldest_id?: string;
    result_count?: number;
  };
}

interface XTweet {
  id: string;
  text: string;
  author_id: string;
  created_at?: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
}
