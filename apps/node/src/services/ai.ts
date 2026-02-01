/**
 * AI Service - OpenAI GPT Integration
 * 
 * Provides AI-powered analysis for:
 * - Token analysis and risk assessment
 * - Signal rating and prioritization
 * - Trading advice and recommendations
 */

import OpenAI from 'openai';
import type { PrismaClient } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface TokenAnalysis {
  symbol: string;
  address: string;
  chain: string;
  riskScore: number; // 1-100, higher = riskier
  sentiment: 'bullish' | 'bearish' | 'neutral';
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  confidence: number; // 0-100
}

export interface SignalRating {
  signalId: string;
  importance: number; // 1-10
  actionRequired: boolean;
  reasoning: string;
  suggestedAction: string;
}

export interface TradingAdvice {
  question: string;
  answer: string;
  disclaimers: string[];
  relatedTokens?: string[];
}

export interface TokenData {
  address: string;
  symbol?: string;
  name?: string;
  chain: string;
  price?: number;
  priceChange24h?: number;
  volume24h?: number;
  marketCap?: number;
  holders?: number;
  liquidity?: number;
  signals?: Array<{
    type: string;
    severity: string;
    message: string;
    ts: Date;
  }>;
}

// ============================================
// AI Service
// ============================================

export class AIService {
  private openai: OpenAI | null = null;
  private model: string;
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && apiKey !== 'sk-your-openai-api-key-here') {
      this.openai = new OpenAI({ apiKey });
      console.log('🦀 Clawf AI initialized');
    } else {
      console.warn('⚠️ AI Service: OPENAI_API_KEY not configured');
    }
  }

  /**
   * Check if AI is available
   */
  isAvailable(): boolean {
    return this.openai !== null;
  }

  /**
   * Analyze a token and provide risk assessment
   */
  async analyzeToken(tokenData: TokenData): Promise<TokenAnalysis> {
    if (!this.openai) {
      throw new Error('AI service not configured. Set OPENAI_API_KEY in environment.');
    }

    // Fetch recent signals for this token
    const signals = await this.prisma.signal.findMany({
      where: {
        token: tokenData.address.toLowerCase(),
      },
      orderBy: { ts: 'desc' },
      take: 10,
    });

    const signalsSummary = signals.map(s => ({
      type: s.signalType,
      severity: s.severity,
      message: s.summary,
      ts: s.ts,
    }));

    // Try to find launchpad info for this token
    const launchpadToken = await this.prisma.launchpadToken.findFirst({
      where: {
        tokenAddress: { equals: tokenData.address, mode: 'insensitive' },
      },
      select: { launchpad: true, chain: true, createdAt: true, creatorAddress: true },
    });

    const launchpadInfo = launchpadToken 
      ? `\n- Launchpad: ${launchpadToken.launchpad} (${launchpadToken.chain})\n- Launch Date: ${launchpadToken.createdAt.toISOString()}\n- Creator: ${launchpadToken.creatorAddress}`
      : '';

    const prompt = `You are Clawf, the AI trading analyst for ClawFi - a multi-chain DeFi intelligence platform.

SUPPORTED PLATFORMS:
- Clanker (Base) - Base chain token launchpad
- Four.meme (BSC) - BNB Smart Chain meme token launchpad
- Pump.fun (Solana) - Solana meme token launchpad

Analyze this token and provide a structured assessment.

TOKEN DATA:
- Address: ${tokenData.address}
- Symbol: ${tokenData.symbol || 'Unknown'}
- Name: ${tokenData.name || 'Unknown'}
- Chain: ${tokenData.chain}${launchpadInfo}
- Current Price: $${tokenData.price?.toFixed(8) || 'Unknown'}
- 24h Price Change: ${tokenData.priceChange24h?.toFixed(2) || 'Unknown'}%
- 24h Volume: $${tokenData.volume24h?.toLocaleString() || 'Unknown'}
- Market Cap: $${tokenData.marketCap?.toLocaleString() || 'Unknown'}
- Holders: ${tokenData.holders?.toLocaleString() || 'Unknown'}
- Liquidity: $${tokenData.liquidity?.toLocaleString() || 'Unknown'}

RECENT SIGNALS (from ClawFi analysis):
${signalsSummary.length > 0 ? signalsSummary.map(s => `- [${s.severity.toUpperCase()}] ${s.type}: ${s.message}`).join('\n') : 'No signals detected'}

Provide your analysis in the following JSON format ONLY (no markdown, no explanation):
{
  "riskScore": <number 1-100, higher = riskier>,
  "sentiment": "<bullish|bearish|neutral>",
  "summary": "<2-3 sentence summary>",
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "weaknesses": ["<weakness 1>", "<weakness 2>", ...],
  "recommendation": "<strong_buy|buy|hold|sell|strong_sell>",
  "confidence": <number 0-100>
}`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'You are Clawf, ClawFi\'s professional crypto analyst. Always respond with valid JSON only, no markdown formatting.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || '{}';
    
    try {
      // Remove potential markdown code blocks
      const jsonContent = content.replace(/```json\n?|\n?```/g, '').trim();
      const analysis = JSON.parse(jsonContent);
      
      return {
        symbol: tokenData.symbol || 'UNKNOWN',
        address: tokenData.address,
        chain: tokenData.chain,
        riskScore: analysis.riskScore || 50,
        sentiment: analysis.sentiment || 'neutral',
        summary: analysis.summary || 'Unable to analyze token.',
        strengths: analysis.strengths || [],
        weaknesses: analysis.weaknesses || [],
        recommendation: analysis.recommendation || 'hold',
        confidence: analysis.confidence || 50,
      };
    } catch {
      throw new Error('Failed to parse AI response');
    }
  }

  /**
   * Rate a signal for importance and urgency
   */
  async rateSignal(signal: {
    id: string;
    signalType: string;
    severity: string;
    message: string;
    token?: string;
    tokenSymbol?: string;
    chain?: string;
  }): Promise<SignalRating> {
    if (!this.openai) {
      throw new Error('AI service not configured. Set OPENAI_API_KEY in environment.');
    }

    const prompt = `You are Clawf, ClawFi's signal analyst. Rate this signal for a trader.

SIGNAL:
- Type: ${signal.signalType}
- Severity: ${signal.severity}
- Message: ${signal.message}
- Token: ${signal.tokenSymbol || signal.token || 'N/A'}
- Chain: ${signal.chain || 'N/A'}

Rate this signal in the following JSON format ONLY:
{
  "importance": <number 1-10>,
  "actionRequired": <boolean>,
  "reasoning": "<why this rating>",
  "suggestedAction": "<what the trader should do>"
}`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'You are Clawf, ClawFi\'s crypto signal analyst. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content || '{}';
    
    try {
      const jsonContent = content.replace(/```json\n?|\n?```/g, '').trim();
      const rating = JSON.parse(jsonContent);
      
      return {
        signalId: signal.id,
        importance: rating.importance || 5,
        actionRequired: rating.actionRequired || false,
        reasoning: rating.reasoning || 'Unable to rate signal.',
        suggestedAction: rating.suggestedAction || 'Monitor the situation.',
      };
    } catch {
      throw new Error('Failed to parse AI response');
    }
  }

  /**
   * Get trading advice for a question
   */
  async getAdvice(question: string, context?: {
    watchedTokens?: string[];
    recentSignals?: Array<{ type: string; message: string }>;
  }): Promise<TradingAdvice> {
    if (!this.openai) {
      throw new Error('AI service not configured. Set OPENAI_API_KEY in environment.');
    }

    // Get comprehensive context from the database - all chains and launchpads
    const [recentSignals, watchedTokens, recentLaunches] = await Promise.all([
      this.prisma.signal.findMany({
        orderBy: { ts: 'desc' },
        take: 10,
        select: { signalType: true, summary: true, tokenSymbol: true, severity: true, chain: true },
      }),
      this.prisma.watchedToken.findMany({
        where: { enabled: true },
        take: 10,
        select: { tokenSymbol: true, tokenAddress: true, chain: true },
      }),
      // Get recent launches from ALL launchpads
      this.prisma.launchpadToken.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: { 
          tokenSymbol: true, 
          tokenName: true, 
          tokenAddress: true, 
          chain: true, 
          launchpad: true,
          createdAt: true 
        },
      }),
    ]);

    // Group launches by launchpad
    const launchpadGroups: Record<string, typeof recentLaunches> = {};
    for (const launch of recentLaunches) {
      const key = `${launch.launchpad} (${launch.chain})`;
      if (!launchpadGroups[key]) launchpadGroups[key] = [];
      launchpadGroups[key].push(launch);
    }

    const launchpadContext = Object.entries(launchpadGroups)
      .map(([platform, tokens]) => 
        `${platform}: ${tokens.slice(0, 5).map(t => t.tokenSymbol || t.tokenName || t.tokenAddress.slice(0, 10)).join(', ')}`
      ).join('\n  ');

    const contextStr = `
CURRENT CONTEXT:
- Watched Tokens: ${watchedTokens.map(t => `${t.tokenSymbol || t.tokenAddress} (${t.chain})`).join(', ') || 'None'}
- Recent Signals: ${recentSignals.map(s => `[${s.severity}/${s.chain || 'unknown'}] ${s.signalType}: ${s.summary}`).join('; ') || 'None'}
- Recent Launches by Platform:
  ${launchpadContext || 'No recent launches'}
${context?.watchedTokens ? `- User Portfolio: ${context.watchedTokens.join(', ')}` : ''}
`;

    const prompt = `You are Clawf, ClawFi's crypto trading advisor. You help users make informed decisions about DeFi trading across multiple chains and launchpads:

SUPPORTED PLATFORMS:
- Clanker (Base) - Base chain token launchpad
- Four.meme (BSC) - BNB Smart Chain meme token launchpad  
- Pump.fun (Solana) - Solana meme token launchpad

SUPPORTED CHAINS:
- Base (EVM) - Layer 2 on Ethereum
- BSC/BNB Smart Chain (EVM) - Binance's chain
- Solana - High-speed non-EVM chain
- Ethereum - Main EVM chain

${contextStr}

USER QUESTION: ${question}

Provide helpful, actionable advice. Be direct and practical. Always include appropriate risk disclaimers.

Respond in the following JSON format ONLY:
{
  "answer": "<your advice, 2-4 sentences>",
  "disclaimers": ["<disclaimer 1>", "<disclaimer 2>"],
  "relatedTokens": ["<relevant token if any>"]
}`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'You are Clawf, ClawFi\'s helpful and knowledgeable crypto trading advisor. Always respond with valid JSON only. Be practical and include risk warnings.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || '{}';
    
    try {
      const jsonContent = content.replace(/```json\n?|\n?```/g, '').trim();
      const advice = JSON.parse(jsonContent);
      
      return {
        question,
        answer: advice.answer || 'Unable to provide advice at this time.',
        disclaimers: advice.disclaimers || ['Not financial advice. Always do your own research.'],
        relatedTokens: advice.relatedTokens || [],
      };
    } catch {
      throw new Error('Failed to parse AI response');
    }
  }

  /**
   * Batch analyze multiple tokens
   */
  async analyzeMultipleTokens(tokens: TokenData[]): Promise<TokenAnalysis[]> {
    const results: TokenAnalysis[] = [];
    
    // Process in batches of 3 to avoid rate limits
    for (let i = 0; i < tokens.length; i += 3) {
      const batch = tokens.slice(i, i + 3);
      const analyses = await Promise.all(
        batch.map(token => this.analyzeToken(token).catch(err => ({
          symbol: token.symbol || 'UNKNOWN',
          address: token.address,
          chain: token.chain,
          riskScore: 50,
          sentiment: 'neutral' as const,
          summary: `Analysis failed: ${err.message}`,
          strengths: [],
          weaknesses: [],
          recommendation: 'hold' as const,
          confidence: 0,
        })))
      );
      results.push(...analyses);
      
      // Small delay between batches
      if (i + 3 < tokens.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return results;
  }

  /**
   * Process natural language command
   */
  async processNaturalLanguage(input: string): Promise<{
    intent: string;
    entities: Record<string, string>;
    response: string;
  }> {
    if (!this.openai) {
      throw new Error('AI service not configured. Set OPENAI_API_KEY in environment.');
    }

    const prompt = `You are Clawf, ClawFi's command interpreter. Parse the user's natural language input into a structured command.

SUPPORTED CHAINS & LAUNCHPADS:
- base: Base chain (Clanker launchpad)
- bsc: BNB Smart Chain (Four.meme launchpad)
- solana: Solana (Pump.fun launchpad)
- eth: Ethereum mainnet

Available intents:
- analyze_token: Analyze a specific token (needs: address or symbol, chain)
- watch_token: Add token to watchlist (needs: address, chain)
- unwatch_token: Remove token from watchlist (needs: address, chain)
- get_advice: General trading question
- market_overview: Get market summary
- portfolio_status: Check watched tokens
- unknown: Can't understand

USER INPUT: "${input}"

Respond in JSON format ONLY:
{
  "intent": "<intent_name>",
  "entities": {
    "address": "<if mentioned>",
    "symbol": "<if mentioned>",
    "chain": "<if mentioned - detect from context: base/bsc/solana/eth, default: base>"
  },
  "response": "<natural language response to confirm understanding>"
}`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'You are a command parser. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content || '{}';
    
    try {
      const jsonContent = content.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(jsonContent);
    } catch {
      return {
        intent: 'unknown',
        entities: {},
        response: 'I could not understand that command. Try "help" for available commands.',
      };
    }
  }
}
