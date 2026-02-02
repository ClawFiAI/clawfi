/**
 * ClawF - Core Intelligence Agent
 * 
 * The main orchestrator that powers the ClawFi ecosystem.
 * 
 * ClawF is an always-on crypto intelligence agent that:
 * - Scans live market data to detect high-momentum tokens
 * - Quantifies risk with evidence-based flags
 * - Analyzes wallet participation
 * - Manages exits using deterministic rules
 * - Explains all decisions transparently
 */

import {
  TokenCandidate,
  DiscoveryResult,
  TrackedPosition,
  ExitSignal,
  SupportedChain,
  SUPPORTED_CHAINS,
  ClawFConfig,
  DEFAULT_CONFIG,
  SocialSignals,
  WalletIntelligence,
} from './types.js';

import { DiscoveryEngine } from './discovery.js';
import { SocialSignalAnalyzer } from './social.js';
import { WalletIntelligenceModule } from './wallet.js';
import { FlagDetector } from './flags.js';
import { PositionTracker } from './positions.js';
import { ExplanationEngine } from './explainer.js';

// Re-export types
export * from './types.js';

// ============================================
// ClawF Main Class
// ============================================

export class ClawF {
  private config: ClawFConfig;
  
  // Modules
  private discovery: DiscoveryEngine;
  private social: SocialSignalAnalyzer;
  private wallet: WalletIntelligenceModule;
  private flags: FlagDetector;
  private positions: PositionTracker;
  private explainer: ExplanationEngine;

  // State
  private isRunning: boolean = false;
  private scanInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<ClawFConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize all modules
    this.discovery = new DiscoveryEngine(this.config);
    this.social = new SocialSignalAnalyzer(this.config);
    this.wallet = new WalletIntelligenceModule(this.config);
    this.flags = new FlagDetector();
    this.positions = new PositionTracker(this.config);
    this.explainer = new ExplanationEngine();

    console.log('🦀 ClawF Intelligence Agent initialized');
  }

  // ============================================
  // Discovery Commands
  // ============================================

  /**
   * Scan for moonshot candidates (radar command)
   */
  async radar(options?: {
    chains?: SupportedChain[];
    limit?: number;
    includeSocial?: boolean;
    includeWallet?: boolean;
  }): Promise<{
    results: DiscoveryResult[];
    summary: string;
  }> {
    const chains = options?.chains || SUPPORTED_CHAINS;
    const limit = options?.limit || 10;

    console.log(`🔍 ClawF radar scanning ${chains.join(', ')}...`);

    // Run discovery
    const results = await this.discovery.scan({ chains, limit: limit * 2 });

    // Enrich with social signals if requested
    if (options?.includeSocial && this.social.isAvailable()) {
      for (const result of results) {
        result.candidate.socialSignals = await this.social.analyzeToken(result.candidate.address);
      }
    }

    // Detect flags for all candidates
    for (const result of results) {
      result.candidate.flags = this.flags.detectFlags(
        result.candidate,
        undefined,
        result.candidate.socialSignals
      );
      
      // Recalculate scores with flags
      // (Flags affect risk score)
    }

    // Sort by composite score and take top
    const topResults = results
      .filter(r => !this.flags.hasHardFlag(r.candidate.flags))
      .slice(0, limit);

    // Generate summary
    const summary = this.explainer.radarSummary(topResults);

    return { results: topResults, summary };
  }

  /**
   * Analyze a specific token
   */
  async analyze(
    address: string,
    chain?: SupportedChain
  ): Promise<{
    result: DiscoveryResult | null;
    explanation: string;
  }> {
    console.log(`🔬 ClawF analyzing ${address}...`);

    const result = await this.discovery.analyzeToken(address, chain);
    
    if (!result) {
      return {
        result: null,
        explanation: `❌ Could not fetch data for ${address}. Token may not exist or have no DEX pair.`,
      };
    }

    // Enrich with social signals
    if (this.social.isAvailable()) {
      result.candidate.socialSignals = await this.social.analyzeToken(address);
    }

    // Detect flags
    result.candidate.flags = this.flags.detectFlags(
      result.candidate,
      undefined,
      result.candidate.socialSignals
    );

    // Generate explanation
    const explanation = this.explainer.explainCandidate(result);

    return { result, explanation };
  }

  /**
   * 100x GEM HUNTER - Scan for ultra-early tokens with 100x potential
   * Focuses on: ultra-low mcap, fresh launches, viral activity, strong buy pressure
   */
  async scanGems(options?: {
    chains?: SupportedChain[];
    limit?: number;
  }): Promise<DiscoveryResult[]> {
    const chains = options?.chains || ['solana', 'base'] as SupportedChain[];
    const limit = options?.limit || 15;

    console.log(`💎 ClawF GEM HUNTER scanning ${chains.join(', ')} for 100x opportunities...`);

    // Run specialized gem scan
    const results = await this.discovery.scanGems({ chains, limit: limit * 2 });

    // Detect flags for all candidates
    for (const result of results) {
      result.candidate.flags = this.flags.detectFlags(
        result.candidate,
        undefined,
        result.candidate.socialSignals
      );
    }

    // Filter out hard flags and return top gems
    return results
      .filter(r => !this.flags.hasHardFlag(r.candidate.flags))
      .slice(0, limit);
  }

  // ============================================
  // Position Tracking Commands
  // ============================================

  /**
   * Track a token (add to watchlist)
   */
  async track(address: string, chain?: SupportedChain): Promise<{
    position: TrackedPosition | null;
    message: string;
  }> {
    // First analyze the token
    const { result } = await this.analyze(address, chain);
    
    if (!result) {
      return {
        position: null,
        message: `❌ Cannot track ${address} - token data not found`,
      };
    }

    // Start tracking
    const position = this.positions.track(result.candidate);

    return {
      position,
      message: `📍 Now tracking ${result.candidate.symbol} at $${result.candidate.priceUsd}`,
    };
  }

  /**
   * Get all tracked positions
   */
  async getPositions(): Promise<{
    positions: TrackedPosition[];
    summary: string;
  }> {
    const positions = this.positions.getActivePositions();

    // Update each position with current data
    const updatedPositions: TrackedPosition[] = [];
    
    for (const pos of positions) {
      const { result } = await this.analyze(pos.token.address, pos.token.chain);
      
      if (result) {
        await this.positions.update(result.candidate);
        const updated = this.positions.getPosition(pos.id);
        if (updated) updatedPositions.push(updated);
      }
    }

    // Generate summary
    const summaryParts = [`## Tracked Positions (${updatedPositions.length})`, ''];
    
    for (const pos of updatedPositions) {
      summaryParts.push(this.positions.getPositionSummary(pos));
    }

    return {
      positions: updatedPositions,
      summary: summaryParts.join('\n'),
    };
  }

  /**
   * Check exit signals for all positions
   */
  async checkExits(): Promise<{
    signals: Array<{ position: TrackedPosition; signal: ExitSignal }>;
    summary: string;
  }> {
    const positions = this.positions.getActivePositions();
    const signals: Array<{ position: TrackedPosition; signal: ExitSignal }> = [];

    for (const pos of positions) {
      const { result } = await this.analyze(pos.token.address, pos.token.chain);
      
      if (result) {
        const exitSignal = await this.positions.update(result.candidate);
        
        if (exitSignal && exitSignal.signal !== 'HOLD') {
          signals.push({
            position: this.positions.getPosition(pos.id)!,
            signal: exitSignal,
          });
        }
      }
    }

    // Generate summary
    const summaryParts = [`## Exit Signals (${signals.length})`, ''];
    
    for (const { position, signal } of signals) {
      summaryParts.push(`### ${position.token.symbol}`);
      summaryParts.push(this.explainer.explainExitSignal(signal));
      summaryParts.push('');
    }

    if (signals.length === 0) {
      summaryParts.push('No exit signals triggered. All positions: HOLD');
    }

    return {
      signals,
      summary: summaryParts.join('\n'),
    };
  }

  // ============================================
  // Policy & Configuration
  // ============================================

  /**
   * Get current policy/configuration
   */
  getPolicy(): {
    config: ClawFConfig;
    summary: string;
  } {
    const parts = [
      '## ClawF Policy',
      '',
      '### Discovery',
      `- Min Liquidity: $${this.config.minLiquidity.toLocaleString()}`,
      `- Min Conditions: ${this.config.minConditionsToPass} of 5`,
      `- Volume Spike Threshold: ${this.config.volumeSpikeThreshold}x baseline`,
      `- Buy Pressure Threshold: ${this.config.buyPressureThreshold * 100}%`,
      '',
      '### Exit Triggers',
      `- Profit Targets: ${this.config.profitTargets.map(t => `${t}x`).join(', ')}`,
      `- Trailing Stop: ${this.config.trailingStopPercent}% from peak (after ${this.config.trailingStopActivation}x)`,
      `- Liquidity Drop: ${this.config.liquidityDropThreshold}% in ${this.config.liquidityDropWindow / 60} minutes`,
      '',
      '### Wallet Classification',
      `- Old Wallet: >= ${this.config.oldWalletMinAge / 2592000} months OR ${this.config.oldWalletMinTxns}+ txns OR ${this.config.oldWalletMinContracts}+ contracts`,
      '',
      '### Rate Limits',
      `- API Rate: ${this.config.apiRateLimitPerMinute}/min`,
      `- Cache: ${this.config.cacheTimeSeconds}s`,
    ];

    return {
      config: this.config,
      summary: parts.join('\n'),
    };
  }

  /**
   * Update policy
   */
  updatePolicy(updates: Partial<ClawFConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Reinitialize modules with new config
    this.discovery = new DiscoveryEngine(this.config);
    this.social = new SocialSignalAnalyzer(this.config);
    this.wallet = new WalletIntelligenceModule(this.config);
    this.positions = new PositionTracker(this.config);

    console.log('📋 ClawF policy updated');
  }

  // ============================================
  // Continuous Monitoring
  // ============================================

  /**
   * Start continuous radar scanning
   */
  startContinuousRadar(intervalMs: number = 60000): void {
    if (this.isRunning) {
      console.log('⚠️ ClawF radar already running');
      return;
    }

    this.isRunning = true;
    console.log(`🚀 ClawF continuous radar started (interval: ${intervalMs / 1000}s)`);

    const scan = async () => {
      try {
        const { results, summary } = await this.radar({ limit: 5 });
        console.log(`📡 Radar scan complete: ${results.length} candidates`);
        
        // Also check exits
        await this.checkExits();
      } catch (error) {
        console.error('Radar scan error:', error);
      }
    };

    // Initial scan
    scan();

    // Schedule recurring scans
    this.scanInterval = setInterval(scan, intervalMs);
  }

  /**
   * Stop continuous radar
   */
  stopContinuousRadar(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 ClawF continuous radar stopped');
  }

  // ============================================
  // Status
  // ============================================

  /**
   * Get ClawF status
   */
  getStatus(): {
    running: boolean;
    trackedPositions: number;
    activePositions: number;
    socialAvailable: boolean;
    supportedChains: SupportedChain[];
  } {
    return {
      running: this.isRunning,
      trackedPositions: this.positions.getPositions().length,
      activePositions: this.positions.getActivePositions().length,
      socialAvailable: this.social.isAvailable(),
      supportedChains: SUPPORTED_CHAINS,
    };
  }
}

// ============================================
// Singleton Instance
// ============================================

let clawfInstance: ClawF | null = null;

export function getClawF(config?: Partial<ClawFConfig>): ClawF {
  if (!clawfInstance) {
    clawfInstance = new ClawF(config);
  }
  return clawfInstance;
}

// ============================================
// Export Modules for Direct Access
// ============================================

export {
  DiscoveryEngine,
  SocialSignalAnalyzer,
  WalletIntelligenceModule,
  FlagDetector,
  PositionTracker,
  ExplanationEngine,
};
