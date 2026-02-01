/**
 * Four.meme Token Sync Job
 * 
 * Monitors new token launches on Four.meme (BSC)
 * and generates signals for new launches and graduations.
 */

import type { PrismaClient } from '@prisma/client';
import type { SignalService } from '../services/signal.js';
import { FourMemeConnector, createFourMemeConnector } from '@clawfi/connectors';

// ============================================
// Types
// ============================================

export interface FourMemeSyncConfig {
  enabled?: boolean;
  syncIntervalMs?: number;
  maxTokensPerSync?: number;
  trackGraduations?: boolean;
}

// ============================================
// Constants
// ============================================

const DEFAULT_CONFIG: Required<FourMemeSyncConfig> = {
  enabled: true,
  syncIntervalMs: 120000, // 2 minutes
  maxTokensPerSync: 50,
  trackGraduations: true,
};

// Track synced tokens to avoid duplicates
const syncedTokens = new Set<string>();
const graduatedTokens = new Set<string>();

// ============================================
// Four.meme Sync Job
// ============================================

export class FourMemeSyncJob {
  private config: Required<FourMemeSyncConfig>;
  private connector: FourMemeConnector;
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly signalService: SignalService | null,
    config: Partial<FourMemeSyncConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.connector = createFourMemeConnector();
  }

  /**
   * Start the sync job
   */
  start(): void {
    if (!this.config.enabled || !this.connector.isEnabled()) {
      console.log('[FourMemeSync] Job disabled');
      return;
    }

    console.log('[FourMemeSync] Starting BSC token sync...');
    
    // Run immediately
    this.sync().catch(console.error);
    
    // Then run on interval
    this.intervalId = setInterval(() => {
      this.sync().catch(console.error);
    }, this.config.syncIntervalMs);
  }

  /**
   * Stop the sync job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Sync tokens from Four.meme
   */
  async sync(): Promise<void> {
    try {
      // Check connector status
      const status = await this.connector.getStatus();
      if (!status.connected) {
        console.warn('[FourMemeSync] Connector not connected:', status.error);
        return;
      }

      // Fetch recent launches
      const tokens = await this.connector.fetchRecentLaunches(this.config.maxTokensPerSync);
      
      let newCount = 0;
      for (const token of tokens) {
        if (syncedTokens.has(token.address)) {
          continue;
        }

        syncedTokens.add(token.address);
        newCount++;

        // Store token in database
        await this.storeToken(token);

        // Generate launch signal
        if (this.signalService) {
          await this.generateLaunchSignal(token);
        }
      }

      // Track graduations
      if (this.config.trackGraduations) {
        await this.checkGraduations();
      }

      if (newCount > 0) {
        console.log(`[FourMemeSync] Synced ${tokens.length} tokens, ${newCount} new`);
      }

    } catch (error) {
      console.error('[FourMemeSync] Sync error:', error);
    }
  }

  /**
   * Store token in database
   */
  private async storeToken(token: {
    address: string;
    symbol: string;
    name: string;
    chain: string;
    launchpad: string;
    creator?: string;
    createdAt: Date;
    marketCapUsd?: number;
    imageUrl?: string;
    description?: string;
    extensions?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.launchpadToken.upsert({
        where: {
          chain_tokenAddress: {
            chain: 'bsc',
            tokenAddress: token.address,
          },
        },
        create: {
          chain: 'bsc',
          tokenAddress: token.address,
          tokenSymbol: token.symbol,
          tokenName: token.name,
          launchpad: 'fourmeme',
          creatorAddress: token.creator || 'unknown', // Required field
          txHash: `geckoterminal_${token.address}`, // Placeholder for API-sourced tokens
          blockNumber: BigInt(0), // Placeholder for API-sourced tokens
          blockTimestamp: token.createdAt,
          meta: {
            marketCapUsd: token.marketCapUsd,
            imageUrl: token.imageUrl,
            source: 'geckoterminal',
            ...token.extensions,
          },
        },
        update: {
          meta: {
            marketCapUsd: token.marketCapUsd,
            imageUrl: token.imageUrl,
            source: 'geckoterminal',
            ...token.extensions,
          },
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      // Ignore unique constraint errors
      if (!(error instanceof Error && error.message.includes('Unique constraint'))) {
        console.error('[FourMemeSync] Store token error:', error);
      }
    }
  }

  /**
   * Generate launch signal
   */
  private async generateLaunchSignal(token: {
    address: string;
    symbol: string;
    name: string;
    creator?: string;
    marketCapUsd?: number;
    extensions?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.signalService) return;

    await this.signalService.create({
      severity: 'info',
      signalType: 'LaunchDetected',
      title: `New Four.meme launch: ${token.symbol}`,
      summary: `${token.name} ($${token.symbol}) launched on BSC via Four.meme`,
      token: token.address,
      tokenSymbol: token.symbol,
      chain: 'bsc',
      wallet: token.creator,
      strategyId: 'fourmeme-sync',
      evidence: {
        launchpad: 'fourmeme',
        creator: token.creator,
        marketCapUsd: token.marketCapUsd,
        graduated: token.extensions?.graduated,
        holders: token.extensions?.holders,
      },
      recommendedAction: 'monitor',
    });
  }

  /**
   * Check for new graduations to PancakeSwap
   */
  private async checkGraduations(): Promise<void> {
    try {
      const graduated = await this.connector.fetchGraduatedTokens(20);
      
      for (const token of graduated) {
        if (graduatedTokens.has(token.address)) {
          continue;
        }

        graduatedTokens.add(token.address);

        // Generate graduation signal
        if (this.signalService) {
          await this.signalService.create({
            severity: 'medium',
            signalType: 'TokenGraduated',
            title: `${token.symbol} graduated to PancakeSwap`,
            summary: `${token.name} completed bonding curve and is now trading on PancakeSwap`,
            token: token.address,
            tokenSymbol: token.symbol,
            chain: 'bsc',
            strategyId: 'fourmeme-sync',
            evidence: {
              launchpad: 'fourmeme',
              pancakePool: token.extensions?.pancakePool,
              marketCapUsd: token.marketCapUsd,
              holders: token.extensions?.holders,
            },
            recommendedAction: 'monitor',
          });

          console.log(`[FourMemeSync] Token graduated: ${token.symbol}`);
        }
      }
    } catch (error) {
      console.error('[FourMemeSync] Check graduations error:', error);
    }
  }
}

/**
 * Create Four.meme sync job from environment
 */
export function createFourMemeSyncJob(
  prisma: PrismaClient,
  signalService: SignalService | null
): FourMemeSyncJob {
  return new FourMemeSyncJob(prisma, signalService, {
    enabled: process.env.FOURMEME_SYNC_ENABLED !== 'false',
    syncIntervalMs: parseInt(process.env.FOURMEME_SYNC_INTERVAL_MS || '120000', 10),
    trackGraduations: process.env.FOURMEME_TRACK_GRADUATIONS !== 'false',
  });
}
