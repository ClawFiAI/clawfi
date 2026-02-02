/**
 * ClawF Wallet Intelligence
 * 
 * Analyzes wallet participation in token trades to identify:
 * - Old/Established wallets (>= 6 months or 100+ txns)
 * - Profitable wallets (positive historical PnL)
 * 
 * RULES:
 * - Wallet presence affects RiskScore and confidence ONLY
 * - Does NOT force inclusion/exclusion
 * - Flags BOT_HEAVY_ACTIVITY if zero old/profitable + high volume
 */

import {
  WalletIntelligence,
  WalletClassification,
  ClawFConfig,
  DEFAULT_CONFIG,
  SupportedChain,
} from './types.js';

// ============================================
// Block Explorer APIs
// ============================================

const EXPLORER_APIS: Record<string, { url: string; keyEnv: string }> = {
  ethereum: { url: 'https://api.etherscan.io/api', keyEnv: 'ETHERSCAN_API_KEY' },
  base: { url: 'https://api.basescan.org/api', keyEnv: 'ETHERSCAN_API_KEY' }, // Uses same key
  bsc: { url: 'https://api.bscscan.com/api', keyEnv: 'BSCSCAN_API_KEY' },
};

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// ============================================
// Caching
// ============================================

interface WalletCache {
  classification: WalletClassification;
  timestamp: number;
}

const walletCache = new Map<string, WalletCache>();
const CACHE_DURATION_MS = 3600000; // 1 hour for wallet data

// ============================================
// Rate Limiting
// ============================================

const lastRequestTime: Map<string, number> = new Map();
const MIN_REQUEST_INTERVAL_MS = 200; // 5 requests per second max

async function rateLimitedRequest(key: string): Promise<void> {
  const lastTime = lastRequestTime.get(key) || 0;
  const elapsed = Date.now() - lastTime;
  
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  
  lastRequestTime.set(key, Date.now());
}

// ============================================
// Wallet Intelligence Module
// ============================================

export class WalletIntelligenceModule {
  private config: ClawFConfig;
  private apiKeys: Map<string, string> = new Map();

  constructor(config: Partial<ClawFConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadApiKeys();
  }

  /**
   * Load API keys from environment
   */
  private loadApiKeys(): void {
    if (process.env.ETHERSCAN_API_KEY) {
      this.apiKeys.set('ethereum', process.env.ETHERSCAN_API_KEY);
      this.apiKeys.set('base', process.env.ETHERSCAN_API_KEY);
    }
    if (process.env.BSCSCAN_API_KEY) {
      this.apiKeys.set('bsc', process.env.BSCSCAN_API_KEY);
    }
    
    console.log(`🔍 Wallet Intelligence initialized with ${this.apiKeys.size} chain APIs`);
  }

  /**
   * Analyze wallet intelligence for token buyers
   */
  async analyzeTokenBuyers(
    tokenAddress: string,
    chain: SupportedChain,
    recentBuyers: string[]
  ): Promise<WalletIntelligence> {
    const classifications: WalletClassification[] = [];
    
    // Analyze each buyer (with rate limiting)
    for (const buyer of recentBuyers.slice(0, 50)) { // Limit to 50 wallets
      const classification = await this.classifyWallet(buyer, chain);
      if (classification) {
        classifications.push(classification);
      }
    }

    // Calculate aggregated metrics
    return this.aggregateIntelligence(classifications, recentBuyers.length);
  }

  /**
   * Classify a single wallet
   */
  async classifyWallet(
    walletAddress: string,
    chain: SupportedChain
  ): Promise<WalletClassification | null> {
    // Check cache
    const cacheKey = `${chain}-${walletAddress}`;
    const cached = this.getCachedClassification(cacheKey);
    if (cached) return cached;

    try {
      const classification: WalletClassification = {
        address: walletAddress,
        isOld: false,
        isProfitable: false,
      };

      if (chain === 'solana') {
        await this.classifySolanaWallet(walletAddress, classification);
      } else {
        await this.classifyEvmWallet(walletAddress, chain, classification);
      }

      // Cache result
      this.cacheClassification(cacheKey, classification);
      
      return classification;
    } catch (error) {
      console.error(`Wallet classification error for ${walletAddress}:`, error);
      return null;
    }
  }

  /**
   * Classify EVM wallet (Ethereum, Base, BSC)
   */
  private async classifyEvmWallet(
    address: string,
    chain: SupportedChain,
    classification: WalletClassification
  ): Promise<void> {
    const explorerConfig = EXPLORER_APIS[chain];
    if (!explorerConfig) return;

    const apiKey = this.apiKeys.get(chain);
    if (!apiKey) return;

    await rateLimitedRequest(chain);

    try {
      // Get transaction list
      const response = await fetch(
        `${explorerConfig.url}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=100&sort=asc&apikey=${apiKey}`
      );
      
      if (!response.ok) return;
      
      const data = await response.json() as ExplorerResponse;
      
      if (data.status !== '1' || !data.result || !Array.isArray(data.result)) {
        return;
      }

      const txns = data.result;
      classification.transactionCount = txns.length;

      // Check first activity age
      if (txns.length > 0) {
        const firstTxTimestamp = parseInt(txns[0].timeStamp) * 1000;
        const ageMs = Date.now() - firstTxTimestamp;
        classification.firstActivity = new Date(firstTxTimestamp);
        
        // Old if >= 6 months
        if (ageMs >= this.config.oldWalletMinAge * 1000) {
          classification.isOld = true;
        }
      }

      // Old if >= 100 transactions
      if (txns.length >= this.config.oldWalletMinTxns) {
        classification.isOld = true;
      }

      // Count distinct contracts interacted with
      const contracts = new Set(txns.map(tx => tx.to?.toLowerCase()).filter(Boolean));
      classification.distinctContracts = contracts.size;

      // Old if >= 20 distinct contracts
      if (contracts.size >= this.config.oldWalletMinContracts) {
        classification.isOld = true;
      }

      // Estimate profitability (simplified heuristic)
      // A wallet is considered "profitable" if it has:
      // - Multiple token transactions
      // - Been active over time
      // - Not just a single large transaction
      const hasTokenActivity = txns.some(tx => 
        tx.input && tx.input.length > 10 && tx.input !== '0x'
      );
      
      if (hasTokenActivity && classification.isOld && txns.length > 20) {
        // Heuristic: old wallets with lots of token activity are likely traders
        // This is a simplification - full PnL tracking requires token transfer analysis
        classification.isProfitable = true;
      }

    } catch (error) {
      console.error(`EVM wallet classification error:`, error);
    }
  }

  /**
   * Classify Solana wallet
   */
  private async classifySolanaWallet(
    address: string,
    classification: WalletClassification
  ): Promise<void> {
    await rateLimitedRequest('solana');

    try {
      // Get transaction signatures
      const response = await fetch(SOLANA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignaturesForAddress',
          params: [address, { limit: 100 }],
        }),
      });

      if (!response.ok) return;

      const data = await response.json() as SolanaRpcResponse;
      
      if (!data.result || !Array.isArray(data.result)) {
        return;
      }

      const signatures = data.result;
      classification.transactionCount = signatures.length;

      // Check age from first transaction
      if (signatures.length > 0) {
        // Signatures are returned newest first
        const oldestSig = signatures[signatures.length - 1];
        if (oldestSig.blockTime) {
          const firstTxTimestamp = oldestSig.blockTime * 1000;
          const ageMs = Date.now() - firstTxTimestamp;
          classification.firstActivity = new Date(firstTxTimestamp);
          
          if (ageMs >= this.config.oldWalletMinAge * 1000) {
            classification.isOld = true;
          }
        }
      }

      // Old if >= 100 transactions
      if (signatures.length >= this.config.oldWalletMinTxns) {
        classification.isOld = true;
      }

      // Profitability heuristic for Solana
      // Full implementation would require parsing transaction details
      if (classification.isOld && signatures.length > 50) {
        classification.isProfitable = true;
      }

    } catch (error) {
      console.error(`Solana wallet classification error:`, error);
    }
  }

  /**
   * Aggregate wallet classifications into intelligence summary
   */
  private aggregateIntelligence(
    classifications: WalletClassification[],
    totalBuyers: number
  ): WalletIntelligence {
    const oldWallets = classifications.filter(c => c.isOld);
    const profitableWallets = classifications.filter(c => c.isProfitable);

    return {
      totalBuyers,
      oldWalletCount: oldWallets.length,
      profitableWalletCount: profitableWallets.length,
      oldWalletPercent: classifications.length > 0 
        ? (oldWallets.length / classifications.length) * 100 
        : 0,
      profitableWalletPercent: classifications.length > 0 
        ? (profitableWallets.length / classifications.length) * 100 
        : 0,
      // Volume share would require transaction amount analysis
      // Using count-based approximation
      volumeShareFromOldWallets: classifications.length > 0 
        ? (oldWallets.length / classifications.length) * 100 
        : 0,
      volumeShareFromProfitableWallets: classifications.length > 0 
        ? (profitableWallets.length / classifications.length) * 100 
        : 0,
      analyzedAt: new Date(),
      sampleOldWallets: oldWallets.slice(0, 5).map(w => w.address),
      sampleProfitableWallets: profitableWallets.slice(0, 5).map(w => w.address),
    };
  }

  /**
   * Get cached wallet classification
   */
  private getCachedClassification(key: string): WalletClassification | null {
    const cached = walletCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > CACHE_DURATION_MS) {
      walletCache.delete(key);
      return null;
    }
    return cached.classification;
  }

  /**
   * Cache wallet classification
   */
  private cacheClassification(key: string, classification: WalletClassification): void {
    walletCache.set(key, {
      classification,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if wallet analysis is likely to indicate bot activity
   */
  isBotHeavyActivity(intelligence: WalletIntelligence): boolean {
    // If no old/profitable wallets and high volume, likely bots
    return intelligence.totalBuyers > 50 &&
           intelligence.oldWalletCount === 0 &&
           intelligence.profitableWalletCount === 0;
  }

  /**
   * Get quick classification for a single wallet
   */
  async quickClassify(address: string, chain: SupportedChain): Promise<{
    isOld: boolean;
    isProfitable: boolean;
    confidence: 'low' | 'medium' | 'high';
  }> {
    const classification = await this.classifyWallet(address, chain);
    
    if (!classification) {
      return { isOld: false, isProfitable: false, confidence: 'low' };
    }

    // Determine confidence based on data availability
    let confidence: 'low' | 'medium' | 'high' = 'low';
    if (classification.transactionCount !== undefined) {
      confidence = classification.transactionCount > 50 ? 'high' : 'medium';
    }

    return {
      isOld: classification.isOld,
      isProfitable: classification.isProfitable,
      confidence,
    };
  }
}

// ============================================
// API Response Types
// ============================================

interface ExplorerResponse {
  status: string;
  message: string;
  result: ExplorerTransaction[] | string;
}

interface ExplorerTransaction {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  input: string;
  isError: string;
}

interface SolanaRpcResponse {
  jsonrpc: string;
  id: number;
  result?: SolanaSignature[];
}

interface SolanaSignature {
  signature: string;
  slot: number;
  blockTime?: number;
  err?: unknown;
}
