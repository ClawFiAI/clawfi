import { useEffect, useState } from 'react';
import { API_URL } from '../app/constants';

interface TokenCandidate {
	address: string;
	symbol: string;
	name: string;
	chain: string;
	priceUsd: number;
	priceChange1h: number;
	priceChange24h: number;
	volume24h: number;
	liquidity: number;
	fdv: number;
	scores: {
		momentum: number;
		liquidity: number;
		risk: number;
		confidence: number;
		composite: number;
	};
	signals: string[];
	flags: Array<{ type: string; severity: string; message: string }>;
	discoveredAt: string;
}

interface RadarResult {
	candidate: TokenCandidate;
	conditionsPassed: number;
	conditionsTotal: number;
}

interface RadarResponse {
	success: boolean;
	data: {
		candidates: TokenCandidate[];
		summary: string;
		scannedAt: string;
	};
}

const SCORE_COLORS = {
	excellent: { bg: 'bg-emerald-900/40', text: 'text-emerald-400', border: 'border-emerald-700/50' },
	good: { bg: 'bg-blue-900/40', text: 'text-blue-400', border: 'border-blue-700/50' },
	moderate: { bg: 'bg-yellow-900/40', text: 'text-yellow-400', border: 'border-yellow-700/50' },
	risky: { bg: 'bg-red-900/40', text: 'text-red-400', border: 'border-red-700/50' },
};

function getScoreLevel(score: number) {
	if (score >= 80) return 'excellent';
	if (score >= 60) return 'good';
	if (score >= 40) return 'moderate';
	return 'risky';
}

function formatNumber(num: number): string {
	if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
	if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
	return `$${num.toFixed(0)}`;
}

function formatPrice(price: number): string {
	if (price < 0.000001) return `$${price.toExponential(2)}`;
	if (price < 0.01) return `$${price.toFixed(6)}`;
	if (price < 1) return `$${price.toFixed(4)}`;
	return `$${price.toFixed(2)}`;
}

export default function ClawFSignals() {
	const [candidates, setCandidates] = useState<TokenCandidate[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<string | null>(null);

	const fetchRadar = async () => {
		try {
			setLoading(true);
			const response = await fetch(`${API_URL}/clawf/radar?limit=15&includeSocial=false`);
			
			if (!response.ok) {
				throw new Error(`Failed to fetch: ${response.status}`);
			}
			
			const data: RadarResponse = await response.json();
			
			if (data.success && data.data?.candidates) {
				setCandidates(data.data.candidates);
				setLastUpdated(data.data.scannedAt);
			} else {
				setCandidates([]);
			}
			setError(null);
		} catch (err) {
			console.error('ClawF radar error:', err);
			setError(err instanceof Error ? err.message : 'Failed to fetch signals');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchRadar();
		// Refresh every 2 minutes
		const interval = setInterval(fetchRadar, 120000);
		return () => clearInterval(interval);
	}, []);

	if (loading && candidates.length === 0) {
		return (
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="h-6 bg-gray-700 rounded w-48 animate-pulse"></div>
					<div className="h-8 bg-gray-700 rounded w-24 animate-pulse"></div>
				</div>
				<div className="grid gap-4">
					{[...Array(5)].map((_, i) => (
						<div key={i} className="bg-gray-800 rounded-xl border border-gray-700 p-4 animate-pulse">
							<div className="flex items-center gap-4">
								<div className="w-12 h-12 rounded-lg bg-gray-700"></div>
								<div className="flex-1">
									<div className="h-5 bg-gray-700 rounded w-1/3 mb-2"></div>
									<div className="h-4 bg-gray-700 rounded w-1/2"></div>
								</div>
								<div className="h-8 bg-gray-700 rounded w-20"></div>
							</div>
						</div>
					))}
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-6 rounded-xl bg-red-900/30 border border-red-700/50 text-red-400">
				<div className="flex items-center gap-3">
					<svg className="w-6 h-6 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
						<path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
					</svg>
					<div>
						<p className="font-medium">Failed to load ClawF signals</p>
						<p className="text-sm opacity-80">{error}</p>
					</div>
				</div>
				<button 
					onClick={fetchRadar} 
					className="mt-4 px-4 py-2 bg-red-800 hover:bg-red-700 rounded-lg text-sm transition-colors"
				>
					Retry
				</button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<img src="/logo-square.png" alt="ClawFi" className="w-8 h-8 rounded-lg" />
					<div>
						<h2 className="text-lg font-semibold text-white">Pre-Pump Alerts</h2>
						<p className="text-sm text-gray-400">
							{candidates.length} tokens showing accumulation patterns
							{lastUpdated && ` • Updated ${new Date(lastUpdated).toLocaleTimeString()}`}
						</p>
					</div>
				</div>
				<button
					onClick={fetchRadar}
					disabled={loading}
					className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
				>
					{loading ? (
						<>
							<svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
								<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Scanning...
						</>
					) : (
						<>
							<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
							</svg>
							Refresh
						</>
					)}
				</button>
			</div>

			{candidates.length === 0 ? (
				<div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
					<span className="text-5xl mb-4 block">🔍</span>
					<h3 className="text-lg font-medium text-white mb-2">Scanning for opportunities</h3>
					<p className="text-gray-400">ClawF is analyzing accumulation patterns and whale activity. Check back soon!</p>
				</div>
			) : (
				<div className="grid gap-4">
					{candidates.map((token, index) => {
						const scoreLevel = getScoreLevel(token.scores.composite);
						const colors = SCORE_COLORS[scoreLevel];
						const hasHardFlags = token.flags?.some(f => f.severity === 'hard');
						
						return (
							<div 
								key={token.address}
								className={`bg-gray-800 rounded-xl border transition-all hover:border-gray-600 ${
									index === 0 ? 'border-primary-500/50 ring-1 ring-primary-500/20' : 'border-gray-700'
								}`}
							>
								<div className="p-4">
									<div className="flex items-start gap-4">
										{/* Rank Badge */}
										<div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg ${
											index === 0 ? 'bg-primary-600 text-white' : 
											index === 1 ? 'bg-gray-600 text-white' :
											index === 2 ? 'bg-amber-700 text-white' :
											'bg-gray-700 text-gray-400'
										}`}>
											#{index + 1}
										</div>

										{/* Token Info */}
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2 mb-1">
												<h3 className="font-semibold text-white text-lg">${token.symbol}</h3>
												<span className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded uppercase">
													{token.chain}
												</span>
												{hasHardFlags && (
													<span className="px-2 py-0.5 text-xs bg-red-900/50 text-red-400 rounded">
														⚠️ Risk
													</span>
												)}
											</div>
											<p className="text-sm text-gray-400 truncate">{token.name}</p>
											
											{/* Signals */}
											{token.signals && token.signals.length > 0 && (
												<div className="flex flex-wrap gap-2 mt-2">
													{token.signals.map((signal, i) => (
														<span key={i} className="px-2 py-1 text-xs bg-primary-900/30 text-primary-400 rounded">
															{signal}
														</span>
													))}
												</div>
											)}
										</div>

										{/* Score Badge */}
										<div className={`px-3 py-2 rounded-lg text-center ${colors.bg} ${colors.border} border`}>
											<div className={`text-2xl font-bold ${colors.text}`}>{token.scores.composite}</div>
											<div className="text-xs text-gray-400">Score</div>
										</div>
									</div>

									{/* Stats Grid */}
									<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-700">
										<div>
											<p className="text-xs text-gray-500 mb-1">Price</p>
											<p className="font-medium text-white">{formatPrice(token.priceUsd)}</p>
										</div>
										<div>
											<p className="text-xs text-gray-500 mb-1">Market Cap</p>
											<p className="font-medium text-white">{formatNumber(token.fdv)}</p>
										</div>
										<div>
											<p className="text-xs text-gray-500 mb-1">1h Change</p>
											<p className={`font-medium ${token.priceChange1h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
												{token.priceChange1h >= 0 ? '+' : ''}{token.priceChange1h?.toFixed(1)}%
											</p>
										</div>
										<div>
											<p className="text-xs text-gray-500 mb-1">Liquidity</p>
											<p className="font-medium text-white">{formatNumber(token.liquidity)}</p>
										</div>
									</div>

									{/* Score Breakdown */}
									<div className="grid grid-cols-4 gap-2 mt-3">
										<div className="text-center p-2 bg-gray-700/30 rounded">
											<div className="text-sm font-medium text-white">{token.scores.momentum}</div>
											<div className="text-xs text-gray-500">Momentum</div>
										</div>
										<div className="text-center p-2 bg-gray-700/30 rounded">
											<div className="text-sm font-medium text-white">{token.scores.liquidity}</div>
											<div className="text-xs text-gray-500">Liquidity</div>
										</div>
										<div className="text-center p-2 bg-gray-700/30 rounded">
											<div className="text-sm font-medium text-white">{token.scores.risk}</div>
											<div className="text-xs text-gray-500">Safety</div>
										</div>
										<div className="text-center p-2 bg-gray-700/30 rounded">
											<div className="text-sm font-medium text-white">{token.scores.confidence}</div>
											<div className="text-xs text-gray-500">Confidence</div>
										</div>
									</div>

									{/* Actions */}
									<div className="flex items-center gap-3 mt-4">
										<a
											href={`https://dexscreener.com/${token.chain}/${token.address}`}
											target="_blank"
											rel="noopener noreferrer"
											className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium text-center transition-colors"
										>
											View Chart
										</a>
										<a
											href={token.chain === 'solana' 
												? `https://jup.ag/swap/SOL-${token.address}`
												: `https://app.uniswap.org/swap?chain=${token.chain}&outputCurrency=${token.address}`
											}
											target="_blank"
											rel="noopener noreferrer"
											className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium text-center transition-colors"
										>
											Trade
										</a>
										<button
											onClick={() => navigator.clipboard.writeText(token.address)}
											className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
											title="Copy address"
										>
											📋
										</button>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			)}

			{/* Disclaimer */}
			<div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 text-xs text-gray-500">
				<p>
					⚠️ <strong>Not financial advice.</strong> ClawF detects accumulation patterns and pre-pump signals based on on-chain data.
					Predictions are for the next ~4 hours. Always do your own research. Crypto trading carries significant risk of loss.
				</p>
			</div>
		</div>
	);
}
