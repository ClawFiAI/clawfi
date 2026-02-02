/**
 * ClawF Explanation Engine
 * 
 * Generates human-readable explanations for:
 * - Why a token is ranked
 * - Risk flag explanations
 * - Exit decision reasoning
 * 
 * RULES:
 * - Must reference computed metrics ONLY
 * - Must NOT invent data
 * - If data is missing → explicitly say "unknown"
 * - Do NOT mention any AI provider or model name
 */

import {
  TokenCandidate,
  DiscoveryResult,
  TrackedPosition,
  ExitSignal,
  TokenFlag,
  TokenScores,
} from './types.js';

// ============================================
// Explanation Engine
// ============================================

export class ExplanationEngine {
  /**
   * Explain why a token qualifies as a candidate
   */
  explainCandidate(result: DiscoveryResult): string {
    const { candidate, conditions, conditionsPassed, conditionsTotal, qualifies } = result;
    const parts: string[] = [];

    // Header
    parts.push(`## ${candidate.symbol} (${candidate.chain.toUpperCase()})`);
    parts.push('');

    // Qualification status
    if (qualifies) {
      parts.push(`✅ **QUALIFIED** - Passed ${conditionsPassed}/${conditionsTotal} conditions`);
    } else {
      parts.push(`❌ **DID NOT QUALIFY** - Only ${conditionsPassed}/${conditionsTotal} conditions passed`);
    }
    parts.push('');

    // Scores
    parts.push(`### Scores`);
    parts.push(this.explainScores(candidate.scores));
    parts.push('');

    // Conditions breakdown
    parts.push(`### Conditions`);
    for (const condition of conditions) {
      const icon = condition.passed ? '✅' : '❌';
      parts.push(`${icon} **${condition.name}**: ${condition.evidence}`);
    }
    parts.push('');

    // Signals
    if (candidate.signals.length > 0) {
      parts.push(`### Signals`);
      for (const signal of candidate.signals) {
        parts.push(`- ${signal}`);
      }
      parts.push('');
    }

    // Flags
    if (candidate.flags.length > 0) {
      parts.push(`### Flags`);
      parts.push(this.explainFlags(candidate.flags));
    }

    return parts.join('\n');
  }

  /**
   * Explain token scores
   */
  explainScores(scores: TokenScores): string {
    const parts: string[] = [];

    parts.push(`- **Momentum**: ${scores.momentum}/100 ${this.scoreEmoji(scores.momentum)}`);
    parts.push(`- **Liquidity**: ${scores.liquidity}/100 ${this.scoreEmoji(scores.liquidity)}`);
    parts.push(`- **Risk**: ${scores.risk}/100 ${this.riskEmoji(scores.risk)} (higher = safer)`);
    parts.push(`- **Confidence**: ${scores.confidence}/100 ${this.scoreEmoji(scores.confidence)}`);
    parts.push(`- **Composite**: ${scores.composite}/100`);

    return parts.join('\n');
  }

  /**
   * Explain flags in detail
   */
  explainFlags(flags: TokenFlag[]): string {
    if (flags.length === 0) {
      return 'No flags detected.';
    }

    const parts: string[] = [];
    const hardFlags = flags.filter(f => f.severity === 'hard');
    const softFlags = flags.filter(f => f.severity === 'soft');

    if (hardFlags.length > 0) {
      parts.push('**🚨 Critical Flags:**');
      for (const flag of hardFlags) {
        parts.push(`- **${flag.type}**: ${flag.message}`);
        parts.push(`  Evidence: ${JSON.stringify(flag.evidence)}`);
      }
    }

    if (softFlags.length > 0) {
      parts.push('**⚠️ Warnings:**');
      for (const flag of softFlags) {
        parts.push(`- **${flag.type}**: ${flag.message}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Explain exit signal
   */
  explainExitSignal(signal: ExitSignal): string {
    const parts: string[] = [];

    // Signal type with emoji
    const signalEmoji = {
      HOLD: '⏸️',
      TRIM: '✂️',
      EXIT: '🚪',
    };

    parts.push(`${signalEmoji[signal.signal]} **${signal.signal}** (${signal.confidence} confidence)`);
    parts.push('');
    parts.push(`**Reason**: ${signal.reason}`);
    parts.push('');
    parts.push(`**Explanation**: ${signal.explanation}`);
    parts.push('');

    // Evidence breakdown
    if (Object.keys(signal.evidence).length > 0) {
      parts.push('**Evidence**:');
      for (const [key, value] of Object.entries(signal.evidence)) {
        parts.push(`- ${this.formatKey(key)}: ${this.formatValue(value)}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Explain a tracked position
   */
  explainPosition(position: TrackedPosition): string {
    const parts: string[] = [];
    const token = position.token;

    // Header
    parts.push(`## Position: ${token.symbol} (${token.chain.toUpperCase()})`);
    parts.push('');

    // Status
    const statusEmoji = {
      active: '🟢',
      trimmed: '🟡',
      exited: '🔴',
      rugged: '💀',
    };
    parts.push(`**Status**: ${statusEmoji[position.status]} ${position.status.toUpperCase()}`);
    parts.push('');

    // Performance
    parts.push('### Performance');
    parts.push(`- Entry Price: $${position.entryPrice.toFixed(8)}`);
    parts.push(`- Current Price: $${position.currentPrice.toFixed(8)}`);
    parts.push(`- Current Multiple: **${position.currentMultiple.toFixed(2)}x**`);
    parts.push(`- Peak Multiple: ${position.peakMultiple.toFixed(2)}x`);
    
    const pnlPercent = (position.currentMultiple - 1) * 100;
    const pnlEmoji = pnlPercent >= 0 ? '📈' : '📉';
    parts.push(`- P&L: ${pnlEmoji} ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%`);
    parts.push('');

    // Current signal
    parts.push('### Current Signal');
    parts.push(this.explainExitSignal(position.exitSignal));
    parts.push('');

    // Liquidity
    parts.push('### Liquidity');
    const liqChange = ((position.currentLiquidity - position.entryLiquidity) / position.entryLiquidity) * 100;
    parts.push(`- Entry: $${position.entryLiquidity.toLocaleString()}`);
    parts.push(`- Current: $${position.currentLiquidity.toLocaleString()} (${liqChange >= 0 ? '+' : ''}${liqChange.toFixed(1)}%)`);
    parts.push('');

    // Timestamps
    parts.push('### Timing');
    parts.push(`- Entered: ${position.entryTime.toISOString()}`);
    parts.push(`- Peak reached: ${position.peakTime.toISOString()}`);
    parts.push(`- Duration: ${this.formatDuration(Date.now() - position.entryTime.getTime())}`);

    return parts.join('\n');
  }

  /**
   * Generate brief summary for a candidate
   */
  briefSummary(candidate: TokenCandidate): string {
    const { scores, flags } = candidate;
    const hardFlags = flags.filter(f => f.severity === 'hard');
    
    if (hardFlags.length > 0) {
      return `⚠️ ${candidate.symbol}: Score ${scores.composite}/100 but has ${hardFlags.length} critical flag(s)`;
    }

    const riskLevel = scores.risk >= 70 ? 'Lower risk' : scores.risk >= 50 ? 'Medium risk' : 'Higher risk';
    
    return `${candidate.symbol}: Score ${scores.composite}/100 | Momentum ${scores.momentum} | ${riskLevel}`;
  }

  /**
   * Generate radar summary (multiple candidates)
   */
  radarSummary(results: DiscoveryResult[]): string {
    if (results.length === 0) {
      return '🔍 No candidates found matching criteria.';
    }

    const parts: string[] = [];
    parts.push(`# ClawF Radar - ${results.length} Candidate(s)`);
    parts.push('');
    parts.push(`*Scanned at ${new Date().toISOString()}*`);
    parts.push('');

    for (let i = 0; i < Math.min(results.length, 10); i++) {
      const result = results[i];
      const c = result.candidate;
      const rank = i + 1;

      parts.push(`### ${rank}. ${c.symbol} (${c.chain})`);
      parts.push(`- **Score**: ${c.scores.composite}/100`);
      parts.push(`- **Price**: $${c.priceUsd.toFixed(8)} (${c.priceChange1h >= 0 ? '+' : ''}${c.priceChange1h.toFixed(1)}% 1h)`);
      parts.push(`- **MCap**: $${this.formatNumber(c.fdv)}`);
      parts.push(`- **Liquidity**: $${this.formatNumber(c.liquidity)}`);
      parts.push(`- **Volume**: $${this.formatNumber(c.volume24h)}`);
      parts.push(`- **Conditions**: ${result.conditionsPassed}/${result.conditionsTotal} passed`);
      
      if (c.flags.length > 0) {
        const hardCount = c.flags.filter(f => f.severity === 'hard').length;
        const softCount = c.flags.filter(f => f.severity === 'soft').length;
        parts.push(`- **Flags**: ${hardCount} critical, ${softCount} warning`);
      }
      
      parts.push('');
    }

    // Disclaimer
    parts.push('---');
    parts.push('*Scores are computed from market data. Higher risk scores = safer. Always DYOR.*');

    return parts.join('\n');
  }

  /**
   * Helper: Score emoji
   */
  private scoreEmoji(score: number): string {
    if (score >= 80) return '🟢';
    if (score >= 60) return '🟡';
    if (score >= 40) return '🟠';
    return '🔴';
  }

  /**
   * Helper: Risk emoji (inverted - higher is safer)
   */
  private riskEmoji(risk: number): string {
    if (risk >= 70) return '🟢';
    if (risk >= 50) return '🟡';
    if (risk >= 30) return '🟠';
    return '🔴';
  }

  /**
   * Helper: Format camelCase key to readable
   */
  private formatKey(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
  }

  /**
   * Helper: Format value for display
   */
  private formatValue(value: unknown): string {
    if (typeof value === 'number') {
      if (value > 1000000) return `$${(value / 1000000).toFixed(2)}M`;
      if (value > 1000) return `$${(value / 1000).toFixed(2)}K`;
      if (value < 0.01) return value.toExponential(2);
      return value.toFixed(2);
    }
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }

  /**
   * Helper: Format large numbers
   */
  private formatNumber(num: number): string {
    if (num >= 1000000000) return `${(num / 1000000000).toFixed(2)}B`;
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(2);
  }

  /**
   * Helper: Format duration
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }
}
