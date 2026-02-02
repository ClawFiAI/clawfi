import { useEffect, useState } from 'react';
import { API_URL } from '../app/constants';

interface GemPerformance {
	gainSinceDetection: number;
	peakGain: number;
	hoursTracked: number;
	detectedAt: string;
}

interface SocialSignals {
	mentionCount?: number;
	mentionVelocity?: number;
	spikeDetected?: boolean;
}

interface GemCandidate {
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
	conditionsPassed: number;
	conditionsTotal: number;
	performance?: GemPerformance | null;
	socialSignals?: SocialSignals;
}

interface GemStats {
	totalTracked: number;
	avgGain: number;
	topGain: number;
	winRate: number;
}

interface GemResponse {
	success: boolean;
	data: {
		count: number;
		gems: GemCandidate[];
		stats?: GemStats;
	};
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

export default function GemHunter() {
	const [gems, setGems] = useState<GemCandidate[]>([]);
	const [stats, setStats] = useState<GemStats | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

	const fetchGems = async () => {
		try {
			// Don't clear gems while loading - keep showing previous results
			setLoading(true);
			const response = await fetch(`${API_URL}/clawf/gems?limit=10`);
			
			if (!response.ok) {
				throw new Error(`Failed to fetch: ${response.status}`);
			}
			
			const data: GemResponse = await response.json();
			
			if (data.success && data.data?.gems) {
				// Only update if we got results
				if (data.data.gems.length > 0) {
					setGems(data.data.gems);
				}
				if (data.data.stats) {
					setStats(data.data.stats);
				}
				setLastUpdated(new Date());
				setError(null);
			}
			// Don't clear gems on empty response - keep previous
		} catch (err) {
			console.error('GemHunter error:', err);
			// Only show error if we have no gems to display
			if (gems.length === 0) {
				setError(err instanceof Error ? err.message : 'Failed to fetch gems');
			}
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchGems();
		// Refresh every 30 seconds for real-time gem hunting
		const interval = setInterval(fetchGems, 30000);
		return () => clearInterval(interval);
	}, []);

	// Get the best signal (moonshot > prime gem > ultra fresh)
	const getBestSignal = (signals: string[]) => {
		const moonshot = signals.find(s => s.includes('MOONSHOT'));
		if (moonshot) return { text: '🦀 MOONSHOT', class: 'bg-primary-600 text-white animate-pulse' };
		
		const prime = signals.find(s => s.includes('PRIME GEM'));
		if (prime) return { text: '🦀 PRIME', class: 'bg-emerald-600 text-white' };
		
		const parabolic = signals.find(s => s.includes('PARABOLIC'));
		if (parabolic) return { text: '🚀 PARABOLIC', class: 'bg-orange-600 text-white' };
		
		const fresh = signals.find(s => s.includes('ULTRA FRESH'));
		if (fresh) return { text: '🆕 FRESH', class: 'bg-blue-600 text-white' };
		
		return { text: '💎 GEM', class: 'bg-gray-600 text-white' };
	};

	// Only show skeleton on initial load when we have no gems
	if (gems.length === 0 && loading) {
		return (
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<span className="text-3xl animate-bounce">🦀</span>
						<div>
							<h2 className="text-xl font-bold text-white">ClawF is scanning...</h2>
							<p className="text-sm text-gray-400">Finding opportunities across all chains</p>
						</div>
					</div>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{[...Array(4)].map((_, i) => (
						<div key={i} className="bg-gray-800 rounded-xl border border-gray-700 p-4 animate-pulse h-48"></div>
					))}
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-6 rounded-xl bg-red-900/30 border border-red-700/50 text-red-400">
				<p className="font-medium">Failed to load gems: {error}</p>
				<button onClick={fetchGems} className="mt-4 px-4 py-2 bg-red-800 hover:bg-red-700 rounded-lg text-sm">
					Retry
				</button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-3">
						<div className="relative">
							<div className={`w-3 h-3 rounded-full absolute -top-1 -right-1 ${loading ? 'bg-yellow-500 animate-ping' : 'bg-emerald-500 animate-pulse'}`}></div>
							<span className="text-3xl">🦀</span>
						</div>
						<div>
							<h2 className="text-xl font-bold text-white flex items-center gap-2">
								ClawF Finds
								{loading && gems.length > 0 && (
									<span className="text-xs font-normal text-yellow-400 animate-pulse">updating...</span>
								)}
							</h2>
							<p className="text-sm text-gray-400">
								{gems.length > 0 ? `${gems.length} opportunities detected` : 'Scanning...'}
								{lastUpdated && ` • ${lastUpdated.toLocaleTimeString()}`}
							</p>
						</div>
					</div>
				</div>
				<button
					onClick={fetchGems}
					disabled={loading}
					className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
				>
					{loading ? (
						<>
							<svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
								<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
							</svg>
							Working...
						</>
					) : (
						<>🔄 Refresh</>
					)}
				</button>
			</div>

			{/* Performance Stats */}
			{stats && stats.totalTracked > 0 && (
				<div className="grid grid-cols-4 gap-3 p-3 bg-gray-800/50 rounded-xl border border-gray-700/50">
					<div className="text-center">
						<div className="text-xl font-bold text-white">{stats.totalTracked}</div>
						<div className="text-xs text-gray-400">Tracked</div>
					</div>
					<div className="text-center">
						<div className={`text-xl font-bold ${stats.avgGain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
							{stats.avgGain >= 0 ? '+' : ''}{stats.avgGain}%
						</div>
						<div className="text-xs text-gray-400">Avg Gain</div>
					</div>
					<div className="text-center">
						<div className="text-xl font-bold text-yellow-400">+{stats.topGain}%</div>
						<div className="text-xs text-gray-400">Best</div>
					</div>
					<div className="text-center">
						<div className={`text-xl font-bold ${stats.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
							{stats.winRate}%
						</div>
						<div className="text-xs text-gray-400">Win Rate</div>
					</div>
				</div>
			)}

			{/* Gems Grid */}
			{gems.length === 0 ? (
				<div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
					<span className="text-5xl mb-4 block">🦀</span>
					<h3 className="text-lg font-medium text-white mb-2">ClawF is analyzing markets...</h3>
					<p className="text-gray-400">The agent is scanning for opportunities. Results will appear here.</p>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{gems.map((gem, index) => {
						const signal = getBestSignal(gem.signals);
						const isMoonshot = gem.signals.some(s => s.includes('MOONSHOT'));
						const isParabolic = gem.priceChange1h > 100;
						
						return (
							<div 
								key={gem.address}
								className={`bg-gray-800 rounded-xl border transition-all hover:scale-[1.02] ${
									isMoonshot ? 'border-primary-500 ring-2 ring-primary-500/30 animate-pulse' :
									isParabolic ? 'border-orange-500' :
									index === 0 ? 'border-primary-500' : 
									'border-gray-700'
								}`}
							>
								<div className="p-4">
									{/* Header */}
									<div className="flex items-start justify-between mb-3">
										<div className="flex items-center gap-2 flex-wrap">
											<span className="text-2xl font-bold text-white">${gem.symbol}</span>
											<span className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded uppercase">
												{gem.chain}
											</span>
											{gem.socialSignals && gem.socialSignals.mentionCount && gem.socialSignals.mentionCount > 0 && (
												<span className={`px-2 py-0.5 text-xs rounded flex items-center gap-1 ${
													gem.socialSignals.spikeDetected 
														? 'bg-sky-500/30 text-sky-300 border border-sky-500/50' 
														: 'bg-gray-700 text-gray-300'
												}`}>
													𝕏 {gem.socialSignals.mentionCount}
													{gem.socialSignals.spikeDetected && ' 🔥'}
												</span>
											)}
										</div>
										<div className={`px-3 py-1 rounded-full text-xs font-bold ${signal.class}`}>
											{signal.text}
										</div>
									</div>

									{/* Score */}
									<div className="flex items-center gap-4 mb-3">
										<div className="flex-1">
											<div className="flex justify-between text-sm mb-1">
												<span className="text-gray-400">Score</span>
												<span className="text-white font-bold">{gem.scores.composite}</span>
											</div>
											<div className="h-2 bg-gray-700 rounded-full overflow-hidden">
												<div 
													className={`h-full rounded-full transition-all ${
														gem.scores.composite >= 90 ? 'bg-emerald-500' :
														gem.scores.composite >= 80 ? 'bg-blue-500' :
														gem.scores.composite >= 70 ? 'bg-yellow-500' :
														'bg-red-500'
													}`}
													style={{ width: `${gem.scores.composite}%` }}
												></div>
											</div>
										</div>
										<div className="text-right">
											<div className={`text-2xl font-bold ${gem.priceChange1h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
												{gem.priceChange1h >= 0 ? '+' : ''}{gem.priceChange1h.toFixed(0)}%
											</div>
											<div className="text-xs text-gray-400">1h change</div>
										</div>
									</div>

								{/* Performance since ClawF detected */}
								{gem.performance && gem.performance.hoursTracked > 0.1 && (
									<div className={`mb-3 p-2 rounded-lg ${
										gem.performance.gainSinceDetection >= 100 ? 'bg-emerald-900/40 border border-emerald-500/50' :
										gem.performance.gainSinceDetection >= 50 ? 'bg-emerald-900/30 border border-emerald-500/30' :
										gem.performance.gainSinceDetection > 0 ? 'bg-emerald-900/20' :
										'bg-red-900/20'
									}`}>
										<div className="flex items-center justify-between">
											<div className="text-xs text-gray-400">Since ClawF found it</div>
											<div className={`text-lg font-bold ${
												gem.performance.gainSinceDetection >= 0 ? 'text-emerald-400' : 'text-red-400'
											}`}>
												{gem.performance.gainSinceDetection >= 0 ? '+' : ''}{gem.performance.gainSinceDetection.toFixed(0)}%
											</div>
										</div>
										{gem.performance.peakGain > gem.performance.gainSinceDetection && gem.performance.peakGain > 10 && (
											<div className="flex items-center justify-between mt-1">
												<div className="text-xs text-gray-500">Peak gain</div>
												<div className="text-sm text-yellow-400">+{gem.performance.peakGain.toFixed(0)}%</div>
											</div>
										)}
										<div className="text-xs text-gray-500 mt-1">
											Tracking for {gem.performance.hoursTracked < 1 
												? `${Math.round(gem.performance.hoursTracked * 60)}min` 
												: `${gem.performance.hoursTracked.toFixed(1)}h`}
										</div>
									</div>
								)}

								{/* Stats */}
								<div className="grid grid-cols-3 gap-2 mb-3">
									<div className="bg-gray-700/30 rounded p-2 text-center">
										<div className="text-white font-medium">{formatNumber(gem.fdv)}</div>
										<div className="text-xs text-gray-400">MCap</div>
									</div>
									<div className="bg-gray-700/30 rounded p-2 text-center">
										<div className="text-white font-medium">{formatNumber(gem.liquidity)}</div>
										<div className="text-xs text-gray-400">Liquidity</div>
									</div>
									<div className="bg-gray-700/30 rounded p-2 text-center">
										<div className="text-white font-medium">{formatPrice(gem.priceUsd)}</div>
										<div className="text-xs text-gray-400">Price</div>
									</div>
								</div>

									{/* Actions */}
									<div className="flex gap-2">
										<a
											href={`https://dexscreener.com/${gem.chain}/${gem.address}`}
											target="_blank"
											rel="noopener noreferrer"
											className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm text-center transition-colors"
										>
											📊 Chart
										</a>
									<a
										href={gem.chain === 'solana' 
											? `https://jup.ag/swap/SOL-${gem.address}`
											: `https://app.uniswap.org/swap?chain=${gem.chain}&outputCurrency=${gem.address}`
										}
										target="_blank"
										rel="noopener noreferrer"
										className="flex-1 px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm text-center transition-colors font-medium"
									>
										⚡ Trade
									</a>
										<button
											onClick={() => navigator.clipboard.writeText(gem.address)}
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

		</div>
	);
}
