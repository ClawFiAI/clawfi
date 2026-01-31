import { z } from 'zod';
import type { Chain, Venue } from '@clawfi/core';

/**
 * Connector status
 */
export const ConnectorStatusSchema = z.enum(['connected', 'disconnected', 'error']);
export type ConnectorStatus = z.infer<typeof ConnectorStatusSchema>;

/**
 * Connector type
 */
export const ConnectorTypeSchema = z.enum(['cex', 'dex', 'wallet']);
export type ConnectorType = z.infer<typeof ConnectorTypeSchema>;

/**
 * Base connector configuration
 */
export interface BaseConnectorConfig {
  id: string;
  type: ConnectorType;
  venue: Venue;
  label?: string;
  enabled: boolean;
}

/**
 * Connector health info
 */
export interface ConnectorHealth {
  status: ConnectorStatus;
  lastCheck: number;
  latencyMs?: number;
  error?: string;
}

/**
 * Balance entry
 */
export const BalanceSchema = z.object({
  asset: z.string(),
  free: z.string(),
  locked: z.string(),
  total: z.string(),
  usdValue: z.number().optional(),
});
export type Balance = z.infer<typeof BalanceSchema>;

/**
 * Order side
 */
export const OrderSideSchema = z.enum(['buy', 'sell']);
export type OrderSide = z.infer<typeof OrderSideSchema>;

/**
 * Order type
 */
export const OrderTypeSchema = z.enum(['market', 'limit', 'stop_market', 'stop_limit']);
export type OrderType = z.infer<typeof OrderTypeSchema>;

/**
 * Order status
 */
export const OrderStatusSchema = z.enum([
  'pending',
  'open',
  'partially_filled',
  'filled',
  'cancelled',
  'rejected',
  'expired',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

/**
 * Order model
 */
export const OrderSchema = z.object({
  id: z.string(),
  externalId: z.string().optional(),
  venue: z.string(),
  symbol: z.string(),
  side: OrderSideSchema,
  type: OrderTypeSchema,
  status: OrderStatusSchema,
  price: z.string().optional(),
  quantity: z.string(),
  filledQuantity: z.string(),
  avgPrice: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Order = z.infer<typeof OrderSchema>;

/**
 * Order request
 */
export const OrderRequestSchema = z.object({
  symbol: z.string(),
  side: OrderSideSchema,
  type: OrderTypeSchema,
  quantity: z.string(),
  price: z.string().optional(),
  timeInForce: z.enum(['GTC', 'IOC', 'FOK']).optional(),
});
export type OrderRequest = z.infer<typeof OrderRequestSchema>;

/**
 * Quote request
 */
export const QuoteRequestSchema = z.object({
  chain: z.string(),
  tokenIn: z.string(),
  tokenOut: z.string(),
  amountIn: z.string(),
  slippageBps: z.number().optional(),
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

/**
 * Quote response
 */
export const QuoteResponseSchema = z.object({
  tokenIn: z.string(),
  tokenOut: z.string(),
  amountIn: z.string(),
  amountOut: z.string(),
  priceImpactBps: z.number().optional(),
  route: z.array(z.string()).optional(),
  gasEstimate: z.string().optional(),
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

/**
 * Base connector interface
 */
export interface IConnector {
  readonly id: string;
  readonly type: ConnectorType;
  readonly venue: Venue;

  /**
   * Initialize the connector
   */
  initialize(): Promise<void>;

  /**
   * Get connector health status
   */
  getHealth(): Promise<ConnectorHealth>;

  /**
   * Shutdown the connector
   */
  shutdown(): Promise<void>;
}

/**
 * CEX connector interface
 */
export interface ICexConnector extends IConnector {
  type: 'cex';

  /**
   * Get account balances
   */
  getBalances(): Promise<Balance[]>;

  /**
   * Get open orders
   */
  getOpenOrders(symbol?: string): Promise<Order[]>;

  /**
   * Place an order
   */
  placeOrder(request: OrderRequest): Promise<Order>;

  /**
   * Cancel an order
   */
  cancelOrder(orderId: string, symbol: string): Promise<boolean>;
}

/**
 * DEX connector interface
 */
export interface IDexConnector extends IConnector {
  type: 'dex';

  /**
   * Get a swap quote
   */
  getQuote(request: QuoteRequest): Promise<QuoteResponse>;

  /**
   * Build swap transaction (unsigned)
   */
  buildSwapTx?(request: QuoteRequest): Promise<{
    to: string;
    data: string;
    value: string;
    gasLimit: string;
  }>;
}

// ============================================
// Launchpad Types
// ============================================

/**
 * Supported chains for launchpads
 */
export type LaunchpadChain = 'base' | 'ethereum' | 'solana' | 'bsc' | 'arbitrum';

/**
 * Launchpad token model
 */
export interface LaunchpadToken {
  address: string;
  symbol: string;
  name: string;
  chain: LaunchpadChain;
  launchpad: string;
  creator?: string;
  createdAt: Date;
  marketCapUsd?: number;
  priceUsd?: number;
  imageUrl?: string;
  description?: string;
  verified?: boolean;
  warnings?: string[];
  extensions?: Record<string, unknown>;
  urls?: {
    launchpad?: string;
    explorer?: string;
    dex?: string;
    raydium?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Launchpad connector interface
 */
export interface LaunchpadConnector {
  readonly id: string;
  readonly name: string;
  readonly chain: LaunchpadChain;
  readonly type: 'launchpad';

  /**
   * Check if connector is enabled
   */
  isEnabled(): boolean;

  /**
   * Get connector status
   */
  getStatus(): Promise<{
    connected: boolean;
    latencyMs?: number;
    error?: string;
  }>;

  /**
   * Fetch recent token launches
   */
  fetchRecentLaunches(limit?: number): Promise<LaunchpadToken[]>;

  /**
   * Fetch new launches since last check
   */
  fetchNewLaunches?(): Promise<LaunchpadToken[]>;

  /**
   * Fetch token by address
   */
  fetchToken?(address: string): Promise<LaunchpadToken | null>;
}


