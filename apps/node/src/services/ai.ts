/**
 * AI Service - OpenAI GPT Integration
 * 
 * Provides AI-powered analysis for:
 * - Token analysis and risk assessment
 * - Signal rating and prioritization
 * - Trading advice and recommendations
 * - DexScreener market data integration
 */

import OpenAI from 'openai';
import type { PrismaClient } from '@prisma/client';

// ============================================
// DexScreener API Types & Helpers
// ============================================

const DEXSCREENER_API = 'https://api.dexscreener.com';
const GECKOTERMINAL_API = 'https://api.geckoterminal.com/api/v2';

// Block Explorer APIs
const EXPLORER_APIS: Record<string, { url: string; keyEnv: string }> = {
  ethereum: { url: 'https://api.etherscan.io/api', keyEnv: 'ETHERSCAN_API_KEY' },
  base: { url: 'https://api.basescan.org/api', keyEnv: 'BASESCAN_API_KEY' },
  bsc: { url: 'https://api.bscscan.com/api', keyEnv: 'BSCSCAN_API_KEY' },
};

interface DexScreenerPair {
  chainId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  priceChange?: { h24?: number; h6?: number; h1?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  txns?: { h24?: { buys: number; sells: number } };
}

interface DexScreenerBoost {
  chainId: string;
  tokenAddress: string;
  icon?: string;
  description?: string;
  amount?: number;
}

interface GeckoPool {
  id: string;
  attributes: {
    name: string;
    address: string;
    base_token_price_usd: string | null;
    fdv_usd: string | null;
    reserve_in_usd: string | null;
    volume_usd?: { h24?: string };
    price_change_percentage?: { h24?: string };
  };
}

interface ExplorerTokenInfo {
  contractAddress: string;
  tokenName: string;
  symbol: string;
  divisor: string;
  totalSupply: string;
}

async function fetchDexScreener<T>(endpoint: string): Promise<T | null> {
  try {
    const response = await fetch(`${DEXSCREENER_API}${endpoint}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'ClawFi/0.2.0' },
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

async function fetchGeckoTerminal<T>(endpoint: string): Promise<T | null> {
  try {
    const response = await fetch(`${GECKOTERMINAL_API}${endpoint}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'ClawFi/0.2.0' },
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

async function fetchExplorer(chain: string, params: Record<string, string>): Promise<Record<string, unknown> | null> {
  const config = EXPLORER_APIS[chain];
  if (!config) return null;
  
  const apiKey = process.env[config.keyEnv];
  if (!apiKey) return null;
  
  try {
    const url = new URL(config.url);
    url.searchParams.set('apikey', apiKey);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    
    const response = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) return null;
    
    const data = await response.json() as { status: string; result: unknown };
    if (data.status !== '1') return null;
    return data.result as Record<string, unknown>;
  } catch {
    return null;
  }
}

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

export interface MoonshotCandidate {
  symbol: string;
  name: string;
  address: string;
  chain: string;
  priceUsd: number;
  priceChange1h: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  fdv: number;
  buys24h: number;
  sells24h: number;
  moonshotScore: number; // 0-100, higher = more potential
  signals: string[];
  risk: 'extreme' | 'high' | 'medium';
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
   * Fetch trending tokens from DexScreener (boosted tokens)
   */
  async getDexScreenerTrending(): Promise<Array<{
    chain: string;
    symbol: string;
    address: string;
    boosts: number;
  }>> {
    try {
      const data = await fetchDexScreener<DexScreenerBoost[]>('/token-boosts/top/v1');
      if (!data || !Array.isArray(data)) return [];
      
      return data.slice(0, 15).map(token => ({
        chain: token.chainId,
        symbol: token.tokenAddress.slice(0, 8),
        address: token.tokenAddress,
        boosts: token.amount || 0,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Fetch token data from DexScreener
   */
  async getDexScreenerToken(address: string): Promise<{
    symbol: string;
    name: string;
    chain: string;
    priceUsd: number;
    priceChange24h: number;
    volume24h: number;
    liquidity: number;
    fdv: number;
    buys24h: number;
    sells24h: number;
  } | null> {
    try {
      const data = await fetchDexScreener<{ pairs?: DexScreenerPair[] }>(`/latest/dex/tokens/${address}`);
      if (!data?.pairs?.[0]) return null;
      
      const pair = data.pairs[0];
      return {
        symbol: pair.baseToken.symbol,
        name: pair.baseToken.name,
        chain: pair.chainId,
        priceUsd: parseFloat(pair.priceUsd || '0'),
        priceChange24h: pair.priceChange?.h24 || 0,
        volume24h: pair.volume?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
        fdv: pair.fdv || 0,
        buys24h: pair.txns?.h24?.buys || 0,
        sells24h: pair.txns?.h24?.sells || 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Search tokens on DexScreener
   */
  async searchDexScreener(query: string): Promise<Array<{
    symbol: string;
    name: string;
    chain: string;
    address: string;
    priceUsd: number;
    priceChange24h: number;
    liquidity: number;
  }>> {
    try {
      const data = await fetchDexScreener<{ pairs?: DexScreenerPair[] }>(`/latest/dex/search?q=${encodeURIComponent(query)}`);
      if (!data?.pairs) return [];
      
      return data.pairs.slice(0, 10).map(pair => ({
        symbol: pair.baseToken.symbol,
        name: pair.baseToken.name,
        chain: pair.chainId,
        address: pair.baseToken.address,
        priceUsd: parseFloat(pair.priceUsd || '0'),
        priceChange24h: pair.priceChange?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get trending pools from GeckoTerminal (Uniswap, PancakeSwap, etc.)
   */
  async getGeckoTrendingPools(network?: string): Promise<Array<{
    name: string;
    chain: string;
    address: string;
    priceUsd: number;
    volume24h: number;
    liquidity: number;
  }>> {
    try {
      const endpoint = network 
        ? `/networks/${network}/trending_pools`
        : '/networks/trending_pools';
      const data = await fetchGeckoTerminal<{ data?: GeckoPool[] }>(endpoint);
      if (!data?.data) return [];
      
      return data.data.slice(0, 10).map(pool => ({
        name: pool.attributes.name,
        chain: pool.id.split('_')[0],
        address: pool.attributes.address,
        priceUsd: parseFloat(pool.attributes.base_token_price_usd || '0'),
        volume24h: parseFloat(pool.attributes.volume_usd?.h24 || '0'),
        liquidity: parseFloat(pool.attributes.reserve_in_usd || '0'),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get new pools from GeckoTerminal
   */
  async getGeckoNewPools(network?: string): Promise<Array<{
    name: string;
    chain: string;
    address: string;
    liquidity: number;
  }>> {
    try {
      const endpoint = network 
        ? `/networks/${network}/new_pools`
        : '/networks/new_pools';
      const data = await fetchGeckoTerminal<{ data?: GeckoPool[] }>(endpoint);
      if (!data?.data) return [];
      
      return data.data.slice(0, 10).map(pool => ({
        name: pool.attributes.name,
        chain: pool.id.split('_')[0],
        address: pool.attributes.address,
        liquidity: parseFloat(pool.attributes.reserve_in_usd || '0'),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get token info from block explorer (Etherscan/Basescan/BSCScan)
   */
  async getExplorerTokenInfo(chain: string, address: string): Promise<{
    name: string;
    symbol: string;
    totalSupply: string;
    decimals: number;
    verified: boolean;
  } | null> {
    try {
      // Get token info
      const tokenInfo = await fetchExplorer(chain, {
        module: 'token',
        action: 'tokeninfo',
        contractaddress: address,
      }) as ExplorerTokenInfo | null;
      
      if (!tokenInfo) return null;
      
      // Check if contract is verified
      const sourceCode = await fetchExplorer(chain, {
        module: 'contract',
        action: 'getsourcecode',
        address: address,
      }) as Array<{ SourceCode?: string }> | null;
      
      const verified = !!(sourceCode?.[0]?.SourceCode);
      
      return {
        name: tokenInfo.tokenName || 'Unknown',
        symbol: tokenInfo.symbol || '???',
        totalSupply: tokenInfo.totalSupply || '0',
        decimals: parseInt(tokenInfo.divisor) || 18,
        verified,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get contract holder count from explorer
   */
  async getExplorerHolders(chain: string, address: string): Promise<number | null> {
    try {
      // Note: This endpoint may not be available on all explorers
      const data = await fetchExplorer(chain, {
        module: 'token',
        action: 'tokenholderlist',
        contractaddress: address,
        page: '1',
        offset: '1',
      }) as Array<unknown> | null;
      
      // If we get a response, there are holders
      return data ? data.length : null;
    } catch {
      return null;
    }
  }

  /**
   * Calculate moonshot score for a token
   * Looks for early-stage tokens with explosive potential
   */
  private calculateMoonshotScore(token: {
    priceChange1h?: number;
    priceChange24h?: number;
    volume24h: number;
    liquidity: number;
    fdv: number;
    buys24h: number;
    sells24h: number;
  }): { score: number; signals: string[] } {
    let score = 0;
    const signals: string[] = [];

    // LOW MARKET CAP (max 25 points) - Under $5M is prime moonshot territory
    if (token.fdv > 0) {
      if (token.fdv < 100000) {
        score += 25;
        signals.push('🎯 Micro cap (<$100K) - Maximum upside potential');
      } else if (token.fdv < 500000) {
        score += 22;
        signals.push('🎯 Ultra low cap (<$500K)');
      } else if (token.fdv < 1000000) {
        score += 18;
        signals.push('🎯 Low cap (<$1M)');
      } else if (token.fdv < 5000000) {
        score += 12;
        signals.push('💰 Sub $5M market cap');
      } else if (token.fdv < 10000000) {
        score += 5;
      }
    }

    // VOLUME TO MCAP RATIO (max 25 points) - High volume relative to cap = interest
    if (token.fdv > 0 && token.volume24h > 0) {
      const volumeRatio = token.volume24h / token.fdv;
      if (volumeRatio > 2) {
        score += 25;
        signals.push('🔥 Extreme volume (>200% of mcap) - Major accumulation');
      } else if (volumeRatio > 1) {
        score += 20;
        signals.push('🔥 Very high volume (>100% of mcap)');
      } else if (volumeRatio > 0.5) {
        score += 15;
        signals.push('📈 High volume ratio');
      } else if (volumeRatio > 0.2) {
        score += 10;
      } else if (volumeRatio > 0.1) {
        score += 5;
      }
    }

    // BUY/SELL RATIO (max 20 points) - More buys = accumulation
    const totalTxns = token.buys24h + token.sells24h;
    if (totalTxns > 0) {
      const buyRatio = token.buys24h / totalTxns;
      if (buyRatio > 0.7) {
        score += 20;
        signals.push('🐋 Heavy accumulation (>70% buys)');
      } else if (buyRatio > 0.6) {
        score += 15;
        signals.push('📊 Strong buying pressure');
      } else if (buyRatio > 0.55) {
        score += 10;
        signals.push('📊 Positive buy pressure');
      } else if (buyRatio < 0.4) {
        score -= 10;
        signals.push('⚠️ Selling pressure detected');
      }
    }

    // PRICE MOMENTUM (max 15 points)
    if (token.priceChange1h !== undefined) {
      if (token.priceChange1h > 50) {
        score += 15;
        signals.push('🚀 Pumping NOW (+50% 1h)');
      } else if (token.priceChange1h > 20) {
        score += 12;
        signals.push('🚀 Strong momentum (+20% 1h)');
      } else if (token.priceChange1h > 10) {
        score += 8;
        signals.push('📈 Gaining momentum');
      } else if (token.priceChange1h < -20) {
        score -= 5;
      }
    }

    if (token.priceChange24h !== undefined && token.priceChange24h > 100) {
      score += 5;
      signals.push('💎 Already 2x+ in 24h');
    }

    // LIQUIDITY CHECK (max 15 points) - Need liquidity but not too much
    if (token.liquidity > 0) {
      if (token.liquidity >= 10000 && token.liquidity < 100000) {
        score += 15;
        signals.push('💧 Optimal liquidity range ($10K-$100K)');
      } else if (token.liquidity >= 5000 && token.liquidity < 500000) {
        score += 10;
      } else if (token.liquidity < 5000) {
        score -= 10;
        signals.push('⚠️ Very low liquidity - high slippage risk');
      }
    }

    // Transaction activity bonus
    if (totalTxns > 500) {
      score += 5;
      signals.push('🔄 High transaction count');
    } else if (totalTxns > 200) {
      score += 3;
    }

    return { score: Math.max(0, Math.min(100, score)), signals };
  }

  /**
   * Find potential moonshot tokens across all chains
   */
  async findMoonshots(options?: { 
    chain?: string;
    minScore?: number;
    limit?: number;
  }): Promise<MoonshotCandidate[]> {
    const minScore = options?.minScore || 40;
    const limit = options?.limit || 10;
    
    try {
      // Fetch data from multiple sources
      const [dexGainers, newPools, launchpadTokens] = await Promise.all([
        // Get top gainers from DexScreener
        fetchDexScreener<{ pairs?: DexScreenerPair[] }>('/latest/dex/tokens/trending'),
        // Get new pools 
        this.getGeckoNewPools(options?.chain),
        // Get recent launchpad tokens
        this.prisma.launchpadToken.findMany({
          where: options?.chain ? { chain: options.chain } : {},
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
      ]);

      const candidates: MoonshotCandidate[] = [];

      // Process DexScreener data
      if (dexGainers?.pairs) {
        for (const pair of dexGainers.pairs.slice(0, 30)) {
          if (options?.chain && pair.chainId !== options.chain) continue;
          
          const { score, signals } = this.calculateMoonshotScore({
            priceChange1h: pair.priceChange?.h1,
            priceChange24h: pair.priceChange?.h24,
            volume24h: pair.volume?.h24 || 0,
            liquidity: pair.liquidity?.usd || 0,
            fdv: pair.fdv || 0,
            buys24h: pair.txns?.h24?.buys || 0,
            sells24h: pair.txns?.h24?.sells || 0,
          });

          if (score >= minScore) {
            candidates.push({
              symbol: pair.baseToken.symbol,
              name: pair.baseToken.name,
              address: pair.baseToken.address,
              chain: pair.chainId,
              priceUsd: parseFloat(pair.priceUsd || '0'),
              priceChange1h: pair.priceChange?.h1 || 0,
              priceChange24h: pair.priceChange?.h24 || 0,
              volume24h: pair.volume?.h24 || 0,
              liquidity: pair.liquidity?.usd || 0,
              fdv: pair.fdv || 0,
              buys24h: pair.txns?.h24?.buys || 0,
              sells24h: pair.txns?.h24?.sells || 0,
              moonshotScore: score,
              signals,
              risk: score > 70 ? 'extreme' : score > 50 ? 'high' : 'medium',
            });
          }
        }
      }

      // Also check launchpad tokens that might be early gems
      for (const token of launchpadTokens) {
        // Get live data for launchpad token
        const liveData = await this.getDexScreenerToken(token.tokenAddress);
        if (!liveData) continue;

        const { score, signals } = this.calculateMoonshotScore({
          priceChange24h: liveData.priceChange24h,
          volume24h: liveData.volume24h,
          liquidity: liveData.liquidity,
          fdv: liveData.fdv,
          buys24h: liveData.buys24h,
          sells24h: liveData.sells24h,
        });

        // Add launchpad context
        signals.push(`📍 From ${token.launchpad}`);

        if (score >= minScore) {
          // Check if already in list
          if (!candidates.find(c => c.address.toLowerCase() === token.tokenAddress.toLowerCase())) {
            candidates.push({
              symbol: liveData.symbol,
              name: liveData.name,
              address: token.tokenAddress,
              chain: token.chain,
              priceUsd: liveData.priceUsd,
              priceChange1h: 0,
              priceChange24h: liveData.priceChange24h,
              volume24h: liveData.volume24h,
              liquidity: liveData.liquidity,
              fdv: liveData.fdv,
              buys24h: liveData.buys24h,
              sells24h: liveData.sells24h,
              moonshotScore: score,
              signals,
              risk: score > 70 ? 'extreme' : score > 50 ? 'high' : 'medium',
            });
          }
        }
      }

      // Sort by moonshot score and return top candidates
      return candidates
        .sort((a, b) => b.moonshotScore - a.moonshotScore)
        .slice(0, limit);
    } catch (error) {
      console.error('Error finding moonshots:', error);
      return [];
    }
  }

  /**
   * Get specific buy recommendations with moonshot potential
   */
  async getMoonshotAdvice(): Promise<{
    topPicks: MoonshotCandidate[];
    analysis: string;
    warnings: string[];
  }> {
    const moonshots = await this.findMoonshots({ minScore: 45, limit: 5 });
    
    if (moonshots.length === 0) {
      return {
        topPicks: [],
        analysis: 'No high-potential moonshots detected right now. Market may be cooling off.',
        warnings: ['Markets are cyclical - patience is key', 'Never invest more than you can afford to lose'],
      };
    }

    // Use AI to provide analysis of the top picks
    if (this.openai) {
      const prompt = `You are Clawf, an aggressive crypto moonshot hunter. Analyze these potential 10x plays and give SPECIFIC, ACTIONABLE advice.

TOP MOONSHOT CANDIDATES (sorted by potential):
${moonshots.map((m, i) => `
${i + 1}. ${m.symbol} (${m.name}) on ${m.chain}
   - Address: ${m.address}
   - Price: $${m.priceUsd.toFixed(8)}
   - Market Cap: $${m.fdv.toLocaleString()}
   - 24h Volume: $${m.volume24h.toLocaleString()}
   - Liquidity: $${m.liquidity.toLocaleString()}
   - 24h Change: ${m.priceChange24h > 0 ? '+' : ''}${m.priceChange24h.toFixed(1)}%
   - Buy/Sell: ${m.buys24h}/${m.sells24h}
   - Moonshot Score: ${m.moonshotScore}/100
   - Signals: ${m.signals.join(', ')}
`).join('')}

Provide:
1. Which ONE token has the best 10x potential right now and WHY
2. Specific entry strategy (buy immediately, wait for dip, etc.)
3. Target price/exit strategy
4. Key risks to watch

Be DIRECT and SPECIFIC. This is for experienced degen traders who want alpha, not generic advice.

Respond in JSON:
{
  "topPick": "<symbol>",
  "analysis": "<2-3 sentences on why this could 10x>",
  "entryStrategy": "<specific entry advice>",
  "targetMultiple": "<realistic target like 5x, 10x, 20x>",
  "exitStrategy": "<when to take profits>",
  "keyRisk": "<main risk to watch>"
}`;

      try {
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: 'You are Clawf, an aggressive moonshot hunter. Be specific and actionable. No generic advice.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.8,
          max_tokens: 500,
        });

        const content = response.choices[0]?.message?.content || '{}';
        const jsonContent = content.replace(/```json\n?|\n?```/g, '').trim();
        const advice = JSON.parse(jsonContent);

        return {
          topPicks: moonshots,
          analysis: `🎯 TOP PICK: ${advice.topPick}\n\n${advice.analysis}\n\n📈 Entry: ${advice.entryStrategy}\n🎯 Target: ${advice.targetMultiple}\n💰 Exit: ${advice.exitStrategy}\n⚠️ Risk: ${advice.keyRisk}`,
          warnings: [
            'These are EXTREME risk plays - only use money you can 100% lose',
            'Moonshots fail more often than they succeed',
            'Always verify contract on explorer before buying',
            'Set stop losses and stick to them',
          ],
        };
      } catch {
        // Fallback without AI analysis
      }
    }

    return {
      topPicks: moonshots,
      analysis: `Found ${moonshots.length} potential moonshots. Top pick: ${moonshots[0].symbol} with score ${moonshots[0].moonshotScore}/100`,
      warnings: [
        'These are EXTREME risk plays',
        'Always DYOR before buying',
        'Never invest more than you can afford to lose',
      ],
    };
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

    // Get comprehensive context from all data sources
    const [recentSignals, watchedTokens, recentLaunches, dexTrending, geckoTrending, geckoNewPools] = await Promise.all([
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
      // Get DexScreener trending tokens
      this.getDexScreenerTrending(),
      // Get GeckoTerminal trending pools (Uniswap, PancakeSwap, etc.)
      this.getGeckoTrendingPools(),
      // Get new pools from all DEXes
      this.getGeckoNewPools(),
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

    // Group DexScreener trending by chain
    const dexByChain: Record<string, typeof dexTrending> = {};
    for (const token of dexTrending) {
      if (!dexByChain[token.chain]) dexByChain[token.chain] = [];
      dexByChain[token.chain].push(token);
    }

    const dexContext = Object.entries(dexByChain)
      .map(([chain, tokens]) => 
        `${chain}: ${tokens.slice(0, 3).map(t => `${t.address.slice(0, 10)} (${t.boosts} boosts)`).join(', ')}`
      ).join('\n  ');

    // Format GeckoTerminal trending pools (Uniswap, etc.)
    const geckoTrendingContext = geckoTrending.slice(0, 8)
      .map(p => `${p.name} on ${p.chain} ($${(p.volume24h / 1000000).toFixed(1)}M vol)`)
      .join(', ');

    // Format new pools
    const newPoolsContext = geckoNewPools.slice(0, 5)
      .map(p => `${p.name} on ${p.chain}`)
      .join(', ');

    const contextStr = `
CURRENT CONTEXT:
- Watched Tokens: ${watchedTokens.map(t => `${t.tokenSymbol || t.tokenAddress} (${t.chain})`).join(', ') || 'None'}
- Recent Signals: ${recentSignals.map(s => `[${s.severity}/${s.chain || 'unknown'}] ${s.signalType}: ${s.summary}`).join('; ') || 'None'}
- Recent Launches by Platform:
  ${launchpadContext || 'No recent launches'}
- DexScreener Trending (by chain):
  ${dexContext || 'No trending data'}
- DEX Trending Pools (Uniswap/PancakeSwap/etc):
  ${geckoTrendingContext || 'No data'}
- New DEX Pools:
  ${newPoolsContext || 'No new pools'}
${context?.watchedTokens ? `- User Portfolio: ${context.watchedTokens.join(', ')}` : ''}
`;

    const prompt = `You are Clawf, ClawFi's crypto trading advisor. You help users make informed decisions about DeFi trading across multiple chains and launchpads.

DATA SOURCES:
- DexScreener - Real-time market data, trending tokens, price/volume across 80+ chains
- GeckoTerminal - DEX pool data from Uniswap, PancakeSwap, and all major DEXes
- Block Explorers - Etherscan, Basescan, BSCScan for contract verification & holder data
- Launchpad tokens - New launches from Clanker, Four.meme, Pump.fun
- Internal signals - Risk alerts, whale movements, liquidity changes

SUPPORTED DEXes:
- Uniswap (Ethereum, Base, Arbitrum, Polygon, etc.)
- PancakeSwap (BSC)
- Raydium (Solana)
- Aerodrome (Base)
- And 100+ more DEXes via GeckoTerminal

SUPPORTED PLATFORMS:
- Clanker (Base) - Base chain token launchpad
- Four.meme (BSC) - BNB Smart Chain meme token launchpad  
- Pump.fun (Solana) - Solana meme token launchpad
- DexScreener/GeckoTerminal - Universal market data aggregators

BLOCK EXPLORERS:
- Etherscan - Ethereum contract data
- Basescan - Base contract data  
- BSCScan - BNB Chain contract data

SUPPORTED CHAINS:
- Ethereum - Main EVM chain
- Base (EVM) - Layer 2 on Ethereum
- BSC/BNB Smart Chain (EVM) - Binance's chain
- Solana - High-speed non-EVM chain
- Arbitrum, Polygon, Optimism, Avalanche, and 80+ more

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
