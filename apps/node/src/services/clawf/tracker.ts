/**
 * ClawF Performance Tracker
 * 
 * Tracks tokens from when ClawF first detects them to show performance.
 * Stores: address, chain, initial price, detection time, peak price
 */

interface TrackedToken {
  address: string;
  chain: string;
  symbol: string;
  initialPrice: number;
  detectedAt: Date;
  peakPrice: number;
  peakAt: Date;
  lastPrice: number;
  lastUpdated: Date;
}

// In-memory store (persists until restart)
// In production, this would use Redis or SQLite
const trackedTokens = new Map<string, TrackedToken>();

// Max tokens to track (rolling window)
const MAX_TRACKED = 500;

// How long to keep tracking (7 days)
const TRACK_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Get unique key for a token
 */
function getKey(address: string, chain: string): string {
  return `${chain}:${address.toLowerCase()}`;
}

/**
 * Track a new token or update existing
 */
export function trackToken(
  address: string,
  chain: string,
  symbol: string,
  currentPrice: number
): TrackedToken {
  const key = getKey(address, chain);
  const now = new Date();
  
  const existing = trackedTokens.get(key);
  
  if (existing) {
    // Update existing token
    existing.lastPrice = currentPrice;
    existing.lastUpdated = now;
    
    // Update peak if new high
    if (currentPrice > existing.peakPrice) {
      existing.peakPrice = currentPrice;
      existing.peakAt = now;
    }
    
    return existing;
  }
  
  // New token - add to tracking
  const tracked: TrackedToken = {
    address,
    chain,
    symbol,
    initialPrice: currentPrice,
    detectedAt: now,
    peakPrice: currentPrice,
    peakAt: now,
    lastPrice: currentPrice,
    lastUpdated: now,
  };
  
  // Clean up old entries if at capacity
  if (trackedTokens.size >= MAX_TRACKED) {
    cleanupOldTokens();
  }
  
  trackedTokens.set(key, tracked);
  return tracked;
}

/**
 * Get tracking data for a token
 */
export function getTrackedToken(address: string, chain: string): TrackedToken | null {
  const key = getKey(address, chain);
  return trackedTokens.get(key) || null;
}

/**
 * Calculate performance since ClawF detected the token
 */
export function getPerformance(address: string, chain: string, currentPrice: number): {
  gainSinceDetection: number;      // % gain from initial price
  gainFromPeak: number;            // % from peak (negative if dropped)
  peakGain: number;                // Max gain achieved
  hoursTracked: number;            // How long we've been tracking
  detectedAt: string;              // ISO timestamp
} | null {
  const tracked = getTrackedToken(address, chain);
  if (!tracked) return null;
  
  // Update with current price
  trackToken(address, chain, tracked.symbol, currentPrice);
  
  const gainSinceDetection = tracked.initialPrice > 0
    ? ((currentPrice - tracked.initialPrice) / tracked.initialPrice) * 100
    : 0;
    
  const gainFromPeak = tracked.peakPrice > 0
    ? ((currentPrice - tracked.peakPrice) / tracked.peakPrice) * 100
    : 0;
    
  const peakGain = tracked.initialPrice > 0
    ? ((tracked.peakPrice - tracked.initialPrice) / tracked.initialPrice) * 100
    : 0;
    
  const hoursTracked = (Date.now() - tracked.detectedAt.getTime()) / (1000 * 60 * 60);
  
  return {
    gainSinceDetection: Math.round(gainSinceDetection * 10) / 10,
    gainFromPeak: Math.round(gainFromPeak * 10) / 10,
    peakGain: Math.round(peakGain * 10) / 10,
    hoursTracked: Math.round(hoursTracked * 10) / 10,
    detectedAt: tracked.detectedAt.toISOString(),
  };
}

/**
 * Get all tracked tokens with their performance
 */
export function getAllTracked(): Array<TrackedToken & { performance: ReturnType<typeof getPerformance> }> {
  const results: Array<TrackedToken & { performance: ReturnType<typeof getPerformance> }> = [];
  
  for (const tracked of trackedTokens.values()) {
    const performance = getPerformance(tracked.address, tracked.chain, tracked.lastPrice);
    results.push({ ...tracked, performance });
  }
  
  // Sort by gain (best performers first)
  return results.sort((a, b) => 
    (b.performance?.gainSinceDetection || 0) - (a.performance?.gainSinceDetection || 0)
  );
}

/**
 * Get top performers
 */
export function getTopPerformers(limit = 10): Array<{
  symbol: string;
  chain: string;
  address: string;
  gainSinceDetection: number;
  peakGain: number;
  hoursTracked: number;
  detectedAt: string;
}> {
  const all = getAllTracked();
  
  return all
    .filter(t => t.performance && t.performance.gainSinceDetection > 0)
    .slice(0, limit)
    .map(t => ({
      symbol: t.symbol,
      chain: t.chain,
      address: t.address,
      gainSinceDetection: t.performance!.gainSinceDetection,
      peakGain: t.performance!.peakGain,
      hoursTracked: t.performance!.hoursTracked,
      detectedAt: t.performance!.detectedAt,
    }));
}

/**
 * Remove old tracked tokens
 */
function cleanupOldTokens(): void {
  const now = Date.now();
  const toDelete: string[] = [];
  
  for (const [key, token] of trackedTokens.entries()) {
    if (now - token.detectedAt.getTime() > TRACK_DURATION_MS) {
      toDelete.push(key);
    }
  }
  
  for (const key of toDelete) {
    trackedTokens.delete(key);
  }
  
  // If still at capacity, remove oldest
  if (trackedTokens.size >= MAX_TRACKED) {
    const sorted = Array.from(trackedTokens.entries())
      .sort((a, b) => a[1].detectedAt.getTime() - b[1].detectedAt.getTime());
    
    const removeCount = Math.ceil(MAX_TRACKED * 0.1); // Remove 10%
    for (let i = 0; i < removeCount && i < sorted.length; i++) {
      trackedTokens.delete(sorted[i][0]);
    }
  }
}

/**
 * Get tracking stats
 */
export function getTrackingStats(): {
  totalTracked: number;
  avgGain: number;
  topGain: number;
  greenCount: number;
  redCount: number;
} {
  const all = getAllTracked();
  
  let totalGain = 0;
  let topGain = 0;
  let greenCount = 0;
  let redCount = 0;
  
  for (const token of all) {
    const gain = token.performance?.gainSinceDetection || 0;
    totalGain += gain;
    if (gain > topGain) topGain = gain;
    if (gain > 0) greenCount++;
    else redCount++;
  }
  
  return {
    totalTracked: all.length,
    avgGain: all.length > 0 ? Math.round(totalGain / all.length) : 0,
    topGain: Math.round(topGain),
    greenCount,
    redCount,
  };
}
