// ClawFi Data Utilities

import { API_URL } from '../app/constants';

// Authentication token storage
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
	authToken = token;
	if (typeof window !== 'undefined') {
		if (token) {
			localStorage.setItem('clawfi_token', token);
		} else {
			localStorage.removeItem('clawfi_token');
		}
	}
}

export function getAuthToken(): string | null {
	if (authToken) return authToken;
	if (typeof window !== 'undefined') {
		authToken = localStorage.getItem('clawfi_token');
	}
	return authToken;
}

// URL helper
export function url(path = '') {
	const base = import.meta.env.BASE_URL || '/';
	return `${base}${path}`;
}

// API fetch helper with authentication
export async function fetchAPI<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
	const token = getAuthToken();
	
	const headers: HeadersInit = {
		'Content-Type': 'application/json',
		...(options.headers || {}),
	};
	
	if (token) {
		(headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
	}
	
	const response = await fetch(`${API_URL}${endpoint}`, {
		...options,
		headers,
	});
	
	if (!response.ok) {
		if (response.status === 401) {
			setAuthToken(null);
			if (typeof window !== 'undefined') {
				window.location.href = '/login';
			}
		}
		const error = await response.json().catch(() => ({ message: 'Request failed' }));
		throw new Error(error.message || `API error: ${response.status}`);
	}
	
	return response.json();
}

// API Endpoints
export const api = {
	// Auth
	login: (email: string, password: string) =>
		fetchAPI<{ token: string; user: User }>('/auth/login', {
			method: 'POST',
			body: JSON.stringify({ email, password }),
		}),
	
	logout: () => fetchAPI('/auth/logout', { method: 'POST' }),
	
	getMe: () => fetchAPI<User>('/auth/me'),
	
	// System (uses agent status endpoint)
	getStatus: () => fetchAPI<{ data: AgentStatus }>('/agent/status').then(r => ({
		version: r.data.version,
		uptime: r.data.uptimeSeconds,
		killSwitchActive: r.data.killSwitchActive,
		dryRunMode: r.data.dryRunMode,
		activeConnectors: r.data.connectors.connected,
		activeStrategies: r.data.strategies.enabled,
		signalsToday: r.data.signalsToday,
	})),
	
	// Agent
	getAgentStatus: () => fetchAPI<AgentStatus>('/agent/status'),
	
	sendCommand: (command: string) =>
		fetchAPI<CommandResult>('/agent/command', {
			method: 'POST',
			body: JSON.stringify({ command }),
		}),
	
	// Connections
	getConnections: () => fetchAPI<Connection[]>('/connections'),
	
	testConnection: (id: string) =>
		fetchAPI<{ success: boolean; latencyMs?: number; error?: string }>(
			`/connections/${id}/test`,
			{ method: 'POST' }
		),
	
	startConnection: (id: string) =>
		fetchAPI(`/connections/${id}/start`, { method: 'POST' }),
	
	stopConnection: (id: string) =>
		fetchAPI(`/connections/${id}/stop`, { method: 'POST' }),
	
	// Signals
	getSignals: (params?: SignalParams) => {
		const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
		return fetchAPI<PaginatedResponse<Signal>>(`/signals${query}`);
	},
	
	acknowledgeSignal: (id: string) =>
		fetchAPI(`/signals/${id}/acknowledge`, { method: 'POST' }),
	
	// Risk
	getRiskPolicy: () => fetchAPI<RiskPolicy>('/risk/policy'),
	
	updateRiskPolicy: (policy: Partial<RiskPolicy>) =>
		fetchAPI<RiskPolicy>('/risk/policy', {
			method: 'PUT',
			body: JSON.stringify(policy),
		}),
	
	setKillSwitch: (active: boolean) =>
		fetchAPI<RiskPolicy>('/risk/killswitch', {
			method: 'POST',
			body: JSON.stringify({ active }),
		}),
	
	// Strategies
	getStrategies: () => fetchAPI<Strategy[]>('/strategies'),
	
	enableStrategy: (id: string) =>
		fetchAPI(`/strategies/${id}/enable`, { method: 'POST' }),
	
	disableStrategy: (id: string) =>
		fetchAPI(`/strategies/${id}/disable`, { method: 'POST' }),
	
	// Launchpads
	getLaunchpadTokens: (params?: { page?: number; limit?: number }) => {
		const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
		return fetchAPI<PaginatedResponse<LaunchpadToken>>(`/launchpads/tokens${query}`);
	},
	
	// Audit
	getAuditLogs: (params?: AuditParams) => {
		const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
		return fetchAPI<PaginatedResponse<AuditLog>>(`/audit${query}`);
	},
	
	// Watched items
	getWatchedTokens: () => fetchAPI<WatchedToken[]>('/agent/watched/tokens'),
	getWatchedWallets: () => fetchAPI<WatchedWallet[]>('/agent/watched/wallets'),

	// AI Features
	getAIStatus: () => fetchAPI<{ data: { available: boolean; model: string } }>('/agent/ai/status'),
	
	analyzeToken: (params: {
		address: string;
		chain?: string;
		symbol?: string;
		name?: string;
		price?: number;
		priceChange24h?: number;
		volume24h?: number;
		marketCap?: number;
		liquidity?: number;
		holders?: number;
	}) => fetchAPI<{ data: TokenAnalysis }>('/agent/ai/analyze', {
		method: 'POST',
		body: JSON.stringify(params),
	}),

	rateSignal: (signalId: string) => fetchAPI<{ data: SignalRating }>('/agent/ai/rate', {
		method: 'POST',
		body: JSON.stringify({ signalId }),
	}),

	askAI: (question: string) => fetchAPI<{ data: TradingAdvice }>('/agent/ai/ask', {
		method: 'POST',
		body: JSON.stringify({ question }),
	}),

	chatAI: (message: string) => fetchAPI<{ data: CommandResult }>('/agent/ai/chat', {
		method: 'POST',
		body: JSON.stringify({ message }),
	}),
};

// Types
export interface User {
	id: string;
	email: string;
	name?: string;
}

export interface SystemStatus {
	version: string;
	uptime: number;
	killSwitchActive: boolean;
	dryRunMode: boolean;
	activeConnectors: number;
	activeStrategies: number;
	signalsToday: number;
}

export interface AgentStatus {
	version: string;
	uptimeSeconds: number;
	uptimeFormatted: string;
	killSwitchActive: boolean;
	dryRunMode: boolean;
	connectors: {
		total: number;
		connected: number;
		degraded: number;
		offline: number;
		error: number;
	};
	strategies: {
		total: number;
		enabled: number;
		disabled: number;
		error: number;
	};
	signalsToday: number;
	watchedTokens: number;
	watchedWallets: number;
	responseTimeMs: number;
}

export interface CommandResult {
	success: boolean;
	action: string;
	message: string;
	data?: Record<string, unknown>;
}

export interface Connection {
	id: string;
	name: string;
	type: 'cex' | 'dex' | 'launchpad' | 'wallet';
	venue: string;
	chain?: string;
	status: 'connected' | 'degraded' | 'offline' | 'disconnected';
	enabled: boolean;
	lastCheck?: number;
	lastError?: string;
	config: Record<string, unknown>;
}

export interface Signal {
	id: string;
	ts: number;
	severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
	signalType: string;
	title: string;
	summary: string;
	token?: string;
	tokenSymbol?: string;
	chain?: string;
	wallet?: string;
	venue?: string;
	strategyId: string;
	evidence?: Record<string, unknown>;
	recommendedAction: string;
	acknowledged: boolean;
	acknowledgedAt?: number;
	acknowledgedBy?: string;
}

export interface RiskPolicy {
	id: string;
	maxOrderUsd: number;
	maxPositionUsd: number;
	maxDailyLossUsd: number;
	maxSlippageBps: number;
	cooldownSeconds: number;
	tokenAllowlist: string[];
	tokenDenylist: string[];
	venueAllowlist: string[];
	chainAllowlist: string[];
	killSwitchActive: boolean;
	dryRunMode: boolean;
}

export interface Strategy {
	id: string;
	strategyType: string;
	name: string;
	description?: string;
	status: 'enabled' | 'disabled' | 'error';
	config: Record<string, unknown>;
}

export interface LaunchpadToken {
	id: string;
	chain: string;
	launchpad: string;
	tokenAddress: string;
	tokenName?: string;
	tokenSymbol?: string;
	creatorAddress: string;
	blockNumber: number;
	blockTimestamp?: string;
	coverageStatus: string;
	riskScore?: number;
}

export interface AuditLog {
	id: string;
	ts: number;
	action: string;
	userId?: string;
	resource?: string;
	resourceId?: string;
	details?: Record<string, unknown>;
	success: boolean;
	errorMessage?: string;
	ip?: string;
	userAgent?: string;
}

export interface WatchedToken {
	id: string;
	chain: string;
	tokenAddress: string;
	tags: string[];
}

export interface WatchedWallet {
	id: string;
	chain: string;
	walletAddress: string;
	tags: string[];
}

export interface PaginatedResponse<T> {
	data: T[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

export interface SignalParams {
	severity?: string;
	signalType?: string;
	chain?: string;
	acknowledged?: string;
	page?: string;
	limit?: string;
}

export interface AuditParams {
	action?: string;
	userId?: string;
	resource?: string;
	success?: string;
	page?: string;
	limit?: string;
}

// AI Types
export interface TokenAnalysis {
	symbol: string;
	address: string;
	chain: string;
	riskScore: number;
	sentiment: 'bullish' | 'bearish' | 'neutral';
	summary: string;
	strengths: string[];
	weaknesses: string[];
	recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
	confidence: number;
}

export interface SignalRating {
	signalId: string;
	importance: number;
	actionRequired: boolean;
	reasoning: string;
	suggestedAction: string;
}

export interface TradingAdvice {
	question: string;
	answer: string;
	disclaimers: string[];
	relatedTokens?: string[];
}

// Format helpers
export function formatRelativeTime(ts: number): string {
	const seconds = Math.floor((Date.now() - ts) / 1000);
	
	if (seconds < 60) return 'just now';
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
	
	return new Date(ts).toLocaleDateString();
}

export function formatAddress(address: string, chars = 6): string {
	if (address.length <= chars * 2 + 2) return address;
	return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatNumber(num: number): string {
	if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
	if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
	return num.toString();
}

export function formatUptime(seconds: number): string {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}
