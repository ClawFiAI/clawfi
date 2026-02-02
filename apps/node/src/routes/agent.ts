/**
 * Agent Routes - OpenClaw-style Command Interface
 * 
 * Provides a simple command interface for controlling ClawFi:
 * - watch token/wallet
 * - enable/disable strategy
 * - killswitch on/off
 * - status
 * - AI-powered analysis and advice
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AIService, type TokenData, type MoonshotCandidate } from '../services/ai.js';

// ============================================
// Command Schemas
// ============================================

const CommandSchema = z.object({
  command: z.string().min(1).max(500),
  args: z.record(z.unknown()).optional(),
});

// ============================================
// Command Parser
// ============================================

interface ParsedCommand {
  action: string;
  target?: string;
  args: Record<string, unknown>;
}

function parseCommand(input: string): ParsedCommand {
  const parts = input.trim().split(/\s+/);
  const action = (parts[0] || '').toLowerCase();
  
  // Handle multi-word actions
  if (action === 'watch' && parts.length >= 3) {
    return {
      action: `watch_${parts[1]?.toLowerCase()}`, // watch_token or watch_wallet
      target: parts[2],
      args: { chain: parts[3]?.toLowerCase() || 'base' },
    };
  }
  
  if ((action === 'enable' || action === 'disable') && parts.length >= 3) {
    return {
      action: `${action}_${parts[1]?.toLowerCase()}`, // enable_strategy or disable_strategy
      target: parts[2],
      args: {},
    };
  }
  
  if (action === 'killswitch') {
    return {
      action: 'killswitch',
      target: parts[1]?.toLowerCase(), // 'on' or 'off'
      args: {},
    };
  }
  
  if (action === 'unwatch' && parts.length >= 3) {
    return {
      action: `unwatch_${parts[1]?.toLowerCase()}`,
      target: parts[2],
      args: { chain: parts[3]?.toLowerCase() || 'base' },
    };
  }

  // AI Commands - analyze preserves case for addresses
  if (action === 'analyze') {
    return {
      action: 'analyze',
      target: parts[1], // token address - preserve case
      args: { chain: parts[2]?.toLowerCase() || 'base' },
    };
  }

  // AI Commands - ask combines all remaining words as the question
  if (action === 'ask') {
    const question = parts.slice(1).join(' ');
    return {
      action: 'ask',
      target: question,
      args: {},
    };
  }

  // AI Commands - rate signal
  if (action === 'rate') {
    return {
      action: 'rate',
      target: parts[1], // signal ID
      args: {},
    };
  }

  // AI Commands - find moonshots
  if (action === 'moonshot' || action === 'moonshots' || action === 'gems' || action === '10x') {
    return {
      action: 'moonshots',
      target: parts[1], // optional chain filter
      args: {},
    };
  }

  // Position tracking commands
  if (action === 'track') {
    return {
      action: 'track',
      target: parts[1], // 'all' or nothing
      args: {},
    };
  }

  if (action === 'positions' || action === 'exits' || action === 'portfolio') {
    return {
      action: 'positions',
      target: undefined,
      args: {},
    };
  }
  
  return {
    action,
    target: parts[1],
    args: {},
  };
}

// ============================================
// Command Results
// ============================================

interface CommandResult {
  success: boolean;
  action: string;
  message: string;
  data?: Record<string, unknown>;
}

// ============================================
// Routes
// ============================================

export async function registerAgentRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialize AI service
  const aiService = new AIService(fastify.prisma);

  // Auth middleware
  const requireAuth = async (request: { jwtVerify: () => Promise<void> }, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' },
      });
    }
  };

  /**
   * GET /agent/status
   * Overview of the agent state
   */
  fastify.get('/agent/status', async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    const startTime = Date.now();
    const uptime = process.uptime();
    
    const [
      policy,
      connectors,
      strategies,
      signalsToday,
      watchedTokens,
      watchedWallets,
    ] = await Promise.all([
      fastify.prisma.riskPolicy.findFirst(),
      fastify.connectorRegistry.getAllUnified(),
      fastify.prisma.strategy.findMany(),
      fastify.prisma.signal.count({
        where: {
          ts: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      fastify.prisma.watchedToken.count({ where: { enabled: true } }),
      fastify.prisma.watchedWallet.count({ where: { enabled: true } }),
    ]);

    const connectorsSummary = {
      total: connectors.length,
      connected: connectors.filter(c => c.status === 'connected').length,
      degraded: connectors.filter(c => c.status === 'degraded').length,
      offline: connectors.filter(c => c.status === 'offline').length,
      error: connectors.filter(c => c.status === 'error').length,
    };

    const strategiesSummary = {
      total: strategies.length,
      enabled: strategies.filter(s => s.status === 'enabled').length,
      disabled: strategies.filter(s => s.status === 'disabled').length,
      error: strategies.filter(s => s.status === 'error').length,
    };

    return {
      success: true,
      data: {
        version: '0.2.0',
        uptimeSeconds: Math.floor(uptime),
        uptimeFormatted: formatUptime(uptime),
        killSwitchActive: policy?.killSwitchActive ?? false,
        dryRunMode: policy?.dryRunMode ?? true,
        connectors: connectorsSummary,
        strategies: strategiesSummary,
        signalsToday,
        watchedTokens,
        watchedWallets,
        responseTimeMs: Date.now() - startTime,
      },
    };
  });

  /**
   * POST /agent/command
   * Execute a command
   */
  fastify.post('/agent/command', async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    const result = CommandSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid command format',
          details: result.error.format(),
        },
      });
    }

    const { command, args: extraArgs } = result.data;
    const parsed = parseCommand(command);
    
    // Merge extra args
    if (extraArgs) {
      Object.assign(parsed.args, extraArgs);
    }

    let commandResult: CommandResult;

    try {
      switch (parsed.action) {
        case 'watch_token':
          commandResult = await handleWatchToken(fastify, parsed.target!, parsed.args);
          break;
        
        case 'watch_wallet':
          commandResult = await handleWatchWallet(fastify, parsed.target!, parsed.args);
          break;
        
        case 'unwatch_token':
          commandResult = await handleUnwatchToken(fastify, parsed.target!, parsed.args);
          break;
        
        case 'unwatch_wallet':
          commandResult = await handleUnwatchWallet(fastify, parsed.target!, parsed.args);
          break;
        
        case 'enable_strategy':
          commandResult = await handleEnableStrategy(fastify, parsed.target!);
          break;
        
        case 'disable_strategy':
          commandResult = await handleDisableStrategy(fastify, parsed.target!);
          break;
        
        case 'killswitch':
          commandResult = await handleKillSwitch(fastify, parsed.target === 'on');
          break;
        
        case 'status':
          commandResult = await handleStatus(fastify);
          break;
        
        case 'help':
          commandResult = {
            success: true,
            action: 'help',
            message: 'Available commands',
            data: {
              commands: [
                'watch token <address> [chain]',
                'watch wallet <address> [chain]',
                'unwatch token <address> [chain]',
                'unwatch wallet <address> [chain]',
                'enable strategy <name>',
                'disable strategy <name>',
                'killswitch on',
                'killswitch off',
                'status',
                'help',
                '',
                '--- AI Commands ---',
                'analyze <address> [chain] - AI token analysis',
                'ask <question> - Get AI trading advice',
                'rate <signal_id> - Rate a signal with AI',
                '',
                '--- Moonshot Finder ---',
                'moonshots - Find potential 10x tokens',
                'gems - Same as moonshots',
                '10x - Same as moonshots',
                '',
                '--- Exit Timing ---',
                'track all - Start tracking moonshot picks',
                'positions - Check positions & exit signals',
              ],
            },
          };
          break;
        
        case 'analyze':
          if (!parsed.target) {
            commandResult = {
              success: false,
              action: 'analyze',
              message: 'Usage: analyze <token_address> [chain]',
            };
          } else {
            try {
              const tokenData: TokenData = {
                address: parsed.target,
                chain: String(parsed.args.chain || 'base'),
              };
              const analysis = await aiService.analyzeToken(tokenData);
              commandResult = {
                success: true,
                action: 'analyze',
                message: `🤖 AI Analysis for ${analysis.symbol || parsed.target}\n\n${analysis.summary}\n\n📊 Risk Score: ${analysis.riskScore}/100\n📈 Sentiment: ${analysis.sentiment}\n💡 Recommendation: ${analysis.recommendation.toUpperCase()}\n🎯 Confidence: ${analysis.confidence}%`,
                data: analysis,
              };
            } catch (err) {
              commandResult = {
                success: false,
                action: 'analyze',
                message: err instanceof Error ? err.message : 'AI analysis failed',
              };
            }
          }
          break;
        
        case 'ask':
          if (!parsed.target) {
            commandResult = {
              success: false,
              action: 'ask',
              message: 'Usage: ask <your question>',
            };
          } else {
            try {
              // Reconstruct the full question from remaining parts
              const question = [parsed.target, ...Object.values(parsed.args).map(String)].join(' ');
              const advice = await aiService.getAdvice(question);
              commandResult = {
                success: true,
                action: 'ask',
                message: `🤖 ${advice.answer}\n\n⚠️ ${advice.disclaimers.join(' ')}`,
                data: { relatedTokens: advice.relatedTokens },
              };
            } catch (err) {
              commandResult = {
                success: false,
                action: 'ask',
                message: err instanceof Error ? err.message : 'AI advice failed',
              };
            }
          }
          break;
        
        case 'rate':
          if (!parsed.target) {
            commandResult = {
              success: false,
              action: 'rate',
              message: 'Usage: rate <signal_id>',
            };
          } else {
            try {
              const signal = await fastify.prisma.signal.findUnique({
                where: { id: parsed.target },
              });
              if (!signal) {
                commandResult = {
                  success: false,
                  action: 'rate',
                  message: `Signal not found: ${parsed.target}`,
                };
              } else {
                const rating = await aiService.rateSignal({
                  id: signal.id,
                  signalType: signal.signalType ?? 'unknown',
                  severity: signal.severity,
                  message: signal.summary,
                  token: signal.token ?? undefined,
                  tokenSymbol: signal.tokenSymbol ?? undefined,
                  chain: signal.chain ?? undefined,
                });
                commandResult = {
                  success: true,
                  action: 'rate',
                  message: `🤖 Signal Rating\n\n📊 Importance: ${rating.importance}/10\n⚡ Action Required: ${rating.actionRequired ? 'YES' : 'No'}\n\n💭 ${rating.reasoning}\n\n💡 Suggested: ${rating.suggestedAction}`,
                  data: rating,
                };
              }
            } catch (err) {
              commandResult = {
                success: false,
                action: 'rate',
                message: err instanceof Error ? err.message : 'AI rating failed',
              };
            }
          }
          break;

        case 'moonshots':
          try {
            const moonshotAdvice = await aiService.getMoonshotAdvice();
            if (moonshotAdvice.topPicks.length === 0) {
              commandResult = {
                success: true,
                action: 'moonshots',
                message: '🔍 No high-potential moonshots detected right now. Market may be cooling off - check back later.',
                data: { topPicks: [] },
              };
            } else {
              const topPicksList = moonshotAdvice.topPicks.slice(0, 5).map((m, i) => 
                `${i + 1}. ${m.symbol} (${m.chain}) - Score: ${m.moonshotScore}/100 - $${m.fdv < 1000000 ? (m.fdv/1000).toFixed(0) + 'K' : (m.fdv/1000000).toFixed(2) + 'M'} mcap`
              ).join('\n');
              
              commandResult = {
                success: true,
                action: 'moonshots',
                message: `🚀 MOONSHOT FINDER\n\n${moonshotAdvice.analysis}\n\n📊 TOP CANDIDATES:\n${topPicksList}\n\n⚠️ ${moonshotAdvice.warnings[0]}`,
                data: { 
                  topPicks: moonshotAdvice.topPicks,
                  warnings: moonshotAdvice.warnings,
                },
              };
            }
          } catch (err) {
            commandResult = {
              success: false,
              action: 'moonshots',
              message: err instanceof Error ? err.message : 'Moonshot finder failed',
            };
          }
          break;

        case 'track':
          try {
            if (parsed.target === 'all') {
              // Track all current moonshots
              const advice = await aiService.getMoonshotAdvice();
              const tracked = [];
              for (const pick of advice.topPicks.slice(0, 5)) {
                await aiService.trackPosition(pick);
                tracked.push(pick.symbol);
              }
              commandResult = {
                success: true,
                action: 'track',
                message: `📍 Now tracking ${tracked.length} positions for exit signals:\n${tracked.join(', ')}\n\nUse "positions" to check status and exit recommendations.`,
                data: { tracked },
              };
            } else {
              commandResult = {
                success: true,
                action: 'track',
                message: 'Usage: track all - Start tracking current moonshot picks',
              };
            }
          } catch (err) {
            commandResult = {
              success: false,
              action: 'track',
              message: err instanceof Error ? err.message : 'Tracking failed',
            };
          }
          break;

        case 'positions':
          try {
            const positions = await aiService.getTrackedPositions();
            if (positions.length === 0) {
              commandResult = {
                success: true,
                action: 'positions',
                message: '📊 No positions being tracked.\n\nUse "track all" after "moonshots" to start tracking.',
                data: { positions: [] },
              };
            } else {
              const positionList = positions.map(p => {
                const rec = aiService.getExitRecommendation(p);
                const emoji = p.status === 'rugged' ? '💀' : 
                             p.currentMultiple >= 5 ? '🔥' :
                             p.currentMultiple >= 2 ? '🚀' :
                             p.currentMultiple >= 1 ? '📈' : '📉';
                const signals = p.exitSignals.length > 0 
                  ? `\n   ⚡ ${p.exitSignals[0].message}`
                  : '';
                return `${emoji} ${p.symbol}: ${p.currentMultiple.toFixed(2)}x (peak: ${p.peakMultiple.toFixed(2)}x)\n   💡 ${rec.action.toUpperCase()}: ${rec.reason}${signals}`;
              }).join('\n\n');
              
              commandResult = {
                success: true,
                action: 'positions',
                message: `📊 TRACKED POSITIONS\n\n${positionList}`,
                data: { positions },
              };
            }
          } catch (err) {
            commandResult = {
              success: false,
              action: 'positions',
              message: err instanceof Error ? err.message : 'Failed to get positions',
            };
          }
          break;
        
        default:
          commandResult = {
            success: false,
            action: parsed.action,
            message: `Unknown command: ${parsed.action}. Try "help" for available commands.`,
          };
      }
    } catch (error) {
      commandResult = {
        success: false,
        action: parsed.action,
        message: error instanceof Error ? error.message : 'Command failed',
      };
    }

    // Audit log
    await fastify.auditService.log({
      action: 'agent_command',
      userId: request.user.userId,
      details: {
        command,
        parsed,
        result: commandResult,
      },
      success: commandResult.success,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return {
      success: commandResult.success,
      data: commandResult,
    };
  });

  /**
   * GET /agent/watchlist/tokens
   * List watched tokens
   */
  fastify.get('/agent/watchlist/tokens', async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    const tokens = await fastify.prisma.watchedToken.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: tokens.map(t => ({
        id: t.id,
        chain: t.chain,
        tokenAddress: t.tokenAddress,
        tokenSymbol: t.tokenSymbol,
        tokenName: t.tokenName,
        tags: t.tags,
        enabled: t.enabled,
        createdAt: t.createdAt.getTime(),
      })),
    };
  });

  /**
   * GET /agent/watchlist/wallets
   * List watched wallets
   */
  fastify.get('/agent/watchlist/wallets', async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    const wallets = await fastify.prisma.watchedWallet.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: wallets.map(w => ({
        id: w.id,
        chain: w.chain,
        walletAddress: w.walletAddress,
        label: w.label,
        tags: w.tags,
        enabled: w.enabled,
        createdAt: w.createdAt.getTime(),
      })),
    };
  });

  // ============================================
  // AI-Powered Routes
  // ============================================

  /**
   * GET /agent/ai/status
   * Check if AI service is available
   */
  fastify.get('/agent/ai/status', async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    return {
      success: true,
      data: {
        available: aiService.isAvailable(),
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      },
    };
  });

  /**
   * POST /agent/ai/analyze
   * AI-powered token analysis
   */
  fastify.post('/agent/ai/analyze', async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    const schema = z.object({
      address: z.string().min(1),
      chain: z.string().default('base'),
      symbol: z.string().optional(),
      name: z.string().optional(),
      price: z.number().optional(),
      priceChange24h: z.number().optional(),
      volume24h: z.number().optional(),
      marketCap: z.number().optional(),
      liquidity: z.number().optional(),
      holders: z.number().optional(),
    });

    const result = schema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: result.error.format(),
        },
      });
    }

    try {
      const tokenData: TokenData = {
        address: result.data.address,
        chain: result.data.chain,
        symbol: result.data.symbol,
        name: result.data.name,
        price: result.data.price,
        priceChange24h: result.data.priceChange24h,
        volume24h: result.data.volume24h,
        marketCap: result.data.marketCap,
        liquidity: result.data.liquidity,
        holders: result.data.holders,
      };

      const analysis = await aiService.analyzeToken(tokenData);

      await fastify.auditService.log({
        action: 'agent_command',
        userId: request.user.userId,
        details: {
          command: 'ai_analyze',
          token: result.data.address,
          chain: result.data.chain,
        },
        success: true,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return {
        success: true,
        data: analysis,
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'AI_ERROR',
          message: error instanceof Error ? error.message : 'AI analysis failed',
        },
      });
    }
  });

  /**
   * POST /agent/ai/rate
   * AI-powered signal rating
   */
  fastify.post('/agent/ai/rate', async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    const schema = z.object({
      signalId: z.string().min(1),
    });

    const result = schema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: result.error.format(),
        },
      });
    }

    try {
      // Fetch the signal from database
      const signal = await fastify.prisma.signal.findUnique({
        where: { id: result.data.signalId },
      });

      if (!signal) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Signal not found' },
        });
      }

      const rating = await aiService.rateSignal({
        id: signal.id,
        signalType: signal.signalType ?? 'unknown',
        severity: signal.severity,
        message: signal.summary,
        token: signal.token ?? undefined,
        tokenSymbol: signal.tokenSymbol ?? undefined,
        chain: signal.chain ?? undefined,
      });

      return {
        success: true,
        data: rating,
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'AI_ERROR',
          message: error instanceof Error ? error.message : 'AI rating failed',
        },
      });
    }
  });

  /**
   * POST /agent/ai/ask
   * Get AI trading advice
   */
  fastify.post('/agent/ai/ask', async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    const schema = z.object({
      question: z.string().min(1).max(500),
    });

    const result = schema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: result.error.format(),
        },
      });
    }

    try {
      const advice = await aiService.getAdvice(result.data.question);

      await fastify.auditService.log({
        action: 'agent_command',
        userId: request.user.userId,
        details: {
          command: 'ai_ask',
          question: result.data.question.substring(0, 100),
        },
        success: true,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return {
        success: true,
        data: advice,
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'AI_ERROR',
          message: error instanceof Error ? error.message : 'AI advice failed',
        },
      });
    }
  });

  /**
   * GET /agent/ai/moonshots
   * Find potential moonshot tokens
   */
  fastify.get('/agent/ai/moonshots', async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    const { chain, minScore } = request.query as { chain?: string; minScore?: string };

    try {
      const moonshots = await aiService.findMoonshots({
        chain,
        minScore: minScore ? parseInt(minScore) : 40,
        limit: 10,
      });

      return {
        success: true,
        data: {
          count: moonshots.length,
          moonshots,
        },
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'AI_ERROR',
          message: error instanceof Error ? error.message : 'Moonshot finder failed',
        },
      });
    }
  });

  /**
   * GET /agent/ai/moonshots/advice
   * Get AI analysis of top moonshot candidates
   */
  fastify.get('/agent/ai/moonshots/advice', async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    try {
      const advice = await aiService.getMoonshotAdvice();

      await fastify.auditService.log({
        action: 'agent_command',
        userId: request.user.userId,
        details: {
          command: 'moonshot_advice',
          topPicksCount: advice.topPicks.length,
        },
        success: true,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return {
        success: true,
        data: advice,
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'AI_ERROR',
          message: error instanceof Error ? error.message : 'Moonshot advice failed',
        },
      });
    }
  });

  // ============================================
  // Position Tracking & Exit Timing Routes
  // ============================================

  /**
   * POST /agent/ai/track
   * Start tracking a moonshot position for exit signals
   */
  fastify.post('/agent/ai/track', async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    const schema = z.object({
      symbol: z.string(),
      address: z.string(),
      chain: z.string(),
      entryPrice: z.number(),
      liquidity: z.number(),
    });

    const result = schema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' },
      });
    }

    try {
      const candidate: MoonshotCandidate = {
        symbol: result.data.symbol,
        name: result.data.symbol,
        address: result.data.address,
        chain: result.data.chain,
        priceUsd: result.data.entryPrice,
        priceChange1h: 0,
        priceChange24h: 0,
        volume24h: 0,
        liquidity: result.data.liquidity,
        fdv: 0,
        buys24h: 0,
        sells24h: 0,
        moonshotScore: 0,
        signals: [],
        risk: 'extreme',
      };

      const position = await aiService.trackPosition(candidate);
      
      return {
        success: true,
        data: position,
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: { code: 'TRACKING_ERROR', message: error instanceof Error ? error.message : 'Failed to track position' },
      });
    }
  });

  /**
   * GET /agent/ai/positions
   * Get all tracked positions with live exit signals
   */
  fastify.get('/agent/ai/positions', async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    try {
      const positions = await aiService.getTrackedPositions();
      
      // Add exit recommendations to each position
      const withRecommendations = positions.map(pos => ({
        ...pos,
        recommendation: aiService.getExitRecommendation(pos),
      }));

      return {
        success: true,
        data: {
          count: positions.length,
          positions: withRecommendations,
        },
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: { code: 'POSITIONS_ERROR', message: error instanceof Error ? error.message : 'Failed to get positions' },
      });
    }
  });

  /**
   * GET /agent/ai/positions/:id
   * Check a specific position for exit signals
   */
  fastify.get('/agent/ai/positions/:id', async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };

    try {
      const position = await aiService.checkPosition(id);
      
      if (!position) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Position not found' },
        });
      }

      return {
        success: true,
        data: {
          position,
          recommendation: aiService.getExitRecommendation(position),
        },
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: { code: 'CHECK_ERROR', message: error instanceof Error ? error.message : 'Failed to check position' },
      });
    }
  });

  /**
   * DELETE /agent/ai/positions/:id
   * Stop tracking a position
   */
  fastify.delete('/agent/ai/positions/:id', async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const removed = aiService.stopTracking(id);

    return {
      success: removed,
      message: removed ? 'Position removed from tracking' : 'Position not found',
    };
  });

  /**
   * POST /agent/ai/moonshots/track-all
   * Find moonshots and automatically track the top picks
   */
  fastify.post('/agent/ai/moonshots/track-all', async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    try {
      const advice = await aiService.getMoonshotAdvice();
      const tracked = [];

      for (const pick of advice.topPicks.slice(0, 5)) {
        const position = await aiService.trackPosition(pick);
        tracked.push({
          symbol: position.symbol,
          chain: position.chain,
          entryPrice: position.entryPrice,
          liquidity: position.entryLiquidity,
        });
      }

      return {
        success: true,
        data: {
          message: `Now tracking ${tracked.length} moonshot positions`,
          tracked,
          analysis: advice.analysis,
          warnings: advice.warnings,
        },
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: { code: 'TRACK_ALL_ERROR', message: error instanceof Error ? error.message : 'Failed to track moonshots' },
      });
    }
  });

  /**
   * POST /agent/ai/chat
   * Natural language command processing
   */
  fastify.post('/agent/ai/chat', async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    const schema = z.object({
      message: z.string().min(1).max(500),
    });

    const result = schema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: result.error.format(),
        },
      });
    }

    try {
      const parsed = await aiService.processNaturalLanguage(result.data.message);

      // Handle the intent
      let actionResult: CommandResult | null = null;

      if (parsed.intent === 'analyze_token' && parsed.entities.address) {
        // Trigger token analysis
        const tokenData: TokenData = {
          address: parsed.entities.address,
          chain: parsed.entities.chain || 'base',
          symbol: parsed.entities.symbol,
        };
        const analysis = await aiService.analyzeToken(tokenData);
        actionResult = {
          success: true,
          action: 'analyze_token',
          message: `${analysis.summary}\n\nRisk Score: ${analysis.riskScore}/100 | Sentiment: ${analysis.sentiment} | Recommendation: ${analysis.recommendation}`,
          data: analysis,
        };
      } else if (parsed.intent === 'watch_token' && parsed.entities.address) {
        actionResult = await handleWatchToken(fastify, parsed.entities.address, {
          chain: parsed.entities.chain || 'base',
        });
      } else if (parsed.intent === 'get_advice') {
        const advice = await aiService.getAdvice(result.data.message);
        actionResult = {
          success: true,
          action: 'get_advice',
          message: advice.answer,
          data: { disclaimers: advice.disclaimers, relatedTokens: advice.relatedTokens },
        };
      } else if (parsed.intent === 'market_overview' || parsed.intent === 'portfolio_status') {
        actionResult = await handleStatus(fastify);
      } else {
        actionResult = {
          success: true,
          action: 'chat',
          message: parsed.response,
          data: { intent: parsed.intent, entities: parsed.entities },
        };
      }

      await fastify.auditService.log({
        action: 'agent_command',
        userId: request.user.userId,
        details: {
          command: 'ai_chat',
          message: result.data.message.substring(0, 100),
          intent: parsed.intent,
        },
        success: true,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return {
        success: true,
        data: actionResult,
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'AI_ERROR',
          message: error instanceof Error ? error.message : 'AI chat failed',
        },
      });
    }
  });
}

// ============================================
// Command Handlers
// ============================================

async function handleWatchToken(
  fastify: FastifyInstance,
  address: string,
  args: Record<string, unknown>
): Promise<CommandResult> {
  const chain = String(args.chain || 'base');
  const normalizedAddress = address.toLowerCase();

  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return {
      success: false,
      action: 'watch_token',
      message: `Invalid token address: ${address}`,
    };
  }

  const existing = await fastify.prisma.watchedToken.findUnique({
    where: { chain_tokenAddress: { chain, tokenAddress: normalizedAddress } },
  });

  if (existing) {
    // Re-enable if disabled
    if (!existing.enabled) {
      await fastify.prisma.watchedToken.update({
        where: { id: existing.id },
        data: { enabled: true },
      });
      return {
        success: true,
        action: 'watch_token',
        message: `Re-enabled watching token ${normalizedAddress} on ${chain}`,
        data: { chain, tokenAddress: normalizedAddress },
      };
    }
    return {
      success: true,
      action: 'watch_token',
      message: `Already watching token ${normalizedAddress} on ${chain}`,
      data: { chain, tokenAddress: normalizedAddress, alreadyWatched: true },
    };
  }

  await fastify.prisma.watchedToken.create({
    data: {
      chain,
      tokenAddress: normalizedAddress,
      source: 'command',
      tags: args.tags || [],
    },
  });

  return {
    success: true,
    action: 'watch_token',
    message: `Now watching token ${normalizedAddress} on ${chain}`,
    data: { chain, tokenAddress: normalizedAddress },
  };
}

async function handleWatchWallet(
  fastify: FastifyInstance,
  address: string,
  args: Record<string, unknown>
): Promise<CommandResult> {
  const chain = String(args.chain || 'base');
  const normalizedAddress = address.toLowerCase();

  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return {
      success: false,
      action: 'watch_wallet',
      message: `Invalid wallet address: ${address}`,
    };
  }

  const existing = await fastify.prisma.watchedWallet.findUnique({
    where: { chain_walletAddress: { chain, walletAddress: normalizedAddress } },
  });

  if (existing) {
    if (!existing.enabled) {
      await fastify.prisma.watchedWallet.update({
        where: { id: existing.id },
        data: { enabled: true },
      });
      return {
        success: true,
        action: 'watch_wallet',
        message: `Re-enabled watching wallet ${normalizedAddress} on ${chain}`,
        data: { chain, walletAddress: normalizedAddress },
      };
    }
    return {
      success: true,
      action: 'watch_wallet',
      message: `Already watching wallet ${normalizedAddress} on ${chain}`,
      data: { chain, walletAddress: normalizedAddress, alreadyWatched: true },
    };
  }

  await fastify.prisma.watchedWallet.create({
    data: {
      chain,
      walletAddress: normalizedAddress,
      label: args.label as string | undefined,
      source: 'command',
      tags: args.tags || [],
    },
  });

  return {
    success: true,
    action: 'watch_wallet',
    message: `Now watching wallet ${normalizedAddress} on ${chain}`,
    data: { chain, walletAddress: normalizedAddress },
  };
}

async function handleUnwatchToken(
  fastify: FastifyInstance,
  address: string,
  args: Record<string, unknown>
): Promise<CommandResult> {
  const chain = String(args.chain || 'base');
  const normalizedAddress = address.toLowerCase();

  const existing = await fastify.prisma.watchedToken.findUnique({
    where: { chain_tokenAddress: { chain, tokenAddress: normalizedAddress } },
  });

  if (!existing) {
    return {
      success: false,
      action: 'unwatch_token',
      message: `Token ${normalizedAddress} was not being watched on ${chain}`,
    };
  }

  await fastify.prisma.watchedToken.update({
    where: { id: existing.id },
    data: { enabled: false },
  });

  return {
    success: true,
    action: 'unwatch_token',
    message: `Stopped watching token ${normalizedAddress} on ${chain}`,
    data: { chain, tokenAddress: normalizedAddress },
  };
}

async function handleUnwatchWallet(
  fastify: FastifyInstance,
  address: string,
  args: Record<string, unknown>
): Promise<CommandResult> {
  const chain = String(args.chain || 'base');
  const normalizedAddress = address.toLowerCase();

  const existing = await fastify.prisma.watchedWallet.findUnique({
    where: { chain_walletAddress: { chain, walletAddress: normalizedAddress } },
  });

  if (!existing) {
    return {
      success: false,
      action: 'unwatch_wallet',
      message: `Wallet ${normalizedAddress} was not being watched on ${chain}`,
    };
  }

  await fastify.prisma.watchedWallet.update({
    where: { id: existing.id },
    data: { enabled: false },
  });

  return {
    success: true,
    action: 'unwatch_wallet',
    message: `Stopped watching wallet ${normalizedAddress} on ${chain}`,
    data: { chain, walletAddress: normalizedAddress },
  };
}

async function handleEnableStrategy(
  fastify: FastifyInstance,
  strategyName: string
): Promise<CommandResult> {
  // Find strategy by name or id
  const strategy = await fastify.prisma.strategy.findFirst({
    where: {
      OR: [
        { id: strategyName },
        { name: { contains: strategyName, mode: 'insensitive' } },
        { strategyType: strategyName },
      ],
    },
  });

  if (!strategy) {
    return {
      success: false,
      action: 'enable_strategy',
      message: `Strategy not found: ${strategyName}`,
    };
  }

  if (strategy.status === 'enabled') {
    return {
      success: true,
      action: 'enable_strategy',
      message: `Strategy "${strategy.name}" is already enabled`,
      data: { strategyId: strategy.id, strategyName: strategy.name },
    };
  }

  await fastify.strategyScheduler.enableStrategy(strategy.id);

  return {
    success: true,
    action: 'enable_strategy',
    message: `Enabled strategy "${strategy.name}"`,
    data: { strategyId: strategy.id, strategyName: strategy.name },
  };
}

async function handleDisableStrategy(
  fastify: FastifyInstance,
  strategyName: string
): Promise<CommandResult> {
  const strategy = await fastify.prisma.strategy.findFirst({
    where: {
      OR: [
        { id: strategyName },
        { name: { contains: strategyName, mode: 'insensitive' } },
        { strategyType: strategyName },
      ],
    },
  });

  if (!strategy) {
    return {
      success: false,
      action: 'disable_strategy',
      message: `Strategy not found: ${strategyName}`,
    };
  }

  if (strategy.status === 'disabled') {
    return {
      success: true,
      action: 'disable_strategy',
      message: `Strategy "${strategy.name}" is already disabled`,
      data: { strategyId: strategy.id, strategyName: strategy.name },
    };
  }

  await fastify.strategyScheduler.disableStrategy(strategy.id);

  return {
    success: true,
    action: 'disable_strategy',
    message: `Disabled strategy "${strategy.name}"`,
    data: { strategyId: strategy.id, strategyName: strategy.name },
  };
}

async function handleKillSwitch(
  fastify: FastifyInstance,
  active: boolean
): Promise<CommandResult> {
  await fastify.prisma.riskPolicy.updateMany({
    data: { killSwitchActive: active },
  });

  return {
    success: true,
    action: 'killswitch',
    message: active 
      ? '🛑 Kill switch ACTIVATED - all trading actions blocked'
      : '✅ Kill switch deactivated - normal operations resumed',
    data: { killSwitchActive: active },
  };
}

async function handleStatus(fastify: FastifyInstance): Promise<CommandResult> {
  const uptime = process.uptime();
  const connectors = await fastify.connectorRegistry.getAllUnified();
  const policy = await fastify.prisma.riskPolicy.findFirst();
  const signalsToday = await fastify.prisma.signal.count({
    where: {
      ts: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    },
  });

  return {
    success: true,
    action: 'status',
    message: `ClawFi v0.2.0 • Uptime: ${formatUptime(uptime)} • ${connectors.filter(c => c.status === 'connected').length}/${connectors.length} connectors online • ${signalsToday} signals today`,
    data: {
      version: '0.2.0',
      uptimeFormatted: formatUptime(uptime),
      killSwitchActive: policy?.killSwitchActive ?? false,
      connectorsOnline: connectors.filter(c => c.status === 'connected').length,
      connectorsTotal: connectors.length,
      signalsToday,
    },
  };
}

// ============================================
// Helpers
// ============================================

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);
  
  return parts.join(' ');
}


