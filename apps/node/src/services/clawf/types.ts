/**
 * ClawF Core Types
 * 
 * Type definitions for the ClawF intelligence agent
 */

// ============================================
// Supported Chains
// ============================================

export type SupportedChain = 'base' | 'ethereum' | 'bsc' | 'solana';

export const SUPPORTED_CHAINS: SupportedChain[] = ['base', 'ethereum', 'bsc', 'solana'];

// ============================================
// Token Candidate Types
// ============================================

export interface TokenCandidate {
  // Identity
  address: string;
  symbol: string;
  name: string;
  chain: SupportedChain;
  
  // Market Data
  priceUsd: number;
  priceChange1h: number;
  priceChange6h: number;
  priceChange24h: number;
  volume24h: number;
  volumeChange: number; // vs baseline
  liquidity: number;
  fdv: number;
  
  // Transaction Data
  buys24h: number;
  sells24h: number;
  uniqueBuyers24h: number;
  uniqueSellers24h: number;
  
  // Metadata (informational only, never filters)
  tokenAge?: number; // seconds since creation
  launchpad?: string;
  pairAddress?: string;
  pairCreatedAt?: Date;
  
  // Computed Scores
  scores: TokenScores;
  
  // Signals (human-readable insights)
  signals: string[];
  
  // Flags
  flags: TokenFlag[];
  
  // Context
  socialSignals?: SocialSignals;
  walletIntelligence?: WalletIntelligence;
  
  // Timestamps
  discoveredAt: Date;
  lastUpdated: Date;
}

export interface TokenScores {
  momentum: number;      // 0-100: demand acceleration
  liquidity: number;     // 0-100: liquidity health
  risk: number;          // 0-100: higher = SAFER
  confidence: number;    // 0-100: data completeness
  composite: number;     // weighted combination
}

// ============================================
// Discovery Conditions
// ============================================

export interface DiscoveryCondition {
  name: string;
  passed: boolean;
  value: number | string | boolean;
  threshold: number | string | boolean;
  evidence: string;
}

export interface DiscoveryResult {
  candidate: TokenCandidate;
  conditionsPassed: number;
  conditionsTotal: number;
  conditions: DiscoveryCondition[];
  qualifies: boolean;
}

// ============================================
// Flag System
// ============================================

export type FlagSeverity = 'hard' | 'soft';

export type FlagType = 
  // Hard flags (critical)
  | 'LIQUIDITY_REMOVED'
  | 'HONEYPOT_SUSPECTED'
  | 'TRADING_DISABLED'
  | 'EXTREME_CONCENTRATION'
  // Soft flags (warnings)
  | 'FEE_ON_TRANSFER'
  | 'WASH_TRADING'
  | 'CREATOR_ROTATION'
  | 'HYPE_NO_LIQUIDITY'
  | 'BOT_HEAVY_ACTIVITY'
  | 'RAPID_PUMP';

export interface TokenFlag {
  type: FlagType;
  severity: FlagSeverity;
  message: string;
  evidence: Record<string, unknown>;
  detectedAt: Date;
}

// ============================================
// Social Signals (X/Twitter)
// ============================================

export interface SocialSignals {
  mentionCount: number;
  mentionVelocity: number; // mentions per minute
  spikeDetected: boolean;
  spamScore: number; // 0-100, higher = more spam-like
  lastChecked: Date;
  
  // Raw metrics
  uniquePosters: number;
  repeatPostersRatio: number;
}

// ============================================
// Wallet Intelligence
// ============================================

export interface WalletClassification {
  address: string;
  isOld: boolean;           // >= 6 months or 100+ txns
  isProfitable: boolean;    // positive historical PnL
  firstActivity?: Date;
  transactionCount?: number;
  distinctContracts?: number;
  estimatedPnL?: number;
}

export interface WalletIntelligence {
  // Counts
  totalBuyers: number;
  oldWalletCount: number;
  profitableWalletCount: number;
  
  // Percentages
  oldWalletPercent: number;
  profitableWalletPercent: number;
  
  // Volume share
  volumeShareFromOldWallets: number;
  volumeShareFromProfitableWallets: number;
  
  // Analysis timestamp
  analyzedAt: Date;
  
  // Sample wallets for transparency
  sampleOldWallets: string[];
  sampleProfitableWallets: string[];
}

// ============================================
// Position Tracking
// ============================================

export type ExitSignalType = 
  | 'HOLD'
  | 'TRIM'
  | 'EXIT';

export type ExitTriggerReason =
  | 'PROFIT_TARGET_2X'
  | 'PROFIT_TARGET_5X'
  | 'PROFIT_TARGET_10X'
  | 'TRAILING_STOP'
  | 'LIQUIDITY_DROP'
  | 'MOMENTUM_REVERSAL'
  | 'SMART_MONEY_EXIT'
  | 'HARD_FLAG_DETECTED'
  | 'MANUAL';

export interface TrackedPosition {
  id: string;
  token: TokenCandidate;
  
  // Entry
  entryPrice: number;
  entryTime: Date;
  entryLiquidity: number;
  
  // Current state
  currentPrice: number;
  currentLiquidity: number;
  currentMultiple: number;
  
  // Peak tracking
  peakPrice: number;
  peakMultiple: number;
  peakTime: Date;
  
  // Exit signals
  exitSignal: ExitSignal;
  exitHistory: ExitSignal[];
  
  // Status
  status: 'active' | 'trimmed' | 'exited' | 'rugged';
}

export interface ExitSignal {
  signal: ExitSignalType;
  reason: ExitTriggerReason;
  confidence: 'low' | 'medium' | 'high';
  timestamp: Date;
  evidence: Record<string, unknown>;
  explanation: string;
}

// ============================================
// Configuration
// ============================================

export interface ClawFConfig {
  // Discovery
  minLiquidity: number;           // default $10,000
  minConditionsToPass: number;    // default 3 of 5
  volumeSpikeThreshold: number;   // default 2x baseline
  buyPressureThreshold: number;   // default 0.6 (60% buys)
  
  // Exit
  profitTargets: number[];        // default [2, 5, 10]
  trailingStopPercent: number;    // default 25%
  trailingStopActivation: number; // default 2x
  liquidityDropThreshold: number; // default 40%
  liquidityDropWindow: number;    // default 10 minutes
  
  // Wallet Intelligence
  oldWalletMinAge: number;        // default 6 months in seconds
  oldWalletMinTxns: number;       // default 100
  oldWalletMinContracts: number;  // default 20
  
  // Social
  socialSpikeThreshold: number;   // mentions per minute
  socialSpamThreshold: number;    // repeat poster ratio
  
  // Rate limits
  apiRateLimitPerMinute: number;
  cacheTimeSeconds: number;
}

export const DEFAULT_CONFIG: ClawFConfig = {
  minLiquidity: 10000,
  minConditionsToPass: 3,
  volumeSpikeThreshold: 2,
  buyPressureThreshold: 0.6,
  
  profitTargets: [2, 5, 10],
  trailingStopPercent: 25,
  trailingStopActivation: 2,
  liquidityDropThreshold: 40,
  liquidityDropWindow: 600, // 10 minutes
  
  oldWalletMinAge: 15552000, // 6 months
  oldWalletMinTxns: 100,
  oldWalletMinContracts: 20,
  
  socialSpikeThreshold: 5,
  socialSpamThreshold: 0.3,
  
  apiRateLimitPerMinute: 60,
  cacheTimeSeconds: 30,
};
