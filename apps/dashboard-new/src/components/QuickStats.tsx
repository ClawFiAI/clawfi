/**
 * ClawFi Dashboard - Quick Stats Component
 * Real-time market statistics overview
 */

import { useEffect, useState } from 'react';
import { dexscreenerApi, type BoostToken } from '../lib/dexscreener';

interface Stats {
  trendingCount: number;
  topChains: { chain: string; count: number }[];
  totalBoosts: number;
}

// Icon components
const FireIcon = () => (
  <svg className="w-6 h-6 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 23c-4.97 0-9-3.58-9-8 0-3.19 2.06-6.37 4.06-8.56A.37.37 0 0 1 7.7 6c.16 0 .3.13.36.29.59 1.59 2.07 3.71 3.94 3.71 1.71 0 2.5-1.29 2.5-2.5 0-.7-.28-1.52-.78-2.32a.38.38 0 0 1 .54-.49C17.07 6.78 21 10.34 21 15c0 4.42-4.03 8-9 8z"/>
  </svg>
);

const RocketIcon = () => (
  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
  </svg>
);

const ChainIcon = () => (
  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
  </svg>
);

const ChartIcon = () => (
  <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M19 9l-5 5-4-4-3 3"/>
  </svg>
);

export default function QuickStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const boosted = await dexscreenerApi.getBoostedTokens();
        
        // Count by chain
        const chainCounts = boosted.reduce((acc, token) => {
          acc[token.chainId] = (acc[token.chainId] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        const topChains = Object.entries(chainCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([chain, count]) => ({ chain, count }));
        
        const totalBoosts = boosted.reduce((sum, t) => sum + (t.amount || 0), 0);
        
        setStats({
          trendingCount: boosted.length,
          topChains,
          totalBoosts,
        });
      } catch (error) {
        console.error('Stats error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card-glass p-4 animate-pulse">
            <div className="h-3 bg-white/10 rounded w-1/2 mb-3"></div>
            <div className="h-8 bg-white/10 rounded w-1/3"></div>
          </div>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      label: 'Trending Tokens',
      value: stats?.trendingCount || 0,
      icon: <FireIcon />,
      color: 'from-orange-500/20 to-red-500/20',
    },
    {
      label: 'Total Boosts',
      value: stats?.totalBoosts || 0,
      icon: <RocketIcon />,
      color: 'from-blue-500/20 to-purple-500/20',
    },
    {
      label: 'Top Chain',
      value: stats?.topChains[0]?.chain || '-',
      subValue: stats?.topChains[0]?.count ? `${stats.topChains[0].count} tokens` : '',
      icon: <ChainIcon />,
      color: 'from-emerald-500/20 to-teal-500/20',
    },
    {
      label: 'Market Activity',
      value: 'High',
      icon: <ChartIcon />,
      color: 'from-yellow-500/20 to-orange-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {statCards.map((stat, i) => (
        <div 
          key={i} 
          className={`card-glass p-4 bg-gradient-to-br ${stat.color}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-secondary">{stat.label}</span>
            {stat.icon}
          </div>
          <p className="text-2xl font-bold text-white">
            {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
          </p>
          {stat.subValue && (
            <p className="text-xs text-tertiary mt-1">{stat.subValue}</p>
          )}
        </div>
      ))}
    </div>
  );
}
