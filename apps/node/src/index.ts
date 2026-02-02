/**
 * ClawFi Node - Main Entry Point
 * v0.1.1 - Trust & Intelligence
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

import { createVaultFromEnv } from '@clawfi/vault';
import { registerAuthRoutes } from './routes/auth.js';
import { registerConnectorRoutes } from './routes/connectors.js';
import { registerStrategyRoutes } from './routes/strategies.js';
import { registerSignalRoutes } from './routes/signals.js';
import { registerRiskRoutes } from './routes/risk.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerLaunchpadRoutes } from './routes/launchpads.js';
import { registerMetricsRoutes } from './routes/metrics.js';
import { registerAgentRoutes } from './routes/agent.js';
import { registerDevRoutes } from './routes/dev.js';
import { dexscreenerRoutes } from './routes/dexscreener.js';
import clawfRoutes from './routes/clawf.js';
import { registerWebSocket } from './ws/index.js';
import { AuditService } from './services/audit.js';
import { RiskEngine } from './services/risk.js';
import { SignalService } from './services/signal.js';
import { StrategyScheduler } from './services/scheduler.js';
import { ConnectorRegistry, createConnectorRegistry } from './connectors/registry.js';
import { TelegramNotifier, createTelegramNotifier } from './notifiers/telegram.js';
import { LaunchCoverageJob, createLaunchCoverageJob } from './jobs/launchCoverage.js';
import { EarlyDistributionAnalyzer, createEarlyDistributionAnalyzer } from './jobs/earlyDistribution.js';
import { LiquidityRiskDetector, createLiquidityRiskDetector } from './jobs/liquidityRisk.js';
import { ClankerSyncJob, createClankerSyncJob } from './jobs/clankerSync.js';
import { FourMemeSyncJob, createFourMemeSyncJob } from './jobs/fourmemeSync.js';
import { PumpFunSyncJob, createPumpFunSyncJob } from './jobs/pumpfunSync.js';
import { config } from './config.js';

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    vault: ReturnType<typeof createVaultFromEnv>;
    auditService: AuditService;
    riskEngine: RiskEngine;
    signalService: SignalService;
    strategyScheduler: StrategyScheduler;
    connectorRegistry: ConnectorRegistry;
    telegramNotifier: TelegramNotifier;
    coverageJob: LaunchCoverageJob | null;
    distributionAnalyzer: EarlyDistributionAnalyzer | null;
    liquidityDetector: LiquidityRiskDetector | null;
    clankerSyncJob: ClankerSyncJob | null;
    fourMemeSyncJob: FourMemeSyncJob | null;
    pumpFunSyncJob: PumpFunSyncJob | null;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string };
    user: { userId: string };
  }
}

async function main() {
  // Initialize Fastify
  const fastify = Fastify({
    logger: {
      level: config.nodeEnv === 'development' ? 'debug' : 'info',
      transport:
        config.nodeEnv === 'development'
          ? {
              target: 'pino-pretty',
              options: { colorize: true },
            }
          : undefined,
    },
  });

  // Initialize dependencies
  const prisma = new PrismaClient();
  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null, // Required for BullMQ
  });
  const vault = createVaultFromEnv();

  // Decorate Fastify with dependencies
  fastify.decorate('prisma', prisma);
  fastify.decorate('redis', redis);
  fastify.decorate('vault', vault);

  // Initialize services
  const auditService = new AuditService(prisma);
  const riskEngine = new RiskEngine(prisma);
  const signalService = new SignalService(prisma, redis);
  const strategyScheduler = new StrategyScheduler(prisma, redis, signalService);
  const telegramNotifier = createTelegramNotifier();
  const connectorRegistry = createConnectorRegistry(prisma, redis, signalService);

  fastify.decorate('auditService', auditService);
  fastify.decorate('riskEngine', riskEngine);
  fastify.decorate('signalService', signalService);
  fastify.decorate('strategyScheduler', strategyScheduler);
  fastify.decorate('connectorRegistry', connectorRegistry);
  fastify.decorate('telegramNotifier', telegramNotifier);
  
  // Initialize intelligence jobs as null (configured below)
  fastify.decorate('coverageJob', null);
  fastify.decorate('distributionAnalyzer', null);
  fastify.decorate('liquidityDetector', null);

  // Subscribe to signals for Telegram notifications
  signalService.subscribe(async (signal) => {
    if (telegramNotifier.isEnabled()) {
      await telegramNotifier.notify(signal);
    }
  });

  // Register plugins
  await fastify.register(cors, {
    origin: config.nodeEnv === 'development' ? true : config.corsOrigins,
    credentials: true,
  });

  await fastify.register(jwt, {
    secret: config.jwtSecret,
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await fastify.register(websocket);

  // Health endpoint
  fastify.get('/health', async () => {
    return {
      success: true,
      data: {
        status: 'ok',
        version: '0.2.0',
        timestamp: Date.now(),
      },
    };
  });

  // System status endpoint
  fastify.get('/status', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' },
      });
    }

    const [
      policy,
      connectorsCount,
      strategiesCount,
      signalsToday,
      launchpadTokens,
      latestCoverage,
    ] = await Promise.all([
      prisma.riskPolicy.findFirst(),
      prisma.connector.count({ where: { enabled: true } }),
      prisma.strategy.count({ where: { status: 'enabled' } }),
      prisma.signal.count({
        where: {
          ts: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      prisma.launchpadToken.count(),
      prisma.launchpadCoverage.findFirst({
        where: { chain: 'base', launchpad: 'clanker' },
        orderBy: { windowEnd: 'desc' },
      }),
    ]);

    return {
      success: true,
      data: {
        version: '0.2.0',
        killSwitchActive: policy?.killSwitchActive ?? false,
        activeConnectors: connectorsCount,
        activeStrategies: strategiesCount,
        signalsToday,
        launchpadTokens,
        telegramEnabled: telegramNotifier.isEnabled(),
        launchCoverage: latestCoverage ? {
          percent: latestCoverage.coveragePercent,
          status: latestCoverage.coveragePercent >= 90 ? 'healthy' :
                  latestCoverage.coveragePercent >= 80 ? 'warning' : 'critical',
        } : null,
      },
    };
  });

  // Register routes
  await registerAuthRoutes(fastify);
  await registerConnectorRoutes(fastify);
  await registerStrategyRoutes(fastify);
  await registerSignalRoutes(fastify);
  await registerRiskRoutes(fastify);
  await registerAuditRoutes(fastify);
  await registerLaunchpadRoutes(fastify);
  await registerMetricsRoutes(fastify);
  await registerAgentRoutes(fastify);
  await fastify.register(dexscreenerRoutes);
  await fastify.register(clawfRoutes);

  // Dev routes (only in development)
  if (config.devMode) {
    await registerDevRoutes(fastify);
  }

  // Register WebSocket
  await registerWebSocket(fastify);

  // Graceful shutdown
  const shutdown = async () => {
    fastify.log.info('Shutting down...');
    
    // Stop intelligence jobs
    fastify.coverageJob?.stop();
    fastify.distributionAnalyzer?.stop();
    fastify.liquidityDetector?.stop();
    fastify.clankerSyncJob?.stop();
    fastify.fourMemeSyncJob?.stop();
    fastify.pumpFunSyncJob?.stop();
    
    connectorRegistry.stopAll();
    await strategyScheduler.stop();
    await prisma.$disconnect();
    await redis.quit();
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start services
  await riskEngine.initialize();
  await strategyScheduler.start();

  // Initialize connector registry and intelligence jobs
  const baseRpcUrl = process.env.BASE_RPC_URL;
  const clankerFactories = process.env.CLANKER_FACTORY_ADDRESSES?.split(',').filter(Boolean) || [];
  const clankerEnabled = process.env.CLANKER_ENABLED !== 'false';
  const intelligenceEnabled = process.env.INTELLIGENCE_ENABLED !== 'false';

  if (clankerEnabled && baseRpcUrl) {
    // Initialize Clanker connector if factories configured
    if (clankerFactories.length > 0) {
      await connectorRegistry.initialize({
        clanker: {
          rpcUrl: baseRpcUrl,
          factoryAddresses: clankerFactories,
          pollIntervalMs: parseInt(process.env.CLANKER_POLL_INTERVAL_MS || '10000', 10),
          maxBlocksPerScan: parseInt(process.env.CLANKER_MAX_BLOCKS_PER_SCAN || '100', 10),
          rateLimit: parseInt(process.env.CLANKER_RATE_LIMIT || '5', 10),
          eventTopics: process.env.CLANKER_EVENT_TOPICS?.split(',').filter(Boolean),
        },
      });
      connectorRegistry.startAll();
      fastify.log.info('Clanker connector initialized and started');
    }

    // Initialize intelligence jobs
    if (intelligenceEnabled) {
      // Launch coverage verification
      if (clankerFactories.length > 0) {
        const coverageJob = createLaunchCoverageJob(prisma, {
          rpcUrl: baseRpcUrl,
          factoryAddresses: clankerFactories,
          windowHours: parseInt(process.env.COVERAGE_WINDOW_HOURS || '24', 10),
          rateLimit: parseInt(process.env.INTELLIGENCE_RATE_LIMIT || '3', 10),
        });
        fastify.coverageJob = coverageJob;
        coverageJob.start(60); // Run every hour
        fastify.log.info('Launch coverage job started');
      }

      // Early distribution analyzer
      const distributionAnalyzer = createEarlyDistributionAnalyzer(prisma, signalService, {
        rpcUrl: baseRpcUrl,
        analysisWindowMinutes: parseInt(process.env.DISTRIBUTION_WINDOW_MINUTES || '60', 10),
        top10Threshold: parseFloat(process.env.DISTRIBUTION_TOP10_THRESHOLD || '40'),
        creatorThreshold: parseFloat(process.env.DISTRIBUTION_CREATOR_THRESHOLD || '15'),
        rateLimit: parseInt(process.env.INTELLIGENCE_RATE_LIMIT || '3', 10),
      });
      fastify.distributionAnalyzer = distributionAnalyzer;
      distributionAnalyzer.start(5); // Run every 5 minutes
      fastify.log.info('Early distribution analyzer started');

      // Liquidity risk detector
      const liquidityDetector = createLiquidityRiskDetector(prisma, signalService, {
        rpcUrl: baseRpcUrl,
        monitorWindowHours: parseInt(process.env.LIQUIDITY_MONITOR_HOURS || '24', 10),
        dropThresholdPercent: parseFloat(process.env.LIQUIDITY_DROP_THRESHOLD || '50'),
        rateLimit: parseInt(process.env.INTELLIGENCE_RATE_LIMIT || '3', 10),
      });
      fastify.liquidityDetector = liquidityDetector;
      liquidityDetector.start(10); // Run every 10 minutes
      fastify.log.info('Liquidity risk detector started');

      // Clanker token sync job - syncs tokens from Clanker API for analysis
      // Also generates real-time signals based on token metadata
      const clankerSyncJob = createClankerSyncJob(prisma, signalService, {
        syncIntervalMinutes: parseInt(process.env.CLANKER_SYNC_INTERVAL_MINUTES || '2', 10),
        tokensPerSync: parseInt(process.env.CLANKER_TOKENS_PER_SYNC || '20', 10),
      });
      fastify.clankerSyncJob = clankerSyncJob;
      clankerSyncJob.start();
      fastify.log.info('Clanker sync job started');

      // Initial batch sync to populate database
      clankerSyncJob.syncBatch(50).then(count => {
        fastify.log.info(`Initial Clanker sync: ${count} new tokens`);
      }).catch(err => {
        fastify.log.warn('Initial Clanker sync failed:', err);
      });
    }
  } else {
    fastify.log.info('Clanker features disabled or BASE_RPC_URL not configured');
  }

  // Four.meme sync job (BSC)
  const fourMemeEnabled = process.env.FOURMEME_ENABLED !== 'false';
  if (fourMemeEnabled) {
    const fourMemeSyncJob = createFourMemeSyncJob(prisma, signalService, {
      enabled: true,
      syncIntervalMs: parseInt(process.env.FOURMEME_SYNC_INTERVAL_MS || '120000', 10),
    });
    fastify.fourMemeSyncJob = fourMemeSyncJob;
    fourMemeSyncJob.start();
    fastify.log.info('Four.meme sync job started (BSC)');
  } else {
    fastify.fourMemeSyncJob = null;
    fastify.log.info('Four.meme sync disabled');
  }

  // Pump.fun sync job (Solana)
  const pumpFunEnabled = process.env.PUMPFUN_ENABLED !== 'false';
  if (pumpFunEnabled) {
    const pumpFunSyncJob = createPumpFunSyncJob(prisma, signalService, {
      enabled: true,
      syncIntervalMs: parseInt(process.env.PUMPFUN_SYNC_INTERVAL_MS || '120000', 10),
    });
    fastify.pumpFunSyncJob = pumpFunSyncJob;
    pumpFunSyncJob.start();
    fastify.log.info('Pump.fun sync job started (Solana)');
  } else {
    fastify.pumpFunSyncJob = null;
    fastify.log.info('Pump.fun sync disabled');
  }

  // Test Telegram connection
  if (telegramNotifier.isEnabled()) {
    fastify.log.info('Telegram notifications enabled');
  }

  // Log startup audit
  await auditService.log({
    action: 'system_start',
    success: true,
    details: {
      version: '0.1.1',
      devMode: config.devMode,
      telegramEnabled: telegramNotifier.isEnabled(),
      clankerEnabled: clankerEnabled && clankerFactories.length > 0,
      fourMemeEnabled,
      pumpFunEnabled,
      intelligenceEnabled,
    },
  });

  // Start server
  try {
    await fastify.listen({ port: config.port, host: config.host });
    fastify.log.info(`ClawFi Node v0.1.1 running on http://${config.host}:${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
