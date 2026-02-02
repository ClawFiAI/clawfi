import { useEffect, useState } from 'react';
import { 
	clankerApi, 
	formatClankerMarketCap, 
	formatClankerPrice, 
	formatPriceChange,
	getClankerExplorerUrl,
	getClankerDexScreenerUrl,
	type ClankerToken 
} from '../lib/clanker';
import { formatRelativeTime, formatAddress } from '../lib/data';

type SortOption = 'latest' | 'market-cap' | 'trending' | 'volume';

export default function LaunchpadTokens() {
	const [tokens, setTokens] = useState<ClankerToken[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [sortBy, setSortBy] = useState<SortOption>('latest');
	const [searchQuery, setSearchQuery] = useState('');
	const [cursor, setCursor] = useState<string | undefined>();
	const [hasMore, setHasMore] = useState(false);
	const [total, setTotal] = useState(0);

	const fetchTokens = async (loadMore = false) => {
		try {
			setLoading(true);
			setError(null);

			let data;
			
			if (searchQuery.trim()) {
				// Search mode
				data = await clankerApi.searchTokens(searchQuery, 20);
			} else {
				// Browse mode based on sort
				const params: Record<string, string | number | boolean | undefined> = {
					chainId: 8453, // Base chain
					limit: 20,
					includeMarket: true,
					includeUser: true,
				};
				
				if (loadMore && cursor) {
					params.cursor = cursor;
				}

				switch (sortBy) {
					case 'market-cap':
						params.sortBy = 'market-cap';
						params.sort = 'desc';
						break;
					case 'trending':
						params.sortBy = 'price-percent-h24';
						params.sort = 'desc';
						break;
					case 'volume':
						params.sortBy = 'tx-h24';
						params.sort = 'desc';
						break;
					default: // latest
						params.sortBy = 'deployed-at';
						params.sort = 'desc';
				}

				data = await clankerApi.getTokens(params);
			}

			if (loadMore) {
				setTokens(prev => [...prev, ...data.data]);
			} else {
				setTokens(data.data);
			}
			
			setCursor(data.cursor);
			setHasMore(!!data.cursor && data.data.length === 20);
			setTotal(data.total);
		} catch (err) {
			console.error('Clanker API error:', err);
			setError(err instanceof Error ? err.message : 'Failed to load tokens from Clanker');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		setCursor(undefined);
		fetchTokens();
	}, [sortBy]);

	// Debounced search
	useEffect(() => {
		const timer = setTimeout(() => {
			if (searchQuery !== '') {
				setCursor(undefined);
				fetchTokens();
			}
		}, 300);
		return () => clearTimeout(timer);
	}, [searchQuery]);

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		setCursor(undefined);
		fetchTokens();
	};

	if (loading && tokens.length === 0) {
		return (
			<div className="space-y-4">
				<div className="flex flex-col md:flex-row gap-4 justify-between">
					<div className="h-10 bg-gray-700 rounded-lg w-64 animate-pulse"></div>
					<div className="h-10 bg-gray-700 rounded-lg w-48 animate-pulse"></div>
				</div>
				<div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
					<div className="divide-y divide-gray-700">
						{[...Array(5)].map((_, i) => (
							<div key={i} className="p-4 animate-pulse">
								<div className="flex items-center gap-4">
									<div className="w-10 h-10 rounded-lg bg-gray-700"></div>
									<div className="flex-1">
										<div className="h-4 bg-gray-700 rounded w-1/3 mb-2"></div>
										<div className="h-3 bg-gray-700 rounded w-1/2"></div>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="space-y-4">
				<div className="p-4 rounded-lg bg-red-900/30 border border-red-700/50 text-red-400">
					<div className="flex items-center gap-3">
						<svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
							<path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
						</svg>
						<div>
							<p className="font-medium">Failed to load Clanker tokens</p>
							<p className="text-sm opacity-80">{error}</p>
						</div>
					</div>
					<button 
						onClick={() => fetchTokens()} 
						className="mt-3 px-4 py-2 bg-red-800 hover:bg-red-700 rounded-lg text-sm transition-colors"
					>
						Retry
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Search and Filters */}
			<div className="flex flex-col md:flex-row gap-4 justify-between">
				<form onSubmit={handleSearch} className="relative">
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Search tokens..."
						className="w-full md:w-64 px-4 py-2 pl-10 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-primary-500 focus:border-primary-500"
					/>
					<svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
				</form>

				<div className="flex items-center gap-2">
					<span className="text-sm text-gray-400">Sort by:</span>
					<select
						value={sortBy}
						onChange={(e) => setSortBy(e.target.value as SortOption)}
						className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-primary-500 focus:border-primary-500"
					>
						<option value="latest">Latest</option>
						<option value="market-cap">Market Cap</option>
						<option value="trending">Trending (24h)</option>
						<option value="volume">Volume</option>
					</select>
				</div>
			</div>

			{/* Stats Bar */}
			<div className="flex items-center gap-4 text-sm text-gray-400">
				<span>{total.toLocaleString()} tokens on Base via Clanker</span>
				<a 
					href="https://clanker.world" 
					target="_blank" 
					rel="noopener noreferrer"
					className="text-primary-400 hover:text-primary-300 flex items-center gap-1"
				>
					Powered by Clanker
					<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
					</svg>
				</a>
			</div>

			{tokens.length === 0 ? (
				<div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
					<svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
					</svg>
					<h3 className="text-lg font-medium text-white mb-2">No tokens found</h3>
					<p className="text-gray-400">
						{searchQuery ? 'Try a different search term' : 'New token launches will appear here'}
					</p>
				</div>
			) : (
				<>
					{/* Token Grid */}
					<div className="grid gap-4">
						{tokens.map((token) => {
							const priceChange = formatPriceChange(token.related?.market?.priceChange24h);
							return (
								<div 
									key={token.id} 
									className="bg-gray-800 rounded-xl border border-gray-700 p-4 hover:border-gray-600 transition-colors"
								>
									<div className="flex items-start gap-4">
										{/* Token Image */}
										<div className="w-12 h-12 rounded-xl bg-gray-700 flex-shrink-0 overflow-hidden">
											{token.img_url ? (
												<img 
													src={token.img_url} 
													alt={token.symbol}
													className="w-full h-full object-cover"
													onError={(e) => {
														(e.target as HTMLImageElement).style.display = 'none';
													}}
												/>
											) : (
												<div className="w-full h-full flex items-center justify-center text-primary-400 font-bold text-lg">
													{token.symbol?.charAt(0) || '?'}
												</div>
											)}
										</div>

										{/* Token Info */}
										<div className="flex-1 min-w-0">
											<div className="flex items-start justify-between gap-2">
												<div>
													<h3 className="font-semibold text-white flex items-center gap-2">
														${token.symbol}
														{token.trustStatus?.isTrustedClanker && (
															<span className="px-1.5 py-0.5 text-xs bg-emerald-900/50 text-emerald-400 rounded">
																✓ Verified
															</span>
														)}
													</h3>
													<p className="text-sm text-gray-400 truncate">{token.name}</p>
												</div>
												<div className="text-right">
													<p className="font-medium text-white">
														{formatClankerMarketCap(token.related?.market?.marketCap, token.starting_market_cap)}
													</p>
													<p className={`text-sm ${priceChange.positive ? 'text-emerald-400' : priceChange.text === 'New' ? 'text-blue-400' : 'text-red-400'}`}>
														{priceChange.text}
													</p>
												</div>
											</div>

											{/* Token Details */}
											<div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
												<span className="px-2 py-1 bg-blue-900/30 text-blue-400 rounded">
													Base
												</span>
												<span className="px-2 py-1 bg-primary-900/30 text-primary-400 rounded">
													Clanker {token.type?.replace('clanker_', '')}
												</span>
												<span>
													{formatRelativeTime(new Date(token.deployed_at).getTime())}
												</span>
												<span className="font-mono">
													{formatAddress(token.contract_address, 4)}
												</span>
											</div>

											{/* Creator Info */}
											{token.related?.user && (
												<div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
													{token.related.user.pfpUrl && (
														<img 
															src={token.related.user.pfpUrl} 
															alt={token.related.user.username}
															className="w-4 h-4 rounded-full"
														/>
													)}
													<span>by @{token.related.user.username}</span>
												</div>
											)}

											{/* Action Links */}
											<div className="mt-3 flex items-center gap-3">
												<a
													href={getClankerExplorerUrl(token.contract_address)}
													target="_blank"
													rel="noopener noreferrer"
													className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
												>
													<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
													</svg>
													Basescan
												</a>
												<a
													href={getClankerDexScreenerUrl(token.contract_address)}
													target="_blank"
													rel="noopener noreferrer"
													className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
												>
													<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
													</svg>
													DexScreener
												</a>
												{token.pool_address && (
													<a
														href={`https://app.uniswap.org/explore/pools/base/${token.pool_address}`}
														target="_blank"
														rel="noopener noreferrer"
														className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
													>
														<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
														</svg>
														Trade
													</a>
												)}
											</div>
										</div>
									</div>
								</div>
							);
						})}
					</div>

					{/* Load More */}
					{hasMore && (
						<div className="flex justify-center">
							<button
								onClick={() => fetchTokens(true)}
								disabled={loading}
								className="px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
							>
								{loading ? (
									<>
										<svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
											<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
											<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
										</svg>
										Loading...
									</>
								) : (
									'Load More Tokens'
								)}
							</button>
						</div>
					)}
				</>
			)}
		</div>
	);
}
