/**
 * WebSocket Handler
 * Real-time signal streaming and system status
 * 
 * Features:
 * - JWT authentication via query param
 * - Signal subscription with real-time streaming
 * - Periodic system status updates
 * - Heartbeat/ping-pong for connection health
 * - Connection tracking and statistics
 */

import type { FastifyInstance } from 'fastify';
import type { Signal } from '@clawfi/core';

// Track active connections
let activeConnections = 0;
const connectionStats = {
  totalConnections: 0,
  totalMessages: 0,
  lastActivity: Date.now(),
};

/**
 * Get WebSocket connection statistics
 */
export function getWebSocketStats() {
  return {
    activeConnections,
    ...connectionStats,
  };
}

export async function registerWebSocket(fastify: FastifyInstance): Promise<void> {
  fastify.get('/ws', { websocket: true }, (connection, request) => {
    const socket = connection.socket;
    const clientId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let isAlive = true;
    let lastPing = Date.now();
    
    // Verify JWT from query params
    const token = (request.query as { token?: string }).token;
    
    if (!token) {
      socket.send(JSON.stringify({
        type: 'error',
        data: { code: 'UNAUTHORIZED', message: 'Token required' },
      }));
      socket.close(4001, 'Token required');
      return;
    }

    let userId: string | undefined;
    try {
      const decoded = fastify.jwt.verify(token) as { userId?: string };
      userId = decoded.userId;
    } catch {
      socket.send(JSON.stringify({
        type: 'error',
        data: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      }));
      socket.close(4002, 'Invalid token');
      return;
    }

    // Track connection
    activeConnections++;
    connectionStats.totalConnections++;
    connectionStats.lastActivity = Date.now();

    fastify.log.info({ clientId, userId }, 'WebSocket client connected');

    // Send welcome message
    socket.send(JSON.stringify({
      type: 'connected',
      data: { 
        clientId,
        serverTime: Date.now(),
        version: '0.2.0',
      },
    }));

    // Subscribe to signals
    const unsubscribeSignals = fastify.signalService.subscribe((signal: Signal) => {
      if (socket.readyState === socket.OPEN) {
        try {
          socket.send(JSON.stringify({
            type: 'signal',
            data: signal,
          }));
          connectionStats.totalMessages++;
        } catch (err) {
          fastify.log.error({ clientId, err }, 'Failed to send signal');
        }
      }
    });

    // Send system status
    const sendStatus = async () => {
      if (socket.readyState !== socket.OPEN) return;

      try {
        const [policy, connectors, strategies, signalsToday] = await Promise.all([
          fastify.prisma.riskPolicy.findFirst(),
          fastify.connectorRegistry.getAllUnified(),
          fastify.prisma.strategy.findMany({ where: { status: 'enabled' } }),
          fastify.prisma.signal.count({
            where: { ts: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
          }),
        ]);

        socket.send(JSON.stringify({
          type: 'system_status',
          data: {
            killSwitchActive: policy?.killSwitchActive ?? false,
            dryRunMode: policy?.dryRunMode ?? true,
            activeConnectors: connectors.filter(c => c.status === 'connected').length,
            totalConnectors: connectors.length,
            activeStrategies: strategies.length,
            signalsToday,
            serverTime: Date.now(),
            uptime: process.uptime(),
          },
        }));
        connectionStats.totalMessages++;
      } catch (err) {
        fastify.log.error({ clientId, err }, 'Failed to send status');
      }
    };

    // Initial status
    sendStatus();

    // Periodic status updates (every 30 seconds)
    const statusInterval = setInterval(sendStatus, 30000);

    // Connection health check (every 45 seconds)
    const healthCheckInterval = setInterval(() => {
      if (!isAlive) {
        fastify.log.warn({ clientId }, 'WebSocket client unresponsive, terminating');
        socket.terminate();
        return;
      }
      isAlive = false;
      socket.ping();
    }, 45000);

    // Handle pong from client (browser WebSocket doesn't send pong, so we rely on ping message)
    socket.on('pong', () => {
      isAlive = true;
    });

    // Handle messages from client
    socket.on('message', (message: Buffer | string) => {
      isAlive = true;
      connectionStats.lastActivity = Date.now();

      try {
        const data = JSON.parse(message.toString()) as { type: string; payload?: unknown };
        
        switch (data.type) {
          case 'ping':
            socket.send(JSON.stringify({ type: 'pong', data: { ts: Date.now() } }));
            lastPing = Date.now();
            break;
            
          case 'subscribe':
            // Future: allow subscribing to specific channels
            socket.send(JSON.stringify({ 
              type: 'subscribed', 
              data: { channels: ['signals', 'status'] },
            }));
            break;
            
          case 'get_status':
            sendStatus();
            break;
            
          default:
            // Unknown message type, ignore
            break;
        }
      } catch {
        // Ignore invalid messages
      }
    });

    // Handle socket errors
    socket.on('error', (err) => {
      fastify.log.error({ clientId, err }, 'WebSocket error');
    });

    // Cleanup on close
    socket.on('close', (code, reason) => {
      activeConnections--;
      unsubscribeSignals();
      clearInterval(statusInterval);
      clearInterval(healthCheckInterval);

      fastify.log.info(
        { clientId, userId, code, reason: reason.toString(), duration: Date.now() - lastPing },
        'WebSocket client disconnected'
      );
    });
  });

  // Add route to get WebSocket stats (for monitoring)
  fastify.get('/ws/stats', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' },
      });
    }

    return {
      success: true,
      data: getWebSocketStats(),
    };
  });
}

