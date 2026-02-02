/**
 * ClawF Social Signal Analyzer
 * 
 * Analyzes Twitter/X mentions for token validation.
 * Uses public post analysis only - no user profiling.
 */

// X API credentials from environment
const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN || '';

interface SocialSignal {
  mentionCount: number;
  mentionVelocity: number; // mentions per hour
  spikeDetected: boolean;
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'unknown';
  lastChecked: Date;
  trendingScore: number; // 0-100
}

interface CachedSocialData {
  signal: SocialSignal;
  timestamp: number;
}

// Cache social data for 5 minutes
const socialCache = new Map<string, CachedSocialData>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests

/**
 * Get social signals for a token
 */
export async function getSocialSignals(
  tokenAddress: string,
  symbol: string
): Promise<SocialSignal | null> {
  const cacheKey = `${tokenAddress}:${symbol}`;
  
  // Check cache first
  const cached = socialCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.signal;
  }
  
  // If no X bearer token configured, return null (graceful degradation)
  if (!X_BEARER_TOKEN) {
    return null;
  }
  
  // Rate limiting
  const now = Date.now();
  if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
    // Return cached or null if rate limited
    return cached?.signal || null;
  }
  lastRequestTime = now;
  
  try {
    const signal = await fetchTwitterMentions(tokenAddress, symbol);
    
    // Cache the result
    socialCache.set(cacheKey, {
      signal,
      timestamp: now,
    });
    
    return signal;
  } catch (error) {
    console.error('Social signal fetch error:', error);
    return cached?.signal || null;
  }
}

/**
 * Fetch Twitter mentions for a token
 */
async function fetchTwitterMentions(
  tokenAddress: string,
  symbol: string
): Promise<SocialSignal> {
  // Search for token address or symbol mentions
  // Using X API v2 recent search endpoint
  const query = encodeURIComponent(`${tokenAddress} OR $${symbol} -is:retweet`);
  const url = `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=100&tweet.fields=created_at,public_metrics`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${X_BEARER_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      if (response.status === 429) {
        console.warn('X API rate limited');
      }
      throw new Error(`X API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Process tweets
    const tweets = data.data || [];
    const mentionCount = tweets.length;
    
    // Calculate velocity (mentions per hour)
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const recentTweets = tweets.filter((t: any) => 
      new Date(t.created_at) >= oneHourAgo
    );
    const mentionVelocity = recentTweets.length;
    
    // Detect spike (more than 10 mentions in last hour for a new token is significant)
    const spikeDetected = mentionVelocity > 10;
    
    // Simple sentiment analysis based on engagement
    let totalLikes = 0;
    let totalRetweets = 0;
    tweets.forEach((t: any) => {
      totalLikes += t.public_metrics?.like_count || 0;
      totalRetweets += t.public_metrics?.retweet_count || 0;
    });
    
    // High engagement = bullish sentiment (simplified)
    const avgEngagement = mentionCount > 0 
      ? (totalLikes + totalRetweets) / mentionCount 
      : 0;
    
    let sentiment: 'bullish' | 'bearish' | 'neutral' | 'unknown' = 'unknown';
    if (mentionCount >= 5) {
      if (avgEngagement > 10) sentiment = 'bullish';
      else if (avgEngagement > 2) sentiment = 'neutral';
      else sentiment = 'neutral';
    }
    
    // Calculate trending score
    let trendingScore = 0;
    trendingScore += Math.min(30, mentionCount * 3); // Up to 30 for count
    trendingScore += Math.min(40, mentionVelocity * 4); // Up to 40 for velocity
    trendingScore += Math.min(30, avgEngagement * 3); // Up to 30 for engagement
    trendingScore = Math.min(100, trendingScore);
    
    return {
      mentionCount,
      mentionVelocity,
      spikeDetected,
      sentiment,
      lastChecked: now,
      trendingScore,
    };
  } catch (error) {
    // Return minimal signal on error
    return {
      mentionCount: 0,
      mentionVelocity: 0,
      spikeDetected: false,
      sentiment: 'unknown',
      lastChecked: new Date(),
      trendingScore: 0,
    };
  }
}

/**
 * Check if a token has social validation (enough mentions + positive sentiment)
 */
export function hasSocialValidation(signal: SocialSignal | null): boolean {
  if (!signal) return false;
  
  // Consider validated if:
  // - At least 5 mentions
  // - Trending score >= 30
  // - Sentiment is not bearish
  return (
    signal.mentionCount >= 5 &&
    signal.trendingScore >= 30 &&
    signal.sentiment !== 'bearish'
  );
}

/**
 * Get social validation boost for scoring
 */
export function getSocialBoost(signal: SocialSignal | null): number {
  if (!signal) return 0;
  
  let boost = 0;
  
  // Boost for mentions
  if (signal.mentionCount >= 20) boost += 15;
  else if (signal.mentionCount >= 10) boost += 10;
  else if (signal.mentionCount >= 5) boost += 5;
  
  // Boost for velocity (viral activity)
  if (signal.spikeDetected) boost += 10;
  else if (signal.mentionVelocity >= 5) boost += 5;
  
  // Boost for positive sentiment
  if (signal.sentiment === 'bullish') boost += 10;
  else if (signal.sentiment === 'neutral') boost += 5;
  
  return Math.min(30, boost); // Cap at 30
}

/**
 * Generate social signal summary for display
 */
export function formatSocialSignal(signal: SocialSignal | null): string | null {
  if (!signal || signal.mentionCount === 0) return null;
  
  const parts: string[] = [];
  
  if (signal.spikeDetected) {
    parts.push(`🔥 VIRAL: ${signal.mentionCount} mentions, ${signal.mentionVelocity}/hr`);
  } else if (signal.mentionCount >= 10) {
    parts.push(`📢 TRENDING: ${signal.mentionCount} mentions`);
  } else if (signal.mentionCount >= 5) {
    parts.push(`💬 Active: ${signal.mentionCount} mentions`);
  }
  
  if (signal.sentiment === 'bullish') {
    parts.push('sentiment: bullish');
  }
  
  return parts.length > 0 ? parts.join(' • ') : null;
}

/**
 * Clear social cache
 */
export function clearSocialCache(): void {
  socialCache.clear();
}
