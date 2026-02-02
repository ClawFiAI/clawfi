import { useEffect, useState } from 'react';
import { api, type Connection } from '../lib/data';
import AddConnectionModal from './AddConnectionModal';

const STATUS_COLORS: Record<string, string> = {
	connected: 'bg-emerald-500',
	degraded: 'bg-yellow-500',
	offline: 'bg-red-500',
	disconnected: 'bg-gray-500',
};

const STATUS_TEXT: Record<string, string> = {
	connected: 'text-emerald-400',
	degraded: 'text-yellow-400',
	offline: 'text-red-400',
	disconnected: 'text-gray-400',
};

export default function ConnectionsList() {
	const [connections, setConnections] = useState<Connection[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [testingId, setTestingId] = useState<string | null>(null);
	const [showAddModal, setShowAddModal] = useState(false);

	const fetchConnections = async () => {
		try {
			const response = await api.getConnections();
			// Handle both array and {data: []} response formats
			const data = Array.isArray(response) ? response : (response as any)?.data || [];
			setConnections(data);
			setError(null);
			
			// Update stats
			const total = data.length;
			const connected = data.filter((c: Connection) => c.status === 'connected').length;
			const degraded = data.filter((c: Connection) => c.status === 'degraded').length;
			const offline = data.filter((c: Connection) => c.status === 'offline' || c.status === 'disconnected').length;
			
			document.getElementById('stat-total')?.textContent !== undefined && 
				(document.getElementById('stat-total')!.textContent = total.toString());
			document.getElementById('stat-connected')?.textContent !== undefined && 
				(document.getElementById('stat-connected')!.textContent = connected.toString());
			document.getElementById('stat-degraded')?.textContent !== undefined && 
				(document.getElementById('stat-degraded')!.textContent = degraded.toString());
			document.getElementById('stat-offline')?.textContent !== undefined && 
				(document.getElementById('stat-offline')!.textContent = offline.toString());
		} catch (err) {
			// If API fails, just show empty state (not an error)
			setConnections([]);
			setError(null);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchConnections();
	}, []);

	// Listen for external "add connection" requests from header button
	useEffect(() => {
		const handleAddClick = () => setShowAddModal(true);
		const btn = document.getElementById('add-connection-btn');
		btn?.addEventListener('click', handleAddClick);
		return () => {
			btn?.removeEventListener('click', handleAddClick);
		};
	}, []);

	const handleTest = async (id: string) => {
		setTestingId(id);
		try {
			const result = await api.testConnection(id);
			if (result.success) {
				fetchConnections();
			}
		} catch (err) {
			console.error('Test failed:', err);
		} finally {
			setTestingId(null);
		}
	};

	const handleToggle = async (id: string, enabled: boolean) => {
		try {
			if (enabled) {
				await api.stopConnection(id);
			} else {
				await api.startConnection(id);
			}
			fetchConnections();
		} catch (err) {
			console.error('Toggle failed:', err);
		}
	};

	if (loading) {
		return (
			<div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
				<div className="divide-y divide-gray-700">
					{[...Array(3)].map((_, i) => (
						<div key={i} className="p-4 animate-pulse">
							<div className="flex items-center gap-4">
								<div className="w-10 h-10 rounded-lg bg-gray-700"></div>
								<div className="flex-1">
									<div className="h-4 bg-gray-700 rounded w-1/3 mb-2"></div>
									<div className="h-3 bg-gray-700 rounded w-1/4"></div>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-4 rounded-lg bg-red-900/30 border border-red-700/50 text-red-400">
				{error}
			</div>
		);
	}

	// Available connection types to show
	const availableConnections = [
		{
			type: 'cex',
			title: 'Centralized Exchanges',
			description: 'Connect exchange APIs for trading',
			icon: 'building',
			options: ['Binance', 'Coinbase', 'Kraken', 'OKX', 'Bybit', 'KuCoin'],
		},
		{
			type: 'dex',
			title: 'DEX Aggregators',
			description: 'Swap tokens across chains',
			icon: 'refresh',
			options: ['Jupiter (Solana)', 'Uniswap (ETH)', 'PancakeSwap (BSC)', '1inch'],
		},
		{
			type: 'launchpad',
			title: 'Launchpads',
			description: 'Monitor new token launches',
			icon: 'rocket',
			options: ['Clanker (Base)', 'Pump.fun (Solana)', 'Four.Meme (BSC)'],
		},
		{
			type: 'wallet',
			title: 'Wallets',
			description: 'Track wallet activity',
			icon: 'wallet',
			options: ['EVM Wallets', 'Solana Wallets', 'Multi-sig'],
		},
	];

	if (connections.length === 0) {
		return (
			<>
				<div className="space-y-6">
					{/* Info Banner */}
					<div className="glass-card p-4 border-l-4 border-primary-500">
						<div className="flex items-start gap-3">
							<svg className="w-6 h-6 text-primary-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
								<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
							</svg>
							<div>
								<h3 className="font-semibold text-white mb-1">Connect Your Accounts</h3>
								<p className="text-sm text-gray-400">
									Add exchange API keys, wallet addresses, or launchpad connections to enable trading and monitoring features.
									All credentials are encrypted and stored locally.
								</p>
							</div>
						</div>
					</div>

					{/* Available Connection Types */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{availableConnections.map((conn) => (
							<div
								key={conn.type}
								onClick={() => setShowAddModal(true)}
								className="glass-card p-6 hover:border-primary-500/50 transition-all cursor-pointer group"
							>
								<div className="flex items-start gap-4">
									<div className="w-12 h-12 rounded-xl bg-gray-700/50 flex items-center justify-center">
										{conn.icon === 'building' && (
											<svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
												<path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
											</svg>
										)}
										{conn.icon === 'refresh' && (
											<svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
												<path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
											</svg>
										)}
										{conn.icon === 'rocket' && (
											<svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
												<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
											</svg>
										)}
										{conn.icon === 'wallet' && (
											<svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
												<path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
											</svg>
										)}
									</div>
									<div className="flex-1">
										<h3 className="font-semibold text-white mb-1 group-hover:text-primary-400 transition-colors">
											{conn.title}
										</h3>
										<p className="text-sm text-gray-400 mb-3">{conn.description}</p>
										<div className="flex flex-wrap gap-2">
											{conn.options.map((opt) => (
												<span
													key={opt}
													className="px-2 py-1 text-xs bg-gray-700/50 text-gray-300 rounded-full"
												>
													{opt}
												</span>
											))}
										</div>
									</div>
								</div>
								<button className="w-full mt-4 px-4 py-2 text-sm font-medium text-primary-400 bg-primary-500/10 rounded-lg hover:bg-primary-500/20 transition-colors flex items-center justify-center gap-2">
									<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
									</svg>
									Add {conn.title.split(' ')[0]}
								</button>
							</div>
						))}
					</div>

					{/* Quick Setup Guide */}
					<div className="glass-card p-6">
						<h3 className="font-semibold text-white mb-4 flex items-center gap-2">
							<svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
								<path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
							</svg>
							Quick Setup Guide
						</h3>
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							<div className="flex items-start gap-3">
								<div className="w-8 h-8 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center font-bold text-sm">1</div>
								<div>
									<h4 className="font-medium text-white text-sm">Get API Keys</h4>
									<p className="text-xs text-gray-400">Generate read-only API keys from your exchange</p>
								</div>
							</div>
							<div className="flex items-start gap-3">
								<div className="w-8 h-8 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center font-bold text-sm">2</div>
								<div>
									<h4 className="font-medium text-white text-sm">Add Connection</h4>
									<p className="text-xs text-gray-400">Paste your API key and secret securely</p>
								</div>
							</div>
							<div className="flex items-start gap-3">
								<div className="w-8 h-8 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center font-bold text-sm">3</div>
								<div>
									<h4 className="font-medium text-white text-sm">Start Trading</h4>
									<p className="text-xs text-gray-400">Configure strategies and enable auto-trading</p>
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* Add Connection Modal */}
				<AddConnectionModal
					isOpen={showAddModal}
					onClose={() => setShowAddModal(false)}
					onSuccess={() => fetchConnections()}
				/>
			</>
		);
	}

	// Group by type
	const grouped = connections.reduce((acc, conn) => {
		acc[conn.type] = acc[conn.type] || [];
		acc[conn.type].push(conn);
		return acc;
	}, {} as Record<string, Connection[]>);

	const typeLabels: Record<string, string> = {
		cex: 'Centralized Exchanges',
		dex: 'Decentralized Exchanges',
		launchpad: 'Launchpads',
		wallet: 'Wallets',
	};

	const VENUE_ICONS: Record<string, string> = {
		binance: '🟡',
		coinbase: '🔵',
		okx: '⚫',
		bybit: '🟠',
		clanker: '🤖',
		pumpfun: '🎰',
		fourmeme: '4️⃣',
		uniswap: '🦄',
		jupiter: '🪐',
		pancakeswap: '🥞',
	};

	return (
		<>
			<div className="space-y-6">
				{Object.entries(grouped).map(([type, conns]) => (
					<div key={type} className="glass-card overflow-hidden">
						<div className="px-6 py-4 border-b border-white/10 bg-white/5">
							<h3 className="font-medium text-white">{typeLabels[type] || type}</h3>
						</div>
						<div className="divide-y divide-white/10">
							{conns.map((conn) => (
								<div key={conn.id} className="p-4 hover:bg-white/5 transition-colors">
									<div className="flex items-center gap-4">
										{/* Icon & Status */}
										<div className="relative">
											<div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl">
												{VENUE_ICONS[conn.venue] || '🔌'}
											</div>
											<div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-gray-900 ${STATUS_COLORS[conn.status]}`}></div>
										</div>
										
										{/* Info */}
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2">
												<span className="font-medium text-white">{conn.name}</span>
												{conn.chain && (
													<span className="px-2 py-0.5 text-xs bg-white/10 text-gray-300 rounded-full">
														{conn.chain}
													</span>
												)}
											</div>
											<div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
												<span className={STATUS_TEXT[conn.status]}>
													{conn.status.charAt(0).toUpperCase() + conn.status.slice(1)}
												</span>
												<span>•</span>
												<span className="capitalize">{conn.venue}</span>
												{conn.lastError && (
													<>
														<span>•</span>
														<span className="text-red-400 truncate max-w-[200px]" title={conn.lastError}>
															{conn.lastError}
														</span>
													</>
												)}
											</div>
										</div>
										
										{/* Actions */}
										<div className="flex items-center gap-2">
											<button
												onClick={() => handleTest(conn.id)}
												disabled={testingId === conn.id}
												className="px-3 py-1.5 text-sm text-gray-300 bg-white/10 rounded-lg hover:bg-white/20 disabled:opacity-50 transition-colors flex items-center gap-2"
											>
												{testingId === conn.id ? (
													<svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
														<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
														<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
													</svg>
												) : (
													<>
														<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
														</svg>
														Test
													</>
												)}
											</button>
											<button
												onClick={() => handleToggle(conn.id, conn.enabled)}
												className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
													conn.enabled
														? 'text-red-400 bg-red-500/10 hover:bg-red-500/20'
														: 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
												}`}
											>
												{conn.enabled ? 'Disable' : 'Enable'}
											</button>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				))}

				{/* Add More Section */}
				<button
					onClick={() => setShowAddModal(true)}
					className="w-full glass-card p-6 hover:border-primary-500/50 transition-all flex items-center justify-center gap-3 group"
				>
					<div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center group-hover:bg-primary-500/30 transition-colors">
						<svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
						</svg>
					</div>
					<span className="text-gray-400 group-hover:text-primary-400 transition-colors font-medium">
						Add Another Connection
					</span>
				</button>
			</div>

			{/* Add Connection Modal */}
			<AddConnectionModal
				isOpen={showAddModal}
				onClose={() => setShowAddModal(false)}
				onSuccess={() => fetchConnections()}
			/>
		</>
	);
}


