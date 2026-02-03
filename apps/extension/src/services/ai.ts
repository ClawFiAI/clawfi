/**
 * ClawFi AI Service
 * Provides AI-powered token analysis and commentary
 */

export interface TokenContext {
  address: string;
  chain: string;
  symbol?: string;
  name?: string;
  priceUsd?: number;
  priceChange24h?: number;
  priceChange1h?: number;
  volume24h?: number;
  liquidity?: number;
  marketCap?: number;
  txns24h?: { buys: number; sells: number };
  holders?: number;
  age?: number; // in hours
  riskScore?: number;
  riskLevel?: string;
  issues?: string[];
  honeypot?: boolean;
  liquidityLocked?: boolean;
  contractVerified?: boolean;
}

export interface AICommentary {
  summary: string;
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'caution';
  keyPoints: string[];
  riskWarning?: string;
  actionHint?: string;
}

const API_BASE = 'https://api.clawfi.ai';

/**
 * Generate AI commentary for a token based on its data
 */
export async function generateTokenCommentary(context: TokenContext): Promise<AICommentary> {
  try {
    // Try to get AI analysis from ClawFi API
    const response = await fetch(`${API_BASE}/ai/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(context),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.commentary) {
        return data.commentary;
      }
    }
  } catch (error) {
    console.log('[ClawFi AI] API unavailable, using local analysis');
  }

  // Fallback to local analysis
  return generateLocalCommentary(context);
}

/**
 * Local AI-like analysis when API is unavailable
 */
function generateLocalCommentary(context: TokenContext): AICommentary {
  const keyPoints: string[] = [];
  let sentiment: AICommentary['sentiment'] = 'neutral';
  let riskWarning: string | undefined;
  let actionHint: string | undefined;

  // Analyze price action
  if (context.priceChange24h !== undefined) {
    if (context.priceChange24h > 100) {
      keyPoints.push(`Massive pump: +${context.priceChange24h.toFixed(0)}% in 24h`);
      sentiment = 'caution';
      riskWarning = 'Extreme volatility detected. High risk of pullback.';
    } else if (context.priceChange24h > 50) {
      keyPoints.push(`Strong momentum: +${context.priceChange24h.toFixed(0)}% in 24h`);
      sentiment = 'bullish';
    } else if (context.priceChange24h > 10) {
      keyPoints.push(`Positive trend: +${context.priceChange24h.toFixed(1)}% in 24h`);
      sentiment = 'bullish';
    } else if (context.priceChange24h < -30) {
      keyPoints.push(`Heavy selling: ${context.priceChange24h.toFixed(0)}% in 24h`);
      sentiment = 'bearish';
      riskWarning = 'Significant downward pressure. Exercise caution.';
    } else if (context.priceChange24h < -10) {
      keyPoints.push(`Price declining: ${context.priceChange24h.toFixed(1)}% in 24h`);
      sentiment = 'bearish';
    }
  }

  // Analyze 1h momentum
  if (context.priceChange1h !== undefined) {
    if (context.priceChange1h > 20) {
      keyPoints.push(`Hot right now: +${context.priceChange1h.toFixed(0)}% in 1h`);
      if (sentiment !== 'caution') sentiment = 'bullish';
    } else if (context.priceChange1h < -15) {
      keyPoints.push(`Dumping: ${context.priceChange1h.toFixed(0)}% in 1h`);
      if (sentiment !== 'caution') sentiment = 'bearish';
    }
  }

  // Analyze liquidity
  if (context.liquidity !== undefined) {
    if (context.liquidity < 5000) {
      keyPoints.push('Micro liquidity: High slippage risk');
      riskWarning = (riskWarning || '') + ' Very low liquidity.';
      sentiment = 'caution';
    } else if (context.liquidity < 20000) {
      keyPoints.push('Low liquidity pool');
    } else if (context.liquidity > 500000) {
      keyPoints.push('Deep liquidity: Good for larger trades');
    }
  }

  // Analyze volume
  if (context.volume24h !== undefined && context.liquidity !== undefined) {
    const volumeToLiq = context.volume24h / context.liquidity;
    if (volumeToLiq > 5) {
      keyPoints.push('Very high volume relative to liquidity');
    } else if (volumeToLiq > 2) {
      keyPoints.push('Active trading volume');
    } else if (volumeToLiq < 0.1) {
      keyPoints.push('Low trading activity');
    }
  }

  // Analyze buy/sell ratio
  if (context.txns24h) {
    const { buys, sells } = context.txns24h;
    const total = buys + sells;
    if (total > 0) {
      const buyRatio = buys / total;
      if (buyRatio > 0.65) {
        keyPoints.push(`Strong buying pressure: ${(buyRatio * 100).toFixed(0)}% buys`);
      } else if (buyRatio < 0.35) {
        keyPoints.push(`Heavy selling: ${((1 - buyRatio) * 100).toFixed(0)}% sells`);
      }
    }
  }

  // Analyze token age
  if (context.age !== undefined) {
    if (context.age < 1) {
      keyPoints.push('Brand new token (<1 hour old)');
      riskWarning = (riskWarning || '') + ' Very new token, high risk.';
      sentiment = 'caution';
    } else if (context.age < 24) {
      keyPoints.push('Young token (<24 hours)');
    } else if (context.age > 720) { // 30 days
      keyPoints.push('Established token (30+ days)');
    }
  }

  // Analyze risk factors
  if (context.honeypot) {
    keyPoints.push('HONEYPOT DETECTED');
    riskWarning = 'CRITICAL: Honeypot detected. Do not buy!';
    sentiment = 'caution';
  }

  if (context.riskScore !== undefined) {
    if (context.riskScore > 70) {
      keyPoints.push(`High risk score: ${context.riskScore}/100`);
      sentiment = 'caution';
    } else if (context.riskScore < 30) {
      keyPoints.push(`Low risk score: ${context.riskScore}/100`);
    }
  }

  if (context.liquidityLocked === false) {
    keyPoints.push('Liquidity NOT locked');
    riskWarning = (riskWarning || '') + ' Rug pull risk: LP not locked.';
  } else if (context.liquidityLocked === true) {
    keyPoints.push('Liquidity locked');
  }

  if (context.contractVerified === false) {
    keyPoints.push('Contract not verified');
  }

  if (context.issues && context.issues.length > 0) {
    keyPoints.push(`${context.issues.length} security issue(s) found`);
  }

  // Generate summary
  let summary = '';
  const symbol = context.symbol || 'Token';

  switch (sentiment) {
    case 'bullish':
      summary = `${symbol} shows bullish momentum with positive indicators. `;
      actionHint = 'Consider entry if risk tolerance allows.';
      break;
    case 'bearish':
      summary = `${symbol} is under selling pressure. `;
      actionHint = 'Wait for stabilization before considering entry.';
      break;
    case 'caution':
      summary = `${symbol} has significant risk factors. `;
      actionHint = 'High risk. Only trade with what you can lose.';
      break;
    default:
      summary = `${symbol} shows mixed signals. `;
      actionHint = 'Do your own research before trading.';
  }

  if (keyPoints.length > 0) {
    summary += keyPoints.slice(0, 2).join('. ') + '.';
  }

  return {
    summary,
    sentiment,
    keyPoints: keyPoints.slice(0, 5),
    riskWarning: riskWarning?.trim(),
    actionHint,
  };
}

/**
 * Quick sentiment check for a token
 */
export function getQuickSentiment(context: Partial<TokenContext>): AICommentary['sentiment'] {
  if (context.honeypot) return 'caution';
  if (context.riskScore && context.riskScore > 70) return 'caution';
  if (context.priceChange24h && context.priceChange24h > 100) return 'caution';
  if (context.priceChange24h && context.priceChange24h > 20) return 'bullish';
  if (context.priceChange24h && context.priceChange24h < -20) return 'bearish';
  return 'neutral';
}

/**
 * Get a short AI comment for display
 */
export function getShortComment(context: Partial<TokenContext>): string {
  if (context.honeypot) return 'Honeypot detected! Do not buy.';
  if (context.riskScore && context.riskScore > 80) return 'Very high risk token. Be careful.';
  if (context.priceChange1h && context.priceChange1h > 50) return 'Pumping hard! Watch for reversal.';
  if (context.priceChange1h && context.priceChange1h < -30) return 'Dumping. Wait for bottom.';
  if (context.priceChange24h && context.priceChange24h > 100) return 'Major pump. High volatility expected.';
  if (context.liquidity && context.liquidity < 10000) return 'Low liquidity. High slippage risk.';
  if (context.txns24h) {
    const ratio = context.txns24h.buys / (context.txns24h.buys + context.txns24h.sells);
    if (ratio > 0.7) return 'Strong buy pressure detected.';
    if (ratio < 0.3) return 'Heavy selling. Exercise caution.';
  }
  return 'Analyzing token metrics...';
}

/**
 * AI Chat response interface
 */
export interface AIChatResponse {
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  recommendation: 'buy' | 'hold' | 'avoid' | 'dyor';
  reasoning: string[];
}

/**
 * Pre-defined questions users can ask
 */
export const QUICK_QUESTIONS = [
  { id: 'should_buy', label: 'Should I buy this?', icon: '💰' },
  { id: 'is_safe', label: 'Is this safe?', icon: '🛡️' },
  { id: 'rug_risk', label: 'Rug pull risk?', icon: '🚨' },
  { id: 'moon_potential', label: 'Moon potential?', icon: '🚀' },
  { id: 'entry_point', label: 'Good entry point?', icon: '📍' },
];

/**
 * Ask ClawF a question about a token
 */
export async function askClawF(
  question: string,
  context: TokenContext
): Promise<AIChatResponse> {
  // Try API first
  try {
    const response = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, context }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.response) {
        return data.response;
      }
    }
  } catch (error) {
    console.log('[ClawFi AI] Chat API unavailable, using local analysis');
  }

  // Fallback to local analysis
  return generateLocalChatResponse(question, context);
}

/**
 * Generate local chat response
 */
function generateLocalChatResponse(question: string, context: TokenContext): AIChatResponse {
  const questionLower = question.toLowerCase();
  const reasoning: string[] = [];
  let recommendation: AIChatResponse['recommendation'] = 'dyor';
  let confidence: AIChatResponse['confidence'] = 'medium';
  let answer = '';

  // Analyze context
  const isSafe = !context.honeypot && (context.riskScore || 50) < 60;
  const isLiquid = (context.liquidity || 0) > 20000;
  const isPumping = (context.priceChange1h || 0) > 20;
  const isDumping = (context.priceChange1h || 0) < -20;
  const hasVolume = (context.volume24h || 0) > 10000;
  const isBuyPressure = context.txns24h ? 
    context.txns24h.buys / (context.txns24h.buys + context.txns24h.sells) > 0.6 : false;
  const isNew = context.age !== undefined && context.age < 24;

  // Add reasoning based on data
  if (context.honeypot) {
    reasoning.push('CRITICAL: Honeypot detected - cannot sell');
    recommendation = 'avoid';
    confidence = 'high';
  }
  if (context.riskScore !== undefined) {
    if (context.riskScore > 70) reasoning.push(`High risk score: ${context.riskScore}/100`);
    else if (context.riskScore < 30) reasoning.push(`Low risk score: ${context.riskScore}/100`);
  }
  if (!isLiquid) reasoning.push('Low liquidity - high slippage risk');
  if (isLiquid) reasoning.push('Good liquidity depth');
  if (isPumping) reasoning.push(`Currently pumping: +${context.priceChange1h?.toFixed(0)}% in 1h`);
  if (isDumping) reasoning.push(`Currently dumping: ${context.priceChange1h?.toFixed(0)}% in 1h`);
  if (isBuyPressure) reasoning.push('Strong buy pressure from transactions');
  if (isNew) reasoning.push('Very new token (< 24 hours old)');
  if (context.liquidityLocked) reasoning.push('Liquidity is locked');
  if (context.liquidityLocked === false) reasoning.push('WARNING: Liquidity not locked');

  // Handle specific questions
  if (questionLower.includes('should i buy') || questionLower.includes('should_buy')) {
    if (context.honeypot) {
      answer = 'ABSOLUTELY NOT. This is a honeypot - you will not be able to sell. Stay away!';
      recommendation = 'avoid';
      confidence = 'high';
    } else if ((context.riskScore || 50) > 70) {
      answer = 'I would advise caution. The risk score is high and there are several red flags. If you do enter, use small size only.';
      recommendation = 'avoid';
      confidence = 'medium';
    } else if (isPumping && !isLiquid) {
      answer = 'Risky entry. It\'s pumping but liquidity is low - you might get stuck or face heavy slippage.';
      recommendation = 'hold';
    } else if (isSafe && isLiquid && isBuyPressure) {
      answer = 'Metrics look decent. Low risk score, good liquidity, and buy pressure. Could be worth a small position if you believe in it.';
      recommendation = 'buy';
      confidence = 'medium';
    } else if (isDumping) {
      answer = 'Currently in a downtrend. Might want to wait for stabilization before entering.';
      recommendation = 'hold';
    } else {
      answer = 'Mixed signals. Not a clear buy or avoid. Do your own research on the project fundamentals.';
      recommendation = 'dyor';
    }
  } else if (questionLower.includes('safe') || questionLower.includes('is_safe')) {
    if (context.honeypot) {
      answer = 'NO! This is a confirmed honeypot. Do not interact with this token.';
      recommendation = 'avoid';
      confidence = 'high';
    } else if (isSafe && context.liquidityLocked && context.contractVerified) {
      answer = 'Relatively safe based on available data. Contract verified, liquidity locked, and low risk score. Still DYOR.';
      recommendation = 'dyor';
      confidence = 'medium';
    } else if (!context.liquidityLocked) {
      answer = 'Caution advised. Liquidity is not locked which means the dev could pull the rug at any time.';
      recommendation = 'avoid';
      confidence = 'medium';
    } else {
      answer = `Risk score is ${context.riskScore || 'unknown'}/100. ${isSafe ? 'Appears relatively safe but always verify yourself.' : 'Several risk factors detected - proceed with caution.'}`;
      recommendation = isSafe ? 'dyor' : 'avoid';
    }
  } else if (questionLower.includes('rug') || questionLower.includes('rug_risk')) {
    const rugRisks: string[] = [];
    if (!context.liquidityLocked) rugRisks.push('Liquidity not locked');
    if (!context.contractVerified) rugRisks.push('Contract not verified');
    if (isNew) rugRisks.push('Very new token');
    if ((context.riskScore || 50) > 60) rugRisks.push('High risk score');

    if (context.honeypot) {
      answer = 'This IS a rug - it\'s a honeypot. You cannot sell.';
      confidence = 'high';
      recommendation = 'avoid';
    } else if (rugRisks.length >= 3) {
      answer = `HIGH RUG RISK. Multiple red flags: ${rugRisks.join(', ')}. I would avoid this.`;
      confidence = 'high';
      recommendation = 'avoid';
    } else if (rugRisks.length > 0) {
      answer = `Some rug risk factors: ${rugRisks.join(', ')}. Be careful and don't invest more than you can lose.`;
      confidence = 'medium';
      recommendation = 'hold';
    } else {
      answer = 'No major rug pull indicators detected. Liquidity appears locked and contract is verified. Lower risk but not zero.';
      confidence = 'medium';
      recommendation = 'dyor';
    }
  } else if (questionLower.includes('moon') || questionLower.includes('moon_potential')) {
    if (context.honeypot) {
      answer = 'Zero moon potential - this is a honeypot scam.';
      recommendation = 'avoid';
      confidence = 'high';
    } else if (isNew && isPumping && isBuyPressure && isLiquid) {
      answer = 'Showing some moon signals: new, pumping, buy pressure, and liquid. High risk high reward play. Small bags only.';
      recommendation = 'dyor';
      confidence = 'low';
    } else if (isPumping && hasVolume) {
      answer = 'Currently hot with good volume. Could continue but pumps don\'t last forever. Set stop losses.';
      recommendation = 'dyor';
      confidence = 'low';
    } else if (isDumping) {
      answer = 'Currently dumping. Not showing moon potential right now. Wait for reversal signs.';
      recommendation = 'hold';
      confidence = 'medium';
    } else {
      answer = 'No clear moon signals. Stable but not explosive. Look for catalysts or news.';
      recommendation = 'dyor';
      confidence = 'low';
    }
  } else if (questionLower.includes('entry') || questionLower.includes('entry_point')) {
    if (context.honeypot) {
      answer = 'DO NOT ENTER. This is a honeypot.';
      recommendation = 'avoid';
      confidence = 'high';
    } else if (isPumping) {
      answer = 'Already pumping - not ideal entry. Wait for a pullback or consolidation before entering.';
      recommendation = 'hold';
      confidence = 'medium';
    } else if (isDumping) {
      answer = 'Currently dumping. Could be a good entry if you believe it will recover, but catching knives is risky. Wait for support.';
      recommendation = 'hold';
    } else if (isSafe && isLiquid) {
      answer = 'Price is relatively stable. If fundamentals are good, this could be a reasonable entry point. Start small.';
      recommendation = 'dyor';
      confidence = 'medium';
    } else {
      answer = 'Hard to say without more data. Check the chart for support levels and set a stop loss.';
      recommendation = 'dyor';
      confidence = 'low';
    }
  } else {
    // Generic question
    answer = `Based on the data: Risk score ${context.riskScore || 'unknown'}/100, ${
      isPumping ? 'currently pumping' : isDumping ? 'currently dumping' : 'stable price action'
    }, ${isLiquid ? 'good liquidity' : 'low liquidity'}. ${
      isSafe ? 'No major red flags detected.' : 'Some risk factors present.'
    } Always do your own research.`;
    recommendation = isSafe ? 'dyor' : 'avoid';
    confidence = 'low';
  }

  return {
    answer,
    confidence,
    recommendation,
    reasoning: reasoning.slice(0, 5),
  };
}
