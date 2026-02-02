/**
 * ClawF API Routes
 * 
 * REST API endpoints for the ClawF intelligence agent.
 * 
 * Commands:
 * - GET  /clawf/radar          - Scan for moonshot candidates
 * - GET  /clawf/analyze/:token - Analyze specific token
 * - POST /clawf/track          - Start tracking a token
 * - GET  /clawf/positions      - Get tracked positions
 * - GET  /clawf/exits          - Check exit signals
 * - GET  /clawf/policy         - Get current policy
 * - PUT  /clawf/policy         - Update policy
 * - GET  /clawf/status         - Get ClawF status
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getClawF, SupportedChain, SUPPORTED_CHAINS } from '../services/clawf/index.js';

// ============================================
// Schemas
// ============================================

const RadarQuerySchema = z.object({
  chains: z.string().optional(), // comma-separated
  limit: z.string().optional().transform(v => v ? parseInt(v) : undefined),
  includeSocial: z.string().optional().transform(v => v === 'true'),
});

const TrackBodySchema = z.object({
  address: z.string().min(10),
  chain: z.enum(['base', 'ethereum', 'bsc', 'solana'] as const).optional(),
});

const PolicyUpdateSchema = z.object({
  minLiquidity: z.number().optional(),
  minConditionsToPass: z.number().min(1).max(5).optional(),
  volumeSpikeThreshold: z.number().optional(),
  buyPressureThreshold: z.number().min(0).max(1).optional(),
  profitTargets: z.array(z.number()).optional(),
  trailingStopPercent: z.number().min(1).max(100).optional(),
  trailingStopActivation: z.number().optional(),
  liquidityDropThreshold: z.number().min(1).max(100).optional(),
});

// ============================================
// Routes
// ============================================

export default async function clawfRoutes(fastify: FastifyInstance) {
  const clawf = getClawF();

  // Middleware to check auth (if needed)
  const requireAuth = async (request: any, reply: any) => {
    // ClawF endpoints can be public or auth-protected based on your needs
    // For now, we'll make them public for easy testing
  };

  /**
   * GET /clawf/radar
   * Scan for moonshot candidates
   */
  fastify.get('/clawf/radar', async (request, reply) => {
    const query = RadarQuerySchema.safeParse(request.query);
    
    if (!query.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' },
      });
    }

    try {
      const chains = query.data.chains
        ? query.data.chains.split(',').filter(c => SUPPORTED_CHAINS.includes(c as SupportedChain)) as SupportedChain[]
        : undefined;

      const { results, summary } = await clawf.radar({
        chains,
        limit: query.data.limit,
        includeSocial: query.data.includeSocial,
      });

      return {
        success: true,
        data: {
          count: results.length,
          candidates: results.map(r => ({
            ...r.candidate,
            conditionsPassed: r.conditionsPassed,
            conditionsTotal: r.conditionsTotal,
            conditions: r.conditions,
            qualifies: r.qualifies,
          })),
          summary,
        },
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'RADAR_ERROR',
          message: error instanceof Error ? error.message : 'Radar scan failed',
        },
      });
    }
  });

  /**
   * GET /clawf/analyze/:token
   * Analyze a specific token
   */
  fastify.get('/clawf/analyze/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const { chain } = request.query as { chain?: SupportedChain };

    try {
      const { result, explanation } = await clawf.analyze(token, chain);

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Token not found or no DEX data' },
        });
      }

      return {
        success: true,
        data: {
          candidate: result.candidate,
          conditionsPassed: result.conditionsPassed,
          conditionsTotal: result.conditionsTotal,
          conditions: result.conditions,
          qualifies: result.qualifies,
          explanation,
        },
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'ANALYZE_ERROR',
          message: error instanceof Error ? error.message : 'Analysis failed',
        },
      });
    }
  });

  /**
   * POST /clawf/track
   * Start tracking a token
   */
  fastify.post('/clawf/track', async (request, reply) => {
    const body = TrackBodySchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' },
      });
    }

    try {
      const { position, message } = await clawf.track(body.data.address, body.data.chain);

      if (!position) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message },
        });
      }

      return {
        success: true,
        data: { position, message },
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'TRACK_ERROR',
          message: error instanceof Error ? error.message : 'Tracking failed',
        },
      });
    }
  });

  /**
   * GET /clawf/positions
   * Get all tracked positions
   */
  fastify.get('/clawf/positions', async (request, reply) => {
    try {
      const { positions, summary } = await clawf.getPositions();

      return {
        success: true,
        data: {
          count: positions.length,
          positions,
          summary,
        },
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'POSITIONS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get positions',
        },
      });
    }
  });

  /**
   * GET /clawf/exits
   * Check exit signals for all positions
   */
  fastify.get('/clawf/exits', async (request, reply) => {
    try {
      const { signals, summary } = await clawf.checkExits();

      return {
        success: true,
        data: {
          signalCount: signals.length,
          signals: signals.map(s => ({
            position: s.position,
            signal: s.signal,
          })),
          summary,
        },
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'EXITS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check exits',
        },
      });
    }
  });

  /**
   * GET /clawf/policy
   * Get current policy configuration
   */
  fastify.get('/clawf/policy', async (request, reply) => {
    const { config, summary } = clawf.getPolicy();

    return {
      success: true,
      data: { config, summary },
    };
  });

  /**
   * PUT /clawf/policy
   * Update policy configuration
   */
  fastify.put('/clawf/policy', async (request, reply) => {
    const body = PolicyUpdateSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid policy update' },
      });
    }

    try {
      clawf.updatePolicy(body.data);
      const { config, summary } = clawf.getPolicy();

      return {
        success: true,
        data: { config, summary, message: 'Policy updated' },
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'POLICY_ERROR',
          message: error instanceof Error ? error.message : 'Policy update failed',
        },
      });
    }
  });

  /**
   * GET /clawf/status
   * Get ClawF status
   */
  fastify.get('/clawf/status', async (request, reply) => {
    const status = clawf.getStatus();

    return {
      success: true,
      data: status,
    };
  });

  /**
   * POST /clawf/start
   * Start continuous radar scanning
   */
  fastify.post('/clawf/start', async (request, reply) => {
    const { interval } = request.body as { interval?: number };
    
    clawf.startContinuousRadar(interval || 60000);

    return {
      success: true,
      data: { message: 'ClawF continuous radar started' },
    };
  });

  /**
   * POST /clawf/stop
   * Stop continuous radar scanning
   */
  fastify.post('/clawf/stop', async (request, reply) => {
    clawf.stopContinuousRadar();

    return {
      success: true,
      data: { message: 'ClawF continuous radar stopped' },
    };
  });

  /**
   * GET /clawf/gems
   * 100x GEM HUNTER - Scan for ultra-early tokens with 100x potential
   * Focuses on: ultra-low mcap, fresh launches, viral activity, strong buy pressure
   */
  fastify.get('/clawf/gems', async (request, reply) => {
    const query = RadarQuerySchema.safeParse(request.query);
    
    if (!query.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' },
      });
    }

    try {
      const chains = query.data.chains
        ? query.data.chains.split(',').filter(c => SUPPORTED_CHAINS.includes(c as SupportedChain)) as SupportedChain[]
        : ['solana', 'base'] as SupportedChain[];

      const results = await clawf.scanGems({
        chains,
        limit: query.data.limit || 15,
      });

      return {
        success: true,
        data: {
          count: results.length,
          mode: '100x GEM HUNTER',
          description: 'Ultra-early tokens with 100x potential. Focus on ultra-low mcap, fresh launches, strong buying.',
          gems: results.map(r => ({
            ...r.candidate,
            conditionsPassed: r.conditionsPassed,
            conditionsTotal: r.conditionsTotal,
            conditions: r.conditions,
            qualifies: r.qualifies,
          })),
        },
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'GEM_HUNTER_ERROR',
          message: error instanceof Error ? error.message : 'Gem scan failed',
        },
      });
    }
  });
}
