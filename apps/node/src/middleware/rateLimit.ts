/**
 * Rate Limiting Middleware
 * 
 * Protects API endpoints from abuse with configurable rate limits.
 * Uses Redis for distributed rate limiting.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';

// ============================================
// Types
// ============================================

export interface RateLimitConfig {
  windowMs: number;       // Time window in milliseconds
  maxRequests: number;    // Max requests per window
  keyPrefix?: string;     // Redis key prefix
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (request: FastifyRequest) => string;
  onRateLimited?: (request: FastifyRequest) => void;
}

interface RateLimitInfo {
  current: number;
  limit: number;
  remaining: number;
  resetTime: number;
}

// ============================================
// Constants
// ============================================

const DEFAULT_CONFIG: Required<Omit<RateLimitConfig, 'keyGenerator' | 'onRateLimited'>> = {
  windowMs: 60000,     // 1 minute
  maxRequests: 100,     // 100 requests per minute
  keyPrefix: 'rl:',
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
};

// Route-specific limits
const ROUTE_LIMITS: Record<string, Partial<RateLimitConfig>> = {
  // Auth routes - stricter limits
  '/auth/login': { maxRequests: 10, windowMs: 60000 },
  '/auth/register': { maxRequests: 5, windowMs: 60000 },
  
  // Agent commands - moderate limits
  '/agent/command': { maxRequests: 60, windowMs: 60000 },
  
  // Signals - higher limits for real-time apps
  '/signals': { maxRequests: 200, windowMs: 60000 },
  '/signals/token': { maxRequests: 300, windowMs: 60000 },
  
  // Health checks - no limits
  '/health': { maxRequests: 1000, windowMs: 60000 },
};

// ============================================
// Rate Limiter
// ============================================

export class RateLimiter {
  private config: Required<Omit<RateLimitConfig, 'keyGenerator' | 'onRateLimited'>>;
  private keyGenerator: (request: FastifyRequest) => string;
  private onRateLimited?: (request: FastifyRequest) => void;

  constructor(
    private readonly redis: Redis,
    config: RateLimitConfig = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.keyGenerator = config.keyGenerator || this.defaultKeyGenerator;
    this.onRateLimited = config.onRateLimited;
  }

  /**
   * Default key generator - uses IP address
   */
  private defaultKeyGenerator(request: FastifyRequest): string {
    // Try to get real IP from X-Forwarded-For header
    const forwarded = request.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' 
      ? forwarded.split(',')[0]?.trim()
      : request.ip;
    return ip || 'unknown';
  }

  /**
   * Check rate limit for a request
   */
  async checkLimit(request: FastifyRequest): Promise<RateLimitInfo> {
    const key = `${this.config.keyPrefix}${this.keyGenerator(request)}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    // Use Redis sorted set for sliding window
    const multi = this.redis.multi();
    
    // Remove old entries
    multi.zremrangebyscore(key, 0, windowStart);
    
    // Count current entries
    multi.zcard(key);
    
    // Add current request
    multi.zadd(key, now, `${now}:${Math.random()}`);
    
    // Set expiry
    multi.pexpire(key, this.config.windowMs);
    
    const results = await multi.exec();
    
    // Get count from results (zcard result is at index 1)
    const count = (results?.[1]?.[1] as number) || 0;
    
    const resetTime = now + this.config.windowMs;
    const remaining = Math.max(0, this.config.maxRequests - count - 1);
    
    return {
      current: count + 1,
      limit: this.config.maxRequests,
      remaining,
      resetTime,
    };
  }

  /**
   * Create Fastify hook for rate limiting
   */
  createHook() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // Get route-specific config
      const routePath = request.routeOptions?.url || request.url.split('?')[0];
      const routeConfig = ROUTE_LIMITS[routePath || ''];
      
      // Merge configs
      const effectiveConfig = { ...this.config, ...routeConfig };
      
      // Create temporary limiter with merged config
      const limiter = new RateLimiter(this.redis, effectiveConfig);
      
      const info = await limiter.checkLimit(request);
      
      // Add rate limit headers
      reply.header('X-RateLimit-Limit', effectiveConfig.maxRequests);
      reply.header('X-RateLimit-Remaining', info.remaining);
      reply.header('X-RateLimit-Reset', Math.ceil(info.resetTime / 1000));
      
      // Check if rate limited
      if (info.current > effectiveConfig.maxRequests) {
        this.onRateLimited?.(request);
        
        reply.header('Retry-After', Math.ceil(effectiveConfig.windowMs / 1000));
        
        return reply.status(429).send({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please try again later.',
            retryAfter: Math.ceil(effectiveConfig.windowMs / 1000),
          },
        });
      }
    };
  }
}

/**
 * Register rate limiting on Fastify instance
 */
export function registerRateLimiting(fastify: FastifyInstance, redis: Redis): void {
  const limiter = new RateLimiter(redis, {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    onRateLimited: (request) => {
      fastify.log.warn({ 
        ip: request.ip, 
        url: request.url,
        method: request.method,
      }, 'Rate limit exceeded');
    },
  });

  // Add as preHandler hook
  fastify.addHook('preHandler', limiter.createHook());
  
  fastify.log.info('Rate limiting enabled');
}
