/**
 * Pump.fun Token Sync Job
 * 
 * Monitors new token launches on Pump.fun (Solana)
 * and generates signals for new launches and graduations.
 */

import type { PrismaClient } from '@prisma/client';
import type { SignalService } from '../services/signal.js';
import { PumpFunConnector, createPumpFunConnector } from '@clawfi/connectors';

// ============================================
// Types
// ============================================

export interface PumpFunSyncConfig {
  enabled?: boolean;
  syncIntervalMs?: number;
  maxTokensPerSync?: number;
  trackGraduations?: boolean;
}

// ============================================
// Constants
// ============================================

const DEFAULT_CONFIG: Required<PumpFunSyncConfig> = {
  enabled: true,
  syncIntervalMs: 120000, // 2 minutes
  maxTokensPerSync: 50,
  trackGraduations: true,
};

// Track synced tokens to avoid duplicates
const syncedTokens = new Set<string>();
const graduatedTokens = new Set<string>();

// ============================================
// Pump.fun Sync Job
// ============================================

export class PumpFunSyncJob {
  private config: Required<PumpFunSyncConfig>;
  private connector: PumpFunConnector;
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly signalService: SignalService | null,
    config: Partial<PumpFunSyncConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.connector = createPumpFunConnector();
  }

  /**
   * Start the sync job
   */
  start(): void {
    if (!this.config.enabled || !this.connector.isEnabled()) {
      console.log('[PumpFunSync] Job disabled');
      return;
    }

    console.log('[PumpFunSync] Starting Solana token sync...');
    
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
   * Sync tokens from Pump.fun
   */
  async sync(): Promise<void> {
    try {
      // Check connector status
      const status = await this.connector.getStatus();
      if (!status.connected) {
        console.warn('[PumpFunSync] Connector not connected:', status.error);
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
        console.log(`[PumpFunSync] Synced ${tokens.length} tokens, ${newCount} new`);
      }

    } catch (error) {
      console.error('[PumpFunSync] Sync error:', error);
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
            chain: 'solana',
            tokenAddress: token.address,
          },
        },
        create: {
          chain: 'solana',
          tokenAddress: token.address,
          tokenSymbol: token.symbol,
          tokenName: token.name,
          launchpad: 'pumpfun',
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
        console.error('[PumpFunSync] Store token error:', error);
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
      title: `New Pump.fun launch: ${token.symbol}`,
      summary: `${token.name} ($${token.symbol}) launched on Solana via Pump.fun`,
      token: token.address,
      tokenSymbol: token.symbol,
      chain: 'solana',
      wallet: token.creator,
      strategyId: 'pumpfun-sync',
      evidence: {
        launchpad: 'pumpfun',
        creator: token.creator,
        marketCapUsd: token.marketCapUsd,
        graduated: token.extensions?.graduated,
      },
      recommendedAction: 'monitor',
    });
  }

  /**
   * Check for new graduations to Raydium
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
            title: `${token.symbol} graduated to Raydium`,
            summary: `${token.name} completed bonding curve and is now trading on Raydium`,
            token: token.address,
            tokenSymbol: token.symbol,
            chain: 'solana',
            strategyId: 'pumpfun-sync',
            evidence: {
              launchpad: 'pumpfun',
              raydiumPool: token.extensions?.raydiumPool,
              marketCapUsd: token.marketCapUsd,
            },
            recommendedAction: 'monitor',
          });

          console.log(`[PumpFunSync] Token graduated: ${token.symbol}`);
        }
      }
    } catch (error) {
      console.error('[PumpFunSync] Check graduations error:', error);
    }
  }
}

/**
 * Create Pump.fun sync job from environment
 */
export function createPumpFunSyncJob(
  prisma: PrismaClient,
  signalService: SignalService | null
): PumpFunSyncJob {
  return new PumpFunSyncJob(prisma, signalService, {
    enabled: process.env.PUMPFUN_SYNC_ENABLED !== 'false',
    syncIntervalMs: parseInt(process.env.PUMPFUN_SYNC_INTERVAL_MS || '120000', 10),
    trackGraduations: process.env.PUMPFUN_TRACK_GRADUATIONS !== 'false',
  });
}
