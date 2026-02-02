/**
 * ClawF Flag Detection System
 * 
 * Detects rug pulls and manipulation patterns with evidence.
 * 
 * HARD FLAGS (Critical - immediately concerning):
 * - Liquidity removed >= 80%
 * - Sell-restricted / honeypot suspected
 * - Trading disabled
 * - Extreme holder concentration (top10 >= 60% excluding LP)
 * 
 * SOFT FLAGS (Warnings - requires attention):
 * - Fee-on-transfer suspected
 * - Wash trading patterns
 * - Creator wallet rotating funds
 * - Excessive social hype without liquidity
 * - Bot heavy activity
 * - Rapid pump patterns
 */

import {
  TokenFlag,
  FlagType,
  FlagSeverity,
  TokenCandidate,
  SocialSignals,
  WalletIntelligence,
} from './types.js';

// ============================================
// Flag Detection Engine
// ============================================

export class FlagDetector {
  /**
   * Run all flag checks on a token
   */
  detectFlags(
    token: TokenCandidate,
    previousLiquidity?: number,
    socialSignals?: SocialSignals,
    walletIntelligence?: WalletIntelligence
  ): TokenFlag[] {
    const flags: TokenFlag[] = [];

    // HARD FLAGS
    flags.push(...this.checkLiquidityRemoval(token, previousLiquidity));
    flags.push(...this.checkHoneypot(token));
    flags.push(...this.checkTradingDisabled(token));
    flags.push(...this.checkConcentration(token));

    // SOFT FLAGS
    flags.push(...this.checkFeeOnTransfer(token));
    flags.push(...this.checkWashTrading(token));
    flags.push(...this.checkRapidPump(token));
    
    if (socialSignals) {
      flags.push(...this.checkHypeWithoutLiquidity(token, socialSignals));
    }
    
    if (walletIntelligence) {
      flags.push(...this.checkBotActivity(token, walletIntelligence));
    }

    return flags;
  }

  /**
   * HARD FLAG: Liquidity removed >= 80%
   */
  private checkLiquidityRemoval(
    token: TokenCandidate,
    previousLiquidity?: number
  ): TokenFlag[] {
    const flags: TokenFlag[] = [];

    if (!previousLiquidity || previousLiquidity <= 0) return flags;

    const dropPercent = ((previousLiquidity - token.liquidity) / previousLiquidity) * 100;

    if (dropPercent >= 80) {
      flags.push({
        type: 'LIQUIDITY_REMOVED',
        severity: 'hard',
        message: `Liquidity dropped ${dropPercent.toFixed(1)}% - likely rug pull`,
        evidence: {
          previousLiquidity,
          currentLiquidity: token.liquidity,
          dropPercent,
        },
        detectedAt: new Date(),
      });
    }

    return flags;
  }

  /**
   * HARD FLAG: Honeypot suspected (can't sell)
   */
  private checkHoneypot(token: TokenCandidate): TokenFlag[] {
    const flags: TokenFlag[] = [];
    const totalTxns = token.buys24h + token.sells24h;

    // If significant buys but almost no sells, honeypot suspected
    if (totalTxns > 50) {
      const sellRatio = token.sells24h / totalTxns;

      if (sellRatio < 0.05) {
        flags.push({
          type: 'HONEYPOT_SUSPECTED',
          severity: 'hard',
          message: `Only ${(sellRatio * 100).toFixed(1)}% of transactions are sells - likely cannot sell`,
          evidence: {
            totalTransactions: totalTxns,
            buys: token.buys24h,
            sells: token.sells24h,
            sellRatio,
          },
          detectedAt: new Date(),
        });
      } else if (sellRatio < 0.15) {
        flags.push({
          type: 'HONEYPOT_SUSPECTED',
          severity: 'soft',
          message: `Very low sell ratio (${(sellRatio * 100).toFixed(1)}%) - potential honeypot`,
          evidence: {
            totalTransactions: totalTxns,
            buys: token.buys24h,
            sells: token.sells24h,
            sellRatio,
          },
          detectedAt: new Date(),
        });
      }
    }

    return flags;
  }

  /**
   * HARD FLAG: Trading disabled (no activity)
   */
  private checkTradingDisabled(token: TokenCandidate): TokenFlag[] {
    const flags: TokenFlag[] = [];
    const totalTxns = token.buys24h + token.sells24h;

    // If token has liquidity and mcap but zero transactions
    if (token.liquidity > 1000 && token.fdv > 10000 && totalTxns === 0) {
      flags.push({
        type: 'TRADING_DISABLED',
        severity: 'hard',
        message: 'No transactions detected despite liquidity - trading may be disabled',
        evidence: {
          liquidity: token.liquidity,
          fdv: token.fdv,
          transactions: totalTxns,
        },
        detectedAt: new Date(),
      });
    }

    return flags;
  }

  /**
   * HARD FLAG: Extreme holder concentration
   * Note: This requires holder data which may not be available from all sources
   */
  private checkConcentration(token: TokenCandidate): TokenFlag[] {
    const flags: TokenFlag[] = [];

    // Check if we have holder concentration data
    // This would typically come from on-chain analysis
    // For now, we use liquidity ratio as a proxy

    const liqToMcapRatio = token.fdv > 0 ? (token.liquidity / token.fdv) * 100 : 0;

    // If liquidity is < 2% of mcap, concentration is likely extreme
    if (liqToMcapRatio < 2 && token.fdv > 100000) {
      flags.push({
        type: 'EXTREME_CONCENTRATION',
        severity: 'hard',
        message: `Liquidity only ${liqToMcapRatio.toFixed(1)}% of mcap - likely extreme holder concentration`,
        evidence: {
          liquidity: token.liquidity,
          fdv: token.fdv,
          liqToMcapRatio,
          implication: 'Few wallets control most supply, easy to dump',
        },
        detectedAt: new Date(),
      });
    }

    return flags;
  }

  /**
   * SOFT FLAG: Fee-on-transfer suspected
   */
  private checkFeeOnTransfer(token: TokenCandidate): TokenFlag[] {
    const flags: TokenFlag[] = [];

    // Heuristic: If price drops significantly on sells relative to buys,
    // might indicate transfer fees
    // This requires more detailed trade data for accurate detection

    // Placeholder check based on unusual volume patterns
    if (token.volume24h > 0 && token.liquidity > 0) {
      const turnover = token.volume24h / token.liquidity;
      
      // Extremely high turnover with price drop could indicate fees
      if (turnover > 50 && token.priceChange24h < -20) {
        flags.push({
          type: 'FEE_ON_TRANSFER',
          severity: 'soft',
          message: 'High volume with price drop - possible transfer fees',
          evidence: {
            turnover,
            priceChange24h: token.priceChange24h,
            volume24h: token.volume24h,
            liquidity: token.liquidity,
          },
          detectedAt: new Date(),
        });
      }
    }

    return flags;
  }

  /**
   * SOFT FLAG: Wash trading patterns
   */
  private checkWashTrading(token: TokenCandidate): TokenFlag[] {
    const flags: TokenFlag[] = [];
    const totalTxns = token.buys24h + token.sells24h;

    // Wash trading indicators:
    // - High transaction count but few unique wallets
    // - Buy/sell ratio very close to 50/50
    // - Volume very high relative to liquidity

    if (totalTxns > 100) {
      const buyRatio = token.buys24h / totalTxns;
      const turnover = token.liquidity > 0 ? token.volume24h / token.liquidity : 0;

      // Suspiciously balanced buy/sell with high turnover
      if (buyRatio > 0.48 && buyRatio < 0.52 && turnover > 20) {
        flags.push({
          type: 'WASH_TRADING',
          severity: 'soft',
          message: 'Suspiciously balanced trading with extreme turnover - possible wash trading',
          evidence: {
            buyRatio,
            turnover,
            totalTransactions: totalTxns,
            pattern: 'Near 50/50 buy/sell ratio is unnatural in real markets',
          },
          detectedAt: new Date(),
        });
      }
    }

    return flags;
  }

  /**
   * SOFT FLAG: Rapid pump pattern
   */
  private checkRapidPump(token: TokenCandidate): TokenFlag[] {
    const flags: TokenFlag[] = [];

    // Extreme price increase in short time
    if (token.priceChange1h > 500) {
      flags.push({
        type: 'RAPID_PUMP',
        severity: 'soft',
        message: `Price increased ${token.priceChange1h.toFixed(0)}% in 1 hour - pump & dump risk`,
        evidence: {
          priceChange1h: token.priceChange1h,
          priceChange24h: token.priceChange24h,
          warning: 'Extreme pumps often precede dumps',
        },
        detectedAt: new Date(),
      });
    } else if (token.priceChange1h > 200) {
      flags.push({
        type: 'RAPID_PUMP',
        severity: 'soft',
        message: `Significant pump (+${token.priceChange1h.toFixed(0)}% 1h) - watch for reversal`,
        evidence: {
          priceChange1h: token.priceChange1h,
          priceChange24h: token.priceChange24h,
        },
        detectedAt: new Date(),
      });
    }

    return flags;
  }

  /**
   * SOFT FLAG: Excessive social hype without liquidity support
   */
  private checkHypeWithoutLiquidity(
    token: TokenCandidate,
    social: SocialSignals
  ): TokenFlag[] {
    const flags: TokenFlag[] = [];

    // High social velocity but low liquidity
    if (social.mentionVelocity > 10 && token.liquidity < 10000) {
      flags.push({
        type: 'HYPE_NO_LIQUIDITY',
        severity: 'soft',
        message: `High social hype (${social.mentionVelocity} mentions/min) but only $${token.liquidity.toLocaleString()} liquidity`,
        evidence: {
          mentionVelocity: social.mentionVelocity,
          mentionCount: social.mentionCount,
          spikeDetected: social.spikeDetected,
          liquidity: token.liquidity,
          risk: 'Social pump without liquidity often leads to rug',
        },
        detectedAt: new Date(),
      });
    }

    // High spam score with spike
    if (social.spikeDetected && social.spamScore > 50) {
      flags.push({
        type: 'HYPE_NO_LIQUIDITY',
        severity: 'soft',
        message: `Social spike detected with high spam score (${social.spamScore})`,
        evidence: {
          spikeDetected: social.spikeDetected,
          spamScore: social.spamScore,
          repeatPostersRatio: social.repeatPostersRatio,
          warning: 'Coordinated shilling detected',
        },
        detectedAt: new Date(),
      });
    }

    return flags;
  }

  /**
   * SOFT FLAG: Bot heavy activity
   */
  private checkBotActivity(
    token: TokenCandidate,
    wallet: WalletIntelligence
  ): TokenFlag[] {
    const flags: TokenFlag[] = [];

    // High volume but no established/profitable wallets
    if (
      wallet.totalBuyers > 50 &&
      wallet.oldWalletCount === 0 &&
      wallet.profitableWalletCount === 0 &&
      token.volume24h > 50000
    ) {
      flags.push({
        type: 'BOT_HEAVY_ACTIVITY',
        severity: 'soft',
        message: `High volume ($${token.volume24h.toLocaleString()}) but 0 established wallets - likely bot activity`,
        evidence: {
          totalBuyers: wallet.totalBuyers,
          oldWalletCount: wallet.oldWalletCount,
          profitableWalletCount: wallet.profitableWalletCount,
          volume24h: token.volume24h,
          implication: 'Volume may be artificial, real demand uncertain',
        },
        detectedAt: new Date(),
      });
    }

    return flags;
  }

  /**
   * Count flags by severity
   */
  countBySeverity(flags: TokenFlag[]): { hard: number; soft: number } {
    return {
      hard: flags.filter(f => f.severity === 'hard').length,
      soft: flags.filter(f => f.severity === 'soft').length,
    };
  }

  /**
   * Check if token has any hard flags
   */
  hasHardFlag(flags: TokenFlag[]): boolean {
    return flags.some(f => f.severity === 'hard');
  }

  /**
   * Get summary of all flags
   */
  summarizeFlags(flags: TokenFlag[]): string {
    if (flags.length === 0) {
      return 'No flags detected';
    }

    const hardFlags = flags.filter(f => f.severity === 'hard');
    const softFlags = flags.filter(f => f.severity === 'soft');

    const parts: string[] = [];

    if (hardFlags.length > 0) {
      parts.push(`🚨 ${hardFlags.length} critical flag(s): ${hardFlags.map(f => f.type).join(', ')}`);
    }

    if (softFlags.length > 0) {
      parts.push(`⚠️ ${softFlags.length} warning(s): ${softFlags.map(f => f.type).join(', ')}`);
    }

    return parts.join(' | ');
  }
}
