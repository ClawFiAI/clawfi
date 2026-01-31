/**
 * @clawfi/sdk
 * Typed client SDK for ClawFi API
 * 
 * Used by:
 * - Dashboard (Next.js)
 * - Chrome Extension
 * - External integrations
 */

import type {
  Signal,
  SignalFilter,
  RiskPolicy,
  UpdateRiskPolicy,
  KillSwitchRequest,
  AuditLog,
  AuditLogFilter,
  ApiResponse,
  PaginatedResponse,
  Pagination,
} from '@clawfi/core';

/**
 * SDK Configuration
 */
export interface ClawFiSDKConfig {
  baseUrl: string;
  wsUrl?: string;
  authToken?: string;
  timeout?: number;
}

/**
 * Auth types
 */
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: number;
}

/**
 * Connector types
 */
export interface ConnectorInfo {
  id: string;
  type: string;
  venue: string;
  label?: string;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'error';
  lastCheck?: number;
  createdAt: number;
}

export interface AddBinanceConnectorRequest {
  label?: string;
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
}

export interface Balance {
  asset: string;
  free: string;
  locked: string;
  total: string;
  usdValue?: number;
}

/**
 * Strategy types
 */
export interface StrategyInfo {
  id: string;
  strategyType: string;
  name: string;
  description?: string;
  status: 'enabled' | 'disabled' | 'error';
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface UpdateStrategyRequest {
  status?: 'enabled' | 'disabled';
  name?: string;
  description?: string;
  config?: Record<string, unknown>;
}

/**
 * System status
 */
export interface SystemStatus {
  killSwitchActive: boolean;
  activeConnectors: number;
  activeStrategies: number;
  signalsToday: number;
  lastEventTs?: number;
}

/**
 * HTTP client wrapper
 */
async function request<T>(
  config: ClawFiSDKConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${config.baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.authToken) {
    headers['Authorization'] = `Bearer ${config.authToken}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined,
  });

  const data = await response.json() as ApiResponse<T>;

  if (!response.ok || !data.success) {
    throw new ClawFiError(
      data.error?.message ?? 'Request failed',
      data.error?.code ?? 'UNKNOWN_ERROR',
      response.status
    );
  }

  return data.data as T;
}

/**
 * ClawFi Error class
 */
export class ClawFiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ClawFiError';
  }
}

/**
 * ClawFi SDK Client
 */
export class ClawFiClient {
  private config: ClawFiSDKConfig;
  private ws: WebSocket | null = null;
  private wsListeners: Map<string, Set<(data: unknown) => void>> = new Map();

  constructor(config: ClawFiSDKConfig) {
    this.config = { timeout: 10000, ...config };
  }

  /**
   * Set auth token
   */
  setAuthToken(token: string): void {
    this.config.authToken = token;
  }

  /**
   * Clear auth token
   */
  clearAuthToken(): void {
    this.config.authToken = undefined;
  }

  // ============================================
  // Auth endpoints
  // ============================================

  async register(data: RegisterRequest): Promise<AuthResponse> {
    return request(this.config, 'POST', '/auth/register', data);
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    return request(this.config, 'POST', '/auth/login', data);
  }

  async getMe(): Promise<User> {
    return request(this.config, 'GET', '/me');
  }

  // ============================================
  // Health endpoint
  // ============================================

  async getHealth(): Promise<{ status: string; timestamp: number }> {
    return request(this.config, 'GET', '/health');
  }

  async getSystemStatus(): Promise<SystemStatus> {
    return request(this.config, 'GET', '/status');
  }

  // ============================================
  // Connector endpoints
  // ============================================

  async getConnectors(): Promise<ConnectorInfo[]> {
    return request(this.config, 'GET', '/connectors');
  }

  async addBinanceConnector(data: AddBinanceConnectorRequest): Promise<ConnectorInfo> {
    return request(this.config, 'POST', '/connectors/binance', data);
  }

  async removeConnector(id: string): Promise<void> {
    return request(this.config, 'DELETE', `/connectors/${id}`);
  }

  async getConnectorBalances(id: string): Promise<Balance[]> {
    return request(this.config, 'GET', `/connectors/${id}/balances`);
  }

  async testConnector(id: string): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
    return request(this.config, 'POST', `/connectors/${id}/test`);
  }

  // ============================================
  // Strategy endpoints
  // ============================================

  async getStrategies(): Promise<StrategyInfo[]> {
    return request(this.config, 'GET', '/strategies');
  }

  async getStrategy(id: string): Promise<StrategyInfo> {
    return request(this.config, 'GET', `/strategies/${id}`);
  }

  async updateStrategy(id: string, data: UpdateStrategyRequest): Promise<StrategyInfo> {
    return request(this.config, 'PATCH', `/strategies/${id}`, data);
  }

  // ============================================
  // Signal endpoints
  // ============================================

  async getSignals(
    filter?: SignalFilter,
    pagination?: Partial<Pagination>
  ): Promise<PaginatedResponse<Signal>> {
    const params = new URLSearchParams();
    
    if (filter) {
      Object.entries(filter).forEach(([key, value]) => {
        if (value !== undefined) {
          params.set(key, String(value));
        }
      });
    }
    
    if (pagination) {
      if (pagination.page) params.set('page', String(pagination.page));
      if (pagination.limit) params.set('limit', String(pagination.limit));
    }

    const query = params.toString();
    return request(this.config, 'GET', `/signals${query ? `?${query}` : ''}`);
  }

  async acknowledgeSignal(id: string): Promise<Signal> {
    return request(this.config, 'POST', `/signals/${id}/acknowledge`);
  }

  async getSignalsByToken(token: string, chain?: string, limit?: number): Promise<Signal[]> {
    const params = new URLSearchParams({ token: token.toLowerCase() });
    if (chain) params.set('chain', chain.toLowerCase());
    if (limit) params.set('limit', String(limit));
    return request(this.config, 'GET', `/signals/token?${params.toString()}`);
  }

  // ============================================
  // Risk endpoints
  // ============================================

  async getRiskPolicy(): Promise<RiskPolicy> {
    return request(this.config, 'GET', '/risk/policy');
  }

  async updateRiskPolicy(data: UpdateRiskPolicy): Promise<RiskPolicy> {
    return request(this.config, 'POST', '/risk/policy', data);
  }

  async setKillSwitch(data: KillSwitchRequest): Promise<{ active: boolean }> {
    return request(this.config, 'POST', '/risk/killswitch', data);
  }

  // ============================================
  // Audit endpoints
  // ============================================

  async getAuditLogs(
    filter?: AuditLogFilter,
    pagination?: Partial<Pagination>
  ): Promise<PaginatedResponse<AuditLog>> {
    const params = new URLSearchParams();
    
    if (filter) {
      Object.entries(filter).forEach(([key, value]) => {
        if (value !== undefined) {
          params.set(key, String(value));
        }
      });
    }
    
    if (pagination) {
      if (pagination.page) params.set('page', String(pagination.page));
      if (pagination.limit) params.set('limit', String(pagination.limit));
    }

    const query = params.toString();
    return request(this.config, 'GET', `/audit${query ? `?${query}` : ''}`);
  }

  // ============================================
  // WebSocket methods
  // ============================================

  private wsReconnectAttempts = 0;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wsHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private wsConnecting = false;
  private wsManualClose = false;

  /**
   * WebSocket configuration
   */
  private wsConfig = {
    reconnect: true,
    maxReconnectAttempts: 10,
    reconnectInterval: 1000,
    maxReconnectInterval: 30000,
    heartbeatInterval: 30000,
  };

  /**
   * Configure WebSocket behavior
   */
  configureWebSocket(options: {
    reconnect?: boolean;
    maxReconnectAttempts?: number;
    reconnectInterval?: number;
    maxReconnectInterval?: number;
    heartbeatInterval?: number;
  }): void {
    Object.assign(this.wsConfig, options);
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  connectWebSocket(): void {
    if (this.ws || this.wsConnecting) {
      return;
    }

    this.wsManualClose = false;
    this.wsConnecting = true;

    const wsUrl = this.config.wsUrl ?? this.config.baseUrl.replace(/^http/, 'ws');
    const url = new URL('/ws', wsUrl);
    
    if (this.config.authToken) {
      url.searchParams.set('token', this.config.authToken);
    }

    try {
      this.ws = new WebSocket(url.toString());
    } catch (err) {
      this.wsConnecting = false;
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.wsConnecting = false;
      this.wsReconnectAttempts = 0;
      this.startHeartbeat();
      
      // Notify connection listeners
      const listeners = this.wsListeners.get('connected');
      listeners?.forEach((callback) => callback(null));
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as { type: string; data: unknown };
        
        // Handle pong response (heartbeat acknowledgment)
        if (message.type === 'pong') {
          return;
        }

        const listeners = this.wsListeners.get(message.type);
        listeners?.forEach((callback) => callback(message.data));
        
        // Also notify 'all' listeners
        const allListeners = this.wsListeners.get('all');
        allListeners?.forEach((callback) => callback(message));
      } catch {
        // Ignore parse errors
      }
    };

    this.ws.onerror = () => {
      // Error will be followed by close event
    };

    this.ws.onclose = (event) => {
      this.wsConnecting = false;
      this.ws = null;
      this.stopHeartbeat();
      
      // Notify disconnection listeners
      const listeners = this.wsListeners.get('disconnected');
      listeners?.forEach((callback) => callback({ code: event.code, reason: event.reason }));

      // Reconnect unless manually closed
      if (!this.wsManualClose && this.wsConfig.reconnect) {
        this.scheduleReconnect();
      }
    };
  }

  /**
   * Schedule WebSocket reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.wsReconnectTimer) {
      return;
    }

    if (this.wsReconnectAttempts >= this.wsConfig.maxReconnectAttempts) {
      const listeners = this.wsListeners.get('reconnect_failed');
      listeners?.forEach((callback) => callback(null));
      return;
    }

    const delay = Math.min(
      this.wsConfig.reconnectInterval * Math.pow(2, this.wsReconnectAttempts),
      this.wsConfig.maxReconnectInterval
    );

    this.wsReconnectAttempts++;

    // Notify reconnecting listeners
    const listeners = this.wsListeners.get('reconnecting');
    listeners?.forEach((callback) => callback({ attempt: this.wsReconnectAttempts, delay }));

    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this.connectWebSocket();
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.wsHeartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, this.wsConfig.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.wsHeartbeatTimer) {
      clearInterval(this.wsHeartbeatTimer);
      this.wsHeartbeatTimer = null;
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    this.wsManualClose = true;
    
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.wsReconnectAttempts = 0;
  }

  /**
   * Check if WebSocket is connected
   */
  isWebSocketConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Subscribe to WebSocket messages
   */
  onMessage(type: string, callback: (data: unknown) => void): () => void {
    if (!this.wsListeners.has(type)) {
      this.wsListeners.set(type, new Set());
    }
    this.wsListeners.get(type)!.add(callback);

    return () => {
      this.wsListeners.get(type)?.delete(callback);
    };
  }

  /**
   * Subscribe to WebSocket connection events
   */
  onConnected(callback: () => void): () => void {
    return this.onMessage('connected', callback as (data: unknown) => void);
  }

  /**
   * Subscribe to WebSocket disconnection events
   */
  onDisconnected(callback: (event: { code: number; reason: string }) => void): () => void {
    return this.onMessage('disconnected', callback as (data: unknown) => void);
  }

  /**
   * Subscribe to reconnection attempts
   */
  onReconnecting(callback: (info: { attempt: number; delay: number }) => void): () => void {
    return this.onMessage('reconnecting', callback as (data: unknown) => void);
  }

  /**
   * Subscribe to signal updates
   */
  onSignal(callback: (signal: Signal) => void): () => void {
    return this.onMessage('signal', callback as (data: unknown) => void);
  }

  /**
   * Subscribe to system status updates
   */
  onSystemStatus(callback: (status: SystemStatus) => void): () => void {
    return this.onMessage('system_status', callback as (data: unknown) => void);
  }
}

/**
 * Create a ClawFi client instance
 */
export function createClawFiClient(config: ClawFiSDKConfig): ClawFiClient {
  return new ClawFiClient(config);
}

// Re-export chain utilities
export * from './chains.js';

