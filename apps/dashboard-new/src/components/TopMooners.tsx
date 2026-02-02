import { useEffect, useState } from 'react';
import { API_URL } from '../app/constants';
import { ClawFLogo, ChartIcon, BoltIcon, TrophyIcon } from './Icons';

interface TopPerformer {
	symbol: string;
	chain: string;
	address: string;
	gainSinceDetection: number;
	peakGain: number;
	hoursTracked: number;
	detectedAt: string;
}

interface PerformanceResponse {
	success: boolean;
	data: {
		stats: {
			totalTracked: number;
			avgGain: number;
			topGain: number;
			greenCount: number;
			redCount: number;
		};
		topPerformers: TopPerformer[];
	};
}

export default function TopMooners() {
	const [performers, setPerformers] = useState<TopPerformer[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchPerformers = async () => {
			try {
				const response = await fetch(`${API_URL}/clawf/performance`);
				const data: PerformanceResponse = await response.json();
				
				if (data.success && data.data?.topPerformers) {
					// Only show tokens with significant gains (>50%)
					const bigWinners = data.data.topPerformers.filter(p => p.gainSinceDetection >= 50);
					setPerformers(bigWinners.slice(0, 6));
				}
			} catch (err) {
				console.error('TopMooners error:', err);
			} finally {
				setLoading(false);
			}
		};

		fetchPerformers();
		const interval = setInterval(fetchPerformers, 30000);
		return () => clearInterval(interval);
	}, []);

	if (loading) {
		return (
			<div className="animate-pulse">
				<div className="h-8 bg-white/10 rounded w-48 mb-4"></div>
				<div className="grid grid-cols-2 md:grid-cols-3 gap-3">
					{[...Array(6)].map((_, i) => (
						<div key={i} className="h-24 bg-white/5 rounded-xl"></div>
					))}
				</div>
			</div>
		);
	}

	if (performers.length === 0) {
		return null; // Don't show section if no big winners
	}

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center gap-3">
				<div className="w-10 h-10 bg-gradient-to-br from-yellow-500/30 to-orange-500/30 rounded-xl flex items-center justify-center">
					<TrophyIcon className="text-yellow-400" size={20} />
				</div>
				<div>
					<h2 className="text-lg font-bold text-white">Top Mooners</h2>
					<p className="text-xs text-gray-400">Tokens ClawF found that pumped</p>
				</div>
			</div>

			{/* Mooners Grid */}
			<div className="grid grid-cols-2 md:grid-cols-3 gap-3">
				{performers.map((token, index) => {
					const isHuge = token.gainSinceDetection >= 500;
					const isBig = token.gainSinceDetection >= 100;
					
					return (
						<a
							key={token.address}
							href={`https://dexscreener.com/${token.chain}/${token.address}`}
							target="_blank"
							rel="noopener noreferrer"
							className={`relative p-4 rounded-xl border transition-all hover:scale-[1.02] ${
								isHuge 
									? 'bg-gradient-to-br from-yellow-900/40 to-orange-900/40 border-yellow-500/50 ring-1 ring-yellow-500/30' 
									: isBig
										? 'bg-gradient-to-br from-emerald-900/30 to-green-900/30 border-emerald-500/30'
										: 'bg-gray-800/50 border-gray-700/50'
							}`}
						>
							{/* Rank badge */}
							{index < 3 && (
								<div className={`absolute -top-2 -left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
									index === 0 ? 'bg-yellow-500 text-black' :
									index === 1 ? 'bg-gray-300 text-black' :
									'bg-orange-600 text-white'
								}`}>
									{index + 1}
								</div>
							)}

							{/* Symbol & Chain */}
							<div className="flex items-center gap-2 mb-2">
								<span className="font-bold text-white">${token.symbol}</span>
								<span className="px-1.5 py-0.5 text-[10px] bg-gray-700 text-gray-300 rounded uppercase">
									{token.chain}
								</span>
							</div>

							{/* Gain */}
							<div className={`text-2xl font-bold ${
								isHuge ? 'text-yellow-400' : 'text-emerald-400'
							}`}>
								+{token.gainSinceDetection.toFixed(0)}%
							</div>

							{/* Peak if different */}
							{token.peakGain > token.gainSinceDetection + 10 && (
								<div className="text-xs text-gray-400 mt-1">
									Peak: +{token.peakGain.toFixed(0)}%
								</div>
							)}

							{/* Time tracked */}
							<div className="text-xs text-gray-500 mt-1">
								{token.hoursTracked < 1 
									? `${Math.round(token.hoursTracked * 60)}min ago`
									: `${token.hoursTracked.toFixed(1)}h ago`
								}
							</div>
						</a>
					);
				})}
			</div>
		</div>
	);
}
