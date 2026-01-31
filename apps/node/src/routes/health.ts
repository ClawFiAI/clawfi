/**
 * Health Check Routes
 * 
 * Provides comprehensive health monitoring endpoints for:
 * - Basic liveness checks
 * - Readiness checks (dependencies)
 * - Detailed system health
 */

import type { FastifyInstance } from 'fastify';
import os from 'os';

// ============================================
// Types
// ============================================

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  version: string;
  uptime: number;
}

interface DependencyHealth {
  name: string;
  status: 'connected' | 'degraded' | 'disconnected';
  latencyMs?: number;
  error?: string;
}

interface SystemHealth extends HealthStatus {
  dependencies: DependencyHealth[];
  system: {
    platform: string;
    nodeVersion: string;
    cpuUsage: number;
    memoryUsage: {
      used: number;
      total: number;
      percentage: number;
    };
    loadAverage: number[];
  };
  services: {
    signalsToday: number;
    activeConnectors: number;
    activeStrategies: number;
    activeWebSockets: number;
  };
}

// ============================================
// Routes
// ============================================

export async function registerHealthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /health
   * Basic liveness check - always returns 200 if server is running
   */
  fastify.get('/health', async () => {
    return {
      success: true,
      data: {
        status: 'healthy',
        timestamp: Date.now(),
        version: process.env.npm_package_version || '0.2.0',
        uptime: process.uptime(),
      } satisfies HealthStatus,
    };
  });

  /**
   * GET /health/ready
   * Readiness check - verifies all dependencies are available
   */
  fastify.get('/health/ready', async (request, reply) => {
    const dependencies: DependencyHealth[] = [];
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check PostgreSQL
    const dbHealth = await checkDatabase(fastify);
    dependencies.push(dbHealth);
    if (dbHealth.status === 'disconnected') overallStatus = 'unhealthy';
    else if (dbHealth.status === 'degraded') overallStatus = 'degraded';

    // Check Redis
    const redisHealth = await checkRedis(fastify);
    dependencies.push(redisHealth);
    if (redisHealth.status === 'disconnected') overallStatus = 'unhealthy';
    else if (redisHealth.status === 'degraded' && overallStatus !== 'unhealthy') {
      overallStatus = 'degraded';
    }

    // Return appropriate status code
    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

    return reply.status(statusCode).send({
      success: overallStatus !== 'unhealthy',
      data: {
        status: overallStatus,
        timestamp: Date.now(),
        version: process.env.npm_package_version || '0.2.0',
        uptime: process.uptime(),
        dependencies,
      },
    });
  });

  /**
   * GET /health/detailed
   * Detailed health check with system metrics (requires auth)
   */
  fastify.get('/health/detailed', async (request, reply) => {
    // Optional auth for detailed health
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const dependencies: DependencyHealth[] = [];
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check all dependencies
    const [dbHealth, redisHealth, connectorsHealth] = await Promise.all([
      checkDatabase(fastify),
      checkRedis(fastify),
      checkConnectors(fastify),
    ]);

    dependencies.push(dbHealth, redisHealth, ...connectorsHealth);

    // Determine overall status
    for (const dep of dependencies) {
      if (dep.status === 'disconnected') {
        overallStatus = 'unhealthy';
        break;
      }
      if (dep.status === 'degraded') {
        overallStatus = 'degraded';
      }
    }

    // Get service metrics
    const [signalsToday, strategiesCount] = await Promise.all([
      fastify.prisma.signal.count({
        where: { ts: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      fastify.prisma.strategy.count({ where: { status: 'enabled' } }),
    ]);

    const connectors = await fastify.connectorRegistry.getAllUnified();
    const activeConnectors = connectors.filter(c => c.status === 'connected').length;

    // Get WebSocket stats (if available)
    let wsStats = { activeConnections: 0 };
    try {
      const { getWebSocketStats } = await import('../ws/index.js');
      wsStats = getWebSocketStats();
    } catch {
      // WebSocket module may not export stats
    }

    // System metrics
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const response: SystemHealth = {
      status: overallStatus,
      timestamp: Date.now(),
      version: process.env.npm_package_version || '0.2.0',
      uptime: process.uptime(),
      dependencies,
      system: {
        platform: `${os.platform()} ${os.arch()}`,
        nodeVersion: process.version,
        cpuUsage: process.cpuUsage().user / 1000000, // Convert to seconds
        memoryUsage: {
          used: usedMem,
          total: totalMem,
          percentage: Math.round((usedMem / totalMem) * 100),
        },
        loadAverage: os.loadavg(),
      },
      services: {
        signalsToday,
        activeConnectors,
        activeStrategies: strategiesCount,
        activeWebSockets: wsStats.activeConnections,
      },
    };

    return {
      success: overallStatus !== 'unhealthy',
      data: response,
    };
  });

  /**
   * GET /health/live
   * Kubernetes liveness probe endpoint
   */
  fastify.get('/health/live', async () => {
    return { status: 'ok' };
  });
}

// ============================================
// Dependency Checks
// ============================================

async function checkDatabase(fastify: FastifyInstance): Promise<DependencyHealth> {
  const start = Date.now();
  
  try {
    await fastify.prisma.$queryRaw`SELECT 1`;
    return {
      name: 'postgresql',
      status: 'connected',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'postgresql',
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkRedis(fastify: FastifyInstance): Promise<DependencyHealth> {
  const start = Date.now();
  
  try {
    const result = await fastify.redis.ping();
    if (result === 'PONG') {
      return {
        name: 'redis',
        status: 'connected',
        latencyMs: Date.now() - start,
      };
    }
    return {
      name: 'redis',
      status: 'degraded',
      latencyMs: Date.now() - start,
      error: `Unexpected response: ${result}`,
    };
  } catch (error) {
    return {
      name: 'redis',
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkConnectors(fastify: FastifyInstance): Promise<DependencyHealth[]> {
  const results: DependencyHealth[] = [];
  
  try {
    const connectors = await fastify.connectorRegistry.getAllUnified();
    
    for (const connector of connectors) {
      results.push({
        name: `connector:${connector.name}`,
        status: connector.status === 'connected' ? 'connected' 
          : connector.status === 'degraded' ? 'degraded' 
          : 'disconnected',
        latencyMs: connector.lastCheckMs,
      });
    }
  } catch (error) {
    results.push({
      name: 'connectors',
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
  
  return results;
}
