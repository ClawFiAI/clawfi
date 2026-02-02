/**
 * ClawF Position Tracker & Exit Engine
 * 
 * Tracks positions and emits exit signals based on deterministic rules.
 * 
 * EXIT TRIGGERS:
 * - Profit targets: 2x, 5x, 10x
 * - Trailing stop: -25% from peak after >= 2x
 * - Liquidity drop: -40% within 10 minutes
 * - Momentum reversal: volume down, sell pressure up, buyer growth stalls
 * - Smart money exit: old/profitable wallets reducing exposure
 * - Hard flag detected
 * 
 * SIGNALS: HOLD, TRIM, EXIT
 */

import {
  TrackedPosition,
  ExitSignal,
  ExitSignalType,
  ExitTriggerReason,
  TokenCandidate,
  WalletIntelligence,
  ClawFConfig,
  DEFAULT_CONFIG,
  TokenFlag,
} from './types.js';
import { FlagDetector } from './flags.js';

// ============================================
// Position Store
// ============================================

const positions: Map<string, TrackedPosition> = new Map();
const liquidityHistory: Map<string, { liquidity: number; timestamp: number }[]> = new Map();
const walletHistory: Map<string, WalletIntelligence[]> = new Map();

// ============================================
// Position Tracker
// ============================================

export class PositionTracker {
  private config: ClawFConfig;
  private flagDetector: FlagDetector;

  constructor(config: Partial<ClawFConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.flagDetector = new FlagDetector();
  }

  /**
   * Start tracking a new position
   */
  track(token: TokenCandidate): TrackedPosition {
    const id = `${token.chain}-${token.address}`;

    const position: TrackedPosition = {
      id,
      token,
      entryPrice: token.priceUsd,
      entryTime: new Date(),
      entryLiquidity: token.liquidity,
      currentPrice: token.priceUsd,
      currentLiquidity: token.liquidity,
      currentMultiple: 1,
      peakPrice: token.priceUsd,
      peakMultiple: 1,
      peakTime: new Date(),
      exitSignal: {
        signal: 'HOLD',
        reason: 'MANUAL',
        confidence: 'medium',
        timestamp: new Date(),
        evidence: {},
        explanation: 'Position just opened',
      },
      exitHistory: [],
      status: 'active',
    };

    positions.set(id, position);
    
    // Initialize liquidity history
    liquidityHistory.set(id, [{
      liquidity: token.liquidity,
      timestamp: Date.now(),
    }]);

    console.log(`📍 Tracking ${token.symbol} at $${token.priceUsd}`);
    
    return position;
  }

  /**
   * Update a tracked position with new data
   */
  async update(
    token: TokenCandidate,
    walletIntel?: WalletIntelligence
  ): Promise<ExitSignal | null> {
    const id = `${token.chain}-${token.address}`;
    const position = positions.get(id);

    if (!position || position.status !== 'active') {
      return null;
    }

    // Update current values
    position.currentPrice = token.priceUsd;
    position.currentLiquidity = token.liquidity;
    position.currentMultiple = token.priceUsd / position.entryPrice;
    position.token = token;

    // Update peak tracking
    if (position.currentMultiple > position.peakMultiple) {
      position.peakPrice = token.priceUsd;
      position.peakMultiple = position.currentMultiple;
      position.peakTime = new Date();
    }

    // Update liquidity history
    this.updateLiquidityHistory(id, token.liquidity);

    // Update wallet history
    if (walletIntel) {
      this.updateWalletHistory(id, walletIntel);
    }

    // Run exit checks
    const exitSignal = await this.checkExitTriggers(position, walletIntel);

    if (exitSignal) {
      position.exitSignal = exitSignal;
      position.exitHistory.push(exitSignal);

      if (exitSignal.signal === 'EXIT') {
        position.status = 'exited';
      } else if (exitSignal.signal === 'TRIM') {
        position.status = 'trimmed';
      }
    }

    return exitSignal;
  }

  /**
   * Check all exit triggers for a position
   */
  private async checkExitTriggers(
    position: TrackedPosition,
    walletIntel?: WalletIntelligence
  ): Promise<ExitSignal | null> {
    const signals: ExitSignal[] = [];

    // CHECK 1: Profit targets
    const profitSignal = this.checkProfitTargets(position);
    if (profitSignal) signals.push(profitSignal);

    // CHECK 2: Trailing stop
    const trailingSignal = this.checkTrailingStop(position);
    if (trailingSignal) signals.push(trailingSignal);

    // CHECK 3: Liquidity drop
    const liquiditySignal = this.checkLiquidityDrop(position);
    if (liquiditySignal) signals.push(liquiditySignal);

    // CHECK 4: Momentum reversal
    const momentumSignal = this.checkMomentumReversal(position);
    if (momentumSignal) signals.push(momentumSignal);

    // CHECK 5: Smart money exit
    if (walletIntel) {
      const smartMoneySignal = this.checkSmartMoneyExit(position, walletIntel);
      if (smartMoneySignal) signals.push(smartMoneySignal);
    }

    // CHECK 6: Hard flags
    const flagSignal = this.checkHardFlags(position);
    if (flagSignal) signals.push(flagSignal);

    // Return highest priority signal
    if (signals.length === 0) {
      return null;
    }

    // Sort by priority: EXIT > TRIM > HOLD
    signals.sort((a, b) => {
      const priority = { EXIT: 3, TRIM: 2, HOLD: 1 };
      return priority[b.signal] - priority[a.signal];
    });

    return signals[0];
  }

  /**
   * CHECK 1: Profit target triggers
   */
  private checkProfitTargets(position: TrackedPosition): ExitSignal | null {
    const multiple = position.currentMultiple;

    // 10x target - strong EXIT signal
    if (multiple >= 10) {
      return {
        signal: 'EXIT',
        reason: 'PROFIT_TARGET_10X',
        confidence: 'high',
        timestamp: new Date(),
        evidence: {
          currentMultiple: multiple,
          entryPrice: position.entryPrice,
          currentPrice: position.currentPrice,
        },
        explanation: `🎯 10x target reached (${multiple.toFixed(1)}x). Taking profits is strongly recommended.`,
      };
    }

    // 5x target - TRIM signal
    if (multiple >= 5) {
      return {
        signal: 'TRIM',
        reason: 'PROFIT_TARGET_5X',
        confidence: 'high',
        timestamp: new Date(),
        evidence: {
          currentMultiple: multiple,
          entryPrice: position.entryPrice,
          currentPrice: position.currentPrice,
        },
        explanation: `🔥 5x target reached (${multiple.toFixed(1)}x). Consider taking partial profits.`,
      };
    }

    // 2x target - info only (HOLD with note)
    if (multiple >= 2 && !position.exitHistory.some(e => e.reason === 'PROFIT_TARGET_2X')) {
      return {
        signal: 'HOLD',
        reason: 'PROFIT_TARGET_2X',
        confidence: 'medium',
        timestamp: new Date(),
        evidence: {
          currentMultiple: multiple,
          entryPrice: position.entryPrice,
          currentPrice: position.currentPrice,
        },
        explanation: `🚀 2x reached (${multiple.toFixed(1)}x). You're in profit - watch for exit signals.`,
      };
    }

    return null;
  }

  /**
   * CHECK 2: Trailing stop trigger
   */
  private checkTrailingStop(position: TrackedPosition): ExitSignal | null {
    // Only activate trailing stop after hitting activation threshold
    if (position.peakMultiple < this.config.trailingStopActivation) {
      return null;
    }

    const dropFromPeak = ((position.peakMultiple - position.currentMultiple) / position.peakMultiple) * 100;

    if (dropFromPeak >= this.config.trailingStopPercent) {
      return {
        signal: 'EXIT',
        reason: 'TRAILING_STOP',
        confidence: 'high',
        timestamp: new Date(),
        evidence: {
          peakMultiple: position.peakMultiple,
          currentMultiple: position.currentMultiple,
          dropFromPeak,
          threshold: this.config.trailingStopPercent,
        },
        explanation: `📉 Trailing stop triggered. Dropped ${dropFromPeak.toFixed(0)}% from ${position.peakMultiple.toFixed(1)}x peak.`,
      };
    }

    // Warning if approaching trailing stop
    if (dropFromPeak >= this.config.trailingStopPercent * 0.6) {
      return {
        signal: 'TRIM',
        reason: 'TRAILING_STOP',
        confidence: 'medium',
        timestamp: new Date(),
        evidence: {
          peakMultiple: position.peakMultiple,
          currentMultiple: position.currentMultiple,
          dropFromPeak,
        },
        explanation: `⚠️ Approaching trailing stop. Down ${dropFromPeak.toFixed(0)}% from peak.`,
      };
    }

    return null;
  }

  /**
   * CHECK 3: Liquidity drop trigger
   */
  private checkLiquidityDrop(position: TrackedPosition): ExitSignal | null {
    const history = liquidityHistory.get(position.id) || [];
    
    if (history.length < 2) {
      return null;
    }

    // Check liquidity over last N minutes
    const windowMs = this.config.liquidityDropWindow * 1000;
    const cutoff = Date.now() - windowMs;
    const recentHistory = history.filter(h => h.timestamp >= cutoff);

    if (recentHistory.length < 2) {
      return null;
    }

    const startLiq = recentHistory[0].liquidity;
    const currentLiq = position.currentLiquidity;
    const dropPercent = startLiq > 0 ? ((startLiq - currentLiq) / startLiq) * 100 : 0;

    // Critical drop - EXIT
    if (dropPercent >= this.config.liquidityDropThreshold) {
      return {
        signal: 'EXIT',
        reason: 'LIQUIDITY_DROP',
        confidence: 'high',
        timestamp: new Date(),
        evidence: {
          startLiquidity: startLiq,
          currentLiquidity: currentLiq,
          dropPercent,
          timeWindowMinutes: this.config.liquidityDropWindow / 60,
        },
        explanation: `🚨 Liquidity dropped ${dropPercent.toFixed(0)}% in ${(this.config.liquidityDropWindow / 60).toFixed(0)} minutes. Exit immediately.`,
      };
    }

    // Warning drop - TRIM
    if (dropPercent >= this.config.liquidityDropThreshold * 0.5) {
      return {
        signal: 'TRIM',
        reason: 'LIQUIDITY_DROP',
        confidence: 'medium',
        timestamp: new Date(),
        evidence: {
          startLiquidity: startLiq,
          currentLiquidity: currentLiq,
          dropPercent,
        },
        explanation: `⚠️ Liquidity dropping (${dropPercent.toFixed(0)}%). Watch closely.`,
      };
    }

    return null;
  }

  /**
   * CHECK 4: Momentum reversal trigger
   */
  private checkMomentumReversal(position: TrackedPosition): ExitSignal | null {
    const token = position.token;
    const totalTxns = token.buys24h + token.sells24h;
    
    if (totalTxns < 50) {
      return null; // Not enough data
    }

    const buyRatio = token.buys24h / totalTxns;
    const volumeRatio = token.fdv > 0 ? token.volume24h / token.fdv : 0;

    // Momentum reversal indicators
    const reversalSignals: string[] = [];

    // Sell pressure increasing
    if (buyRatio < 0.4) {
      reversalSignals.push(`Sell pressure dominates (${(buyRatio * 100).toFixed(0)}% buys)`);
    }

    // Price dropping while volume staying high (distribution)
    if (token.priceChange1h < -15 && volumeRatio > 0.3) {
      reversalSignals.push(`Price dropping with volume (distribution)`);
    }

    // Strong negative momentum
    if (token.priceChange1h < -30) {
      reversalSignals.push(`Sharp price decline (${token.priceChange1h.toFixed(0)}% 1h)`);
    }

    if (reversalSignals.length >= 2) {
      return {
        signal: 'EXIT',
        reason: 'MOMENTUM_REVERSAL',
        confidence: 'high',
        timestamp: new Date(),
        evidence: {
          buyRatio,
          priceChange1h: token.priceChange1h,
          volumeRatio,
          signals: reversalSignals,
        },
        explanation: `📉 Momentum reversal detected: ${reversalSignals.join(', ')}`,
      };
    }

    if (reversalSignals.length === 1) {
      return {
        signal: 'TRIM',
        reason: 'MOMENTUM_REVERSAL',
        confidence: 'medium',
        timestamp: new Date(),
        evidence: {
          buyRatio,
          priceChange1h: token.priceChange1h,
          signals: reversalSignals,
        },
        explanation: `⚠️ Momentum warning: ${reversalSignals[0]}`,
      };
    }

    return null;
  }

  /**
   * CHECK 5: Smart money exit trigger
   */
  private checkSmartMoneyExit(
    position: TrackedPosition,
    currentIntel: WalletIntelligence
  ): ExitSignal | null {
    const history = walletHistory.get(position.id) || [];
    
    if (history.length < 2) {
      return null;
    }

    const previousIntel = history[history.length - 2];

    // Check if old/profitable wallets are reducing exposure
    const oldWalletDrop = previousIntel.oldWalletPercent - currentIntel.oldWalletPercent;
    const profitableWalletDrop = previousIntel.profitableWalletPercent - currentIntel.profitableWalletPercent;

    // Significant reduction in smart money
    if (oldWalletDrop > 20 || profitableWalletDrop > 20) {
      return {
        signal: 'TRIM',
        reason: 'SMART_MONEY_EXIT',
        confidence: 'medium',
        timestamp: new Date(),
        evidence: {
          oldWalletDropPercent: oldWalletDrop,
          profitableWalletDropPercent: profitableWalletDrop,
          currentOldWalletPercent: currentIntel.oldWalletPercent,
          currentProfitableWalletPercent: currentIntel.profitableWalletPercent,
        },
        explanation: `🐋 Smart money reducing exposure. Old wallets: -${oldWalletDrop.toFixed(0)}%, Profitable: -${profitableWalletDrop.toFixed(0)}%`,
      };
    }

    return null;
  }

  /**
   * CHECK 6: Hard flag trigger
   */
  private checkHardFlags(position: TrackedPosition): ExitSignal | null {
    const flags = position.token.flags || [];
    const hardFlags = flags.filter(f => f.severity === 'hard');

    if (hardFlags.length > 0) {
      return {
        signal: 'EXIT',
        reason: 'HARD_FLAG_DETECTED',
        confidence: 'high',
        timestamp: new Date(),
        evidence: {
          flags: hardFlags.map(f => ({
            type: f.type,
            message: f.message,
          })),
        },
        explanation: `🚨 Critical flag detected: ${hardFlags.map(f => f.message).join('; ')}`,
      };
    }

    return null;
  }

  /**
   * Update liquidity history for a position
   */
  private updateLiquidityHistory(id: string, liquidity: number): void {
    const history = liquidityHistory.get(id) || [];
    history.push({ liquidity, timestamp: Date.now() });

    // Keep last 30 minutes of data (assuming ~1 min updates)
    const cutoff = Date.now() - 1800000;
    const filtered = history.filter(h => h.timestamp >= cutoff);
    
    liquidityHistory.set(id, filtered);
  }

  /**
   * Update wallet history for a position
   */
  private updateWalletHistory(id: string, intel: WalletIntelligence): void {
    const history = walletHistory.get(id) || [];
    history.push(intel);

    // Keep last 10 readings
    if (history.length > 10) {
      history.shift();
    }

    walletHistory.set(id, history);
  }

  /**
   * Get all tracked positions
   */
  getPositions(): TrackedPosition[] {
    return Array.from(positions.values());
  }

  /**
   * Get active positions only
   */
  getActivePositions(): TrackedPosition[] {
    return Array.from(positions.values()).filter(p => p.status === 'active');
  }

  /**
   * Get a specific position
   */
  getPosition(id: string): TrackedPosition | undefined {
    return positions.get(id);
  }

  /**
   * Stop tracking a position
   */
  stopTracking(id: string): boolean {
    return positions.delete(id);
  }

  /**
   * Get position summary
   */
  getPositionSummary(position: TrackedPosition): string {
    const signal = position.exitSignal;
    const emoji = 
      position.status === 'exited' ? '🔴' :
      position.status === 'trimmed' ? '🟡' :
      position.currentMultiple >= 5 ? '🔥' :
      position.currentMultiple >= 2 ? '🚀' :
      position.currentMultiple >= 1 ? '📈' : '📉';

    return `${emoji} ${position.token.symbol}: ${position.currentMultiple.toFixed(2)}x (peak: ${position.peakMultiple.toFixed(2)}x) | ${signal.signal}: ${signal.explanation}`;
  }
}
