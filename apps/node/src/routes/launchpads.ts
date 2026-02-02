/**
 * Launchpad Routes
 * 
 * API endpoints for launchpad token data
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ============================================
// Types
// ============================================

interface ListParams {
  chain?: string;
  launchpad?: string;
  graduated?: string;
  limit?: string;
  offset?: string;
  sortBy?: 'createdAt' | 'marketCap' | 'launchTime';
  sortOrder?: 'asc' | 'desc';
}

interface TokenParams {
  chain: string;
  address: string;
}

// ============================================
// Routes
// ============================================

export async function registerLaunchpadRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /launchpads/tokens
   * List launchpad tokens with filtering
   */
  fastify.get('/launchpads/tokens', async (request: FastifyRequest<{ Querystring: ListParams }>, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const { 
      chain, 
      launchpad, 
      graduated, 
      limit = '50', 
      offset = '0',
      sortBy = 'launchTime',
      sortOrder = 'desc',
    } = request.query;

    const where: Record<string, unknown> = {};
    if (chain) where.chain = chain.toLowerCase();
    if (launchpad) where.launchpad = launchpad.toLowerCase();
    if (graduated !== undefined) where.graduated = graduated === 'true';

    const [tokens, total] = await Promise.all([
      fastify.prisma.launchpadToken.findMany({
        where,
        take: Math.min(parseInt(limit, 10), 100),
        skip: parseInt(offset, 10),
        orderBy: { [sortBy]: sortOrder },
      }),
      fastify.prisma.launchpadToken.count({ where }),
    ]);

    return {
      success: true,
      data: tokens,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      },
    };
  });

  /**
   * GET /launchpads/tokens/recent
   * Get recently launched tokens
   */
  fastify.get('/launchpads/tokens/recent', async (request: FastifyRequest<{ Querystring: { chain?: string; launchpad?: string; limit?: string } }>, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const { chain, launchpad, limit = '20' } = request.query;

    const where: Record<string, unknown> = {};
    if (chain) where.chain = chain.toLowerCase();
    if (launchpad) where.launchpad = launchpad.toLowerCase();

    // Get tokens launched in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    where.launchTime = { gte: oneDayAgo };

    const tokens = await fastify.prisma.launchpadToken.findMany({
      where,
      take: Math.min(parseInt(limit, 10), 50),
      orderBy: { launchTime: 'desc' },
    });

    return {
      success: true,
      data: tokens,
    };
  });

  /**
   * GET /launchpads/tokens/graduated
   * Get recently graduated tokens
   */
  fastify.get('/launchpads/tokens/graduated', async (request: FastifyRequest<{ Querystring: { chain?: string; launchpad?: string; limit?: string } }>, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const { chain, launchpad, limit = '20' } = request.query;

    const where: Record<string, unknown> = { graduated: true };
    if (chain) where.chain = chain.toLowerCase();
    if (launchpad) where.launchpad = launchpad.toLowerCase();

    const tokens = await fastify.prisma.launchpadToken.findMany({
      where,
      take: Math.min(parseInt(limit, 10), 50),
      orderBy: { graduatedAt: 'desc' },
    });

    return {
      success: true,
      data: tokens,
    };
  });

  /**
   * GET /launchpads/tokens/:chain/:address
   * Get specific launchpad token
   */
  fastify.get('/launchpads/tokens/:chain/:address', async (request: FastifyRequest<{ Params: TokenParams }>, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const { chain, address } = request.params;

    const token = await fastify.prisma.launchpadToken.findUnique({
      where: {
        chain_tokenAddress: {
          chain: chain.toLowerCase(),
          tokenAddress: address.toLowerCase(),
        },
      },
    });

    if (!token) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Token not found' },
      });
    }

    return { success: true, data: token };
  });

  /**
   * GET /launchpads/stats
   * Get launchpad statistics
   */
  fastify.get('/launchpads/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalTokens,
      graduatedCount,
      launchedToday,
      tokensByLaunchpad,
      tokensByChain,
    ] = await Promise.all([
      fastify.prisma.launchpadToken.count(),
      fastify.prisma.launchpadToken.count({ where: { graduated: true } }),
      fastify.prisma.launchpadToken.count({ where: { launchTime: { gte: oneDayAgo } } }),
      fastify.prisma.launchpadToken.groupBy({
        by: ['launchpad'],
        _count: { launchpad: true },
      }),
      fastify.prisma.launchpadToken.groupBy({
        by: ['chain'],
        _count: { chain: true },
      }),
    ]);

    return {
      success: true,
      data: {
        totalTokens,
        graduatedCount,
        launchedToday,
        byLaunchpad: tokensByLaunchpad.reduce((acc, g) => ({ 
          ...acc, 
          [g.launchpad]: g._count.launchpad 
        }), {} as Record<string, number>),
        byChain: tokensByChain.reduce((acc, g) => ({ 
          ...acc, 
          [g.chain]: g._count.chain 
        }), {} as Record<string, number>),
      },
    };
  });

  /**
   * GET /launchpads/connectors
   * Get launchpad connector status
   */
  fastify.get('/launchpads/connectors', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const connectors = [
      {
        id: 'clanker',
        name: 'Clanker',
        chain: 'base',
        enabled: process.env.CLANKER_ENABLED !== 'false',
        pollInterval: parseInt(process.env.CLANKER_POLL_INTERVAL_MS || '10000', 10),
      },
      {
        id: 'pumpfun',
        name: 'Pump.fun',
        chain: 'solana',
        enabled: process.env.PUMPFUN_ENABLED === 'true',
        pollInterval: parseInt(process.env.PUMPFUN_POLL_INTERVAL_MS || '120000', 10),
      },
      {
        id: 'fourmeme',
        name: 'Four.meme',
        chain: 'bsc',
        enabled: process.env.FOURMEME_ENABLED === 'true',
        pollInterval: parseInt(process.env.FOURMEME_POLL_INTERVAL_MS || '120000', 10),
      },
    ];

    return {
      success: true,
      data: connectors,
    };
  });

  // ============================================
  // Clanker API Proxy Routes
  // ============================================

  const CLANKER_API = 'https://www.clanker.world/api';

  /**
   * GET /launchpads/clanker/tokens
   * Proxy to Clanker API - get paginated tokens
   */
  fastify.get('/launchpads/clanker/tokens', async (request: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) => {
    try {
      const params = new URLSearchParams(request.query);
      const response = await fetch(`${CLANKER_API}/tokens?${params}`);
      
      if (!response.ok) {
        return reply.status(response.status).send({
          success: false,
          error: { code: 'CLANKER_ERROR', message: `Clanker API error: ${response.status}` },
        });
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Clanker proxy error:', error);
      return reply.status(500).send({
        success: false,
        error: { code: 'PROXY_ERROR', message: 'Failed to fetch from Clanker API' },
      });
    }
  });

  /**
   * GET /launchpads/clanker/token/:address
   * Proxy to Clanker API - get single token
   */
  fastify.get('/launchpads/clanker/token/:address', async (request: FastifyRequest<{ Params: { address: string } }>, reply: FastifyReply) => {
    try {
      const { address } = request.params;
      const response = await fetch(`${CLANKER_API}/tokens/${address}`);
      
      if (!response.ok) {
        return reply.status(response.status).send({
          success: false,
          error: { code: 'CLANKER_ERROR', message: `Clanker API error: ${response.status}` },
        });
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error('Clanker proxy error:', error);
      return reply.status(500).send({
        success: false,
        error: { code: 'PROXY_ERROR', message: 'Failed to fetch from Clanker API' },
      });
    }
  });

  /**
   * GET /launchpads/clanker/search
   * Proxy to Clanker API - search tokens/creators
   */
  fastify.get('/launchpads/clanker/search', async (request: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) => {
    try {
      const params = new URLSearchParams(request.query);
      const response = await fetch(`${CLANKER_API}/search?${params}`);
      
      if (!response.ok) {
        return reply.status(response.status).send({
          success: false,
          error: { code: 'CLANKER_ERROR', message: `Clanker API error: ${response.status}` },
        });
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Clanker proxy error:', error);
      return reply.status(500).send({
        success: false,
        error: { code: 'PROXY_ERROR', message: 'Failed to fetch from Clanker API' },
      });
    }
  });
}
