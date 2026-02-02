// Clanker API Integration
// Base chain launchpad token data from https://clanker.world
// API Docs: https://clanker.gitbook.io/clanker-documentation
// Note: Requests are proxied through ClawFi backend to avoid CORS issues

import { API_URL } from '../app/constants';

// Use our backend proxy to avoid CORS issues
export const CLANKER_PROXY_URL = `${API_URL}/launchpads/clanker`;

// Types based on Clanker API response
export interface ClankerToken {
	id: number;
	created_at: string;
	last_indexed: string;
	tx_hash: string;
	contract_address: string;
	name: string;
	symbol: string;
	description?: string;
	supply: string;
	img_url?: string;
	pool_address?: string;
	type: string;
	pair: string;
	chain_id: number;
	deployed_at: string;
	msg_sender: string;
	factory_address?: string;
	locker_address?: string;
	position_id?: string;
	warnings: string[];
	metadata?: {
		auditUrls?: string[];
		description?: string;
		socialMediaUrls?: { platform: string; url: string }[];
	};
	pool_config?: {
		pairedToken: string;
		tickIfToken0IsNewToken: number;
	};
	social_context?: {
		platform: string;
		messageId?: string;
		id?: string;
	};
	extensions?: {
		fees?: boolean;
		vault?: boolean;
		airdrop?: boolean;
	};
	related?: {
		user?: ClankerUser;
		market?: ClankerMarket;
	};
	trustStatus?: {
		isTrustedDeployer: boolean;
		isTrustedClanker: boolean;
		fidMatchesDeployer: boolean;
		verifiedAddresses: string[];
	};
}

export interface ClankerUser {
	fid: number;
	username: string;
	displayName?: string;
	pfpUrl?: string;
	verifiedAddresses?: string[];
	bio?: string;
}

export interface ClankerMarket {
	marketCap?: number;
	price?: number;
	priceChange24h?: number;
	priceChange1h?: number;
	volume24h?: number;
}

export interface ClankerTokensResponse {
	data: ClankerToken[];
	total: number;
	cursor?: string;
	tokensDeployed?: number;
}

export interface ClankerSearchResponse {
	tokens: ClankerToken[];
	user?: ClankerUser;
	searchedAddress?: string;
	total: number;
	hasMore: boolean;
}

export interface ClankerTokenParams {
	q?: string;
	fid?: number;
	fids?: string;
	pairAddress?: string;
	sort?: 'asc' | 'desc';
	sortBy?: 'market-cap' | 'tx-h24' | 'price-percent-h24' | 'price-percent-h1' | 'deployed-at';
	socialInterface?: string;
	limit?: number;
	cursor?: string;
	includeUser?: boolean;
	includeMarket?: boolean;
	startDate?: number;
	chainId?: number;
	champagne?: boolean;
}

export interface ClankerSearchParams {
	q: string;
	limit?: number;
	offset?: number;
	sort?: 'asc' | 'desc';
	trustedOnly?: boolean;
}

// Get auth token from localStorage
function getAuthToken(): string | null {
	if (typeof window !== 'undefined') {
		return localStorage.getItem('clawfi_token');
	}
	return null;
}

// Fetch helper for Clanker API (proxied through ClawFi backend)
async function fetchClanker<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
	const url = new URL(`${CLANKER_PROXY_URL}${endpoint}`);
	
	if (params) {
		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined && value !== null) {
				url.searchParams.append(key, String(value));
			}
		});
	}

	const token = getAuthToken();
	const headers: HeadersInit = {
		'Accept': 'application/json',
		'Content-Type': 'application/json',
	};
	
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}
	
	const response = await fetch(url.toString(), { headers });
	
	if (!response.ok) {
		if (response.status === 401 && typeof window !== 'undefined') {
			window.location.href = '/login';
		}
		const error = await response.json().catch(() => ({ error: { message: 'Request failed' } }));
		throw new Error(error.error?.message || `Clanker API error: ${response.status}`);
	}
	
	return response.json();
}

// Clanker API endpoints (proxied through ClawFi backend)
export const clankerApi = {
	// Get paginated list of tokens
	// Docs: https://clanker.gitbook.io/clanker-documentation/public/get-paginated-list-of-tokens
	getTokens: (params?: ClankerTokenParams) => 
		fetchClanker<ClankerTokensResponse>('/tokens', params as Record<string, string | number | boolean | undefined>),
	
	// Get tokens by creator (username or address)
	// Docs: https://clanker.gitbook.io/clanker-documentation/public/get-tokens-by-creator
	searchCreator: (params: ClankerSearchParams) =>
		fetchClanker<ClankerSearchResponse>('/search', params as Record<string, string | number | boolean | undefined>),
	
	// Convenience methods
	
	// Get latest tokens on Base with market data
	getLatestTokens: (limit = 20, includeMarket = true) =>
		fetchClanker<ClankerTokensResponse>('/tokens', {
			chainId: 8453, // Base chain
			limit,
			sort: 'desc',
			sortBy: 'deployed-at',
			includeMarket,
			includeUser: true,
		}),
	
	// Get top tokens by market cap
	getTopTokens: (limit = 20) =>
		fetchClanker<ClankerTokensResponse>('/tokens', {
			chainId: 8453,
			limit,
			sortBy: 'market-cap',
			sort: 'desc',
			includeMarket: true,
		}),
	
	// Get trending tokens (highest 24h price change)
	getTrendingTokens: (limit = 20) =>
		fetchClanker<ClankerTokensResponse>('/tokens', {
			chainId: 8453,
			limit,
			sortBy: 'price-percent-h24',
			sort: 'desc',
			includeMarket: true,
		}),
	
	// Search tokens by name or symbol
	searchTokens: (query: string, limit = 20) =>
		fetchClanker<ClankerTokensResponse>('/tokens', {
			q: query,
			chainId: 8453,
			limit,
			includeMarket: true,
		}),
	
	// Get token by contract address
	getTokenByAddress: (address: string) =>
		fetchClanker<{ success: boolean; data: ClankerToken }>(`/token/${address}`),
	
	// Get tokens created by a specific wallet
	getTokensByCreator: (address: string, limit = 50) =>
		fetchClanker<ClankerSearchResponse>('/search', {
			q: address,
			limit,
			sort: 'desc',
		}),
};

// Format helpers for Clanker data
export function formatClankerMarketCap(marketCap?: number, startingMcap?: number): string {
	// Use live market cap if available, otherwise show starting mcap
	const mcap = marketCap || startingMcap;
	if (!mcap) return 'New';
	if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(2)}M`;
	if (mcap >= 1_000) return `$${(mcap / 1_000).toFixed(1)}K`;
	return `$${mcap.toFixed(0)}`;
}

export function formatClankerPrice(price?: number): string {
	if (!price) return '-';
	if (price < 0.000001) return `$${price.toExponential(2)}`;
	if (price < 0.01) return `$${price.toFixed(6)}`;
	if (price < 1) return `$${price.toFixed(4)}`;
	return `$${price.toFixed(2)}`;
}

export function formatPriceChange(change?: number): { text: string; positive: boolean } {
	if (change === undefined || change === null) return { text: 'New', positive: true };
	const isPositive = change >= 0;
	return {
		text: `${isPositive ? '+' : ''}${change.toFixed(2)}%`,
		positive: isPositive,
	};
}

export function getClankerExplorerUrl(address: string): string {
	return `https://basescan.org/address/${address}`;
}

export function getClankerDexScreenerUrl(address: string): string {
	return `https://dexscreener.com/base/${address}`;
}

export function getClankerPoolUrl(poolAddress?: string): string {
	if (!poolAddress) return '#';
	return `https://app.uniswap.org/explore/pools/base/${poolAddress}`;
}

