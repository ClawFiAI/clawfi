/**
 * ClawFi Dashboard - Market Overview Component
 * Shows trending tokens, market stats, and live data
 */

import { useEffect, useState } from 'react';
import { 
  dexscreenerApi, 
  formatPrice, 
  formatMarketCap, 
  formatVolume, 
  formatChange, 
  getChainName,
  getChainColor,
  getDexscreenerUrl,
  type DexscreenerPair,
  type BoostToken
} from '../lib/dexscreener';

interface TrendingToken {
  token: BoostToken;
  pair: DexscreenerPair | null;
}

export default function MarketOverview() {
  const [trending, setTrending] = useState<TrendingToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get boosted tokens
      const boosted = await dexscreenerApi.getBoostedTokens();
      
      // Get pair data for top tokens
      const tokensWithPairs: TrendingToken[] = [];
      
      for (const token of boosted.slice(0, 12)) {
        const pairs = await dexscreenerApi.getTokenPairs(token.tokenAddress);
        const bestPair = pairs.sort((a, b) => 
          (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
        )[0] || null;
        
        tokensWithPairs.push({ token, pair: bestPair });
      }

      setTrending(tokensWithPairs);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Market overview error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load market data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (loading && trending.length === 0) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card-glass p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/10"></div>
                <div className="flex-1">
                  <div className="h-4 bg-white/10 rounded w-1/2 mb-2"></div>
                  <div className="h-3 bg-white/10 rounded w-1/3"></div>
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
      <div className="card-glass p-6 border-red-500/30">
        <div className="flex items-center gap-3 text-red-400">
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="font-medium">Failed to load market data</p>
            <p className="text-sm opacity-70">{error}</p>
          </div>
        </div>
        <button 
          onClick={fetchData}
          className="mt-4 btn-glass btn-glass-primary text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-6 h-6 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 23c-4.97 0-9-3.58-9-8 0-3.19 2.06-6.37 4.06-8.56A.37.37 0 0 1 7.7 6c.16 0 .3.13.36.29.59 1.59 2.07 3.71 3.94 3.71 1.71 0 2.5-1.29 2.5-2.5 0-.7-.28-1.52-.78-2.32a.38.38 0 0 1 .54-.49C17.07 6.78 21 10.34 21 15c0 4.42-4.03 8-9 8z"/>
            </svg>
            Trending Now
          </h2>
          <p className="text-sm text-secondary mt-1">
            Hot tokens across all chains - Live from Dexscreener
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-tertiary">
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button 
            onClick={fetchData}
            disabled={loading}
            className="btn-glass text-sm px-4 py-2 disabled:opacity-50"
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Trending Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trending.map((item, index) => {
          const { token, pair } = item;
          const change = formatChange(pair?.priceChange?.h24);
          
          return (
            <a
              key={`${token.chainId}-${token.tokenAddress}`}
              href={token.url}
              target="_blank"
              rel="noopener noreferrer"
              className="card-glass p-4 hover:scale-[1.02] transition-all duration-300 group cursor-pointer"
            >
              <div className="flex items-start gap-3">
                {/* Rank Badge */}
                <div className={`
                  w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold
                  ${index < 3 
                    ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-black' 
                    : 'bg-white/10 text-white/60'
                  }
                `}>
                  {index + 1}
                </div>

                {/* Token Icon */}
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {token.icon ? (
                    <img 
                      src={token.icon} 
                      alt="" 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 6v12M6 12h12"/>
                    </svg>
                  )}
                </div>

                {/* Token Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span 
                      className="px-2 py-0.5 text-[10px] font-medium rounded-full"
                      style={{ 
                        backgroundColor: `${getChainColor(token.chainId)}20`,
                        color: getChainColor(token.chainId)
                      }}
                    >
                      {getChainName(token.chainId)}
                    </span>
                    {token.amount && (
                      <span className="badge-glass badge-glass-blue text-[10px] flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
                        </svg>
                        {token.amount} boosts
                      </span>
                    )}
                  </div>
                  
                  <p className="text-white font-medium mt-1 truncate group-hover:text-primary">
                    {pair?.baseToken?.symbol || token.tokenAddress.slice(0, 8)}
                  </p>
                  
                  <p className="text-tertiary text-xs truncate">
                    {pair?.baseToken?.name || token.description || 'Unknown Token'}
                  </p>
                </div>

                {/* Price Info */}
                <div className="text-right flex-shrink-0">
                  <p className="text-white font-medium">
                    {formatPrice(pair?.priceUsd)}
                  </p>
                  <p className={`text-sm font-medium ${change.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {change.text}
                  </p>
                </div>
              </div>

              {/* Stats Row */}
              {pair && (
                <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-tertiary">Market Cap</p>
                    <p className="text-secondary font-medium">{formatMarketCap(pair.marketCap || pair.fdv)}</p>
                  </div>
                  <div>
                    <p className="text-tertiary">Volume 24h</p>
                    <p className="text-secondary font-medium">{formatVolume(pair.volume?.h24)}</p>
                  </div>
                  <div>
                    <p className="text-tertiary">Liquidity</p>
                    <p className="text-secondary font-medium">{formatVolume(pair.liquidity?.usd)}</p>
                  </div>
                </div>
              )}
            </a>
          );
        })}
      </div>

      {/* View More Link */}
      <div className="text-center">
        <a 
          href="/trending"
          className="btn-glass btn-glass-primary inline-flex items-center gap-2"
        >
          View All Trending Tokens
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </a>
      </div>
    </div>
  );
}
