/**
 * ClawFi Dashboard - Trending Tokens Component
 * Full-featured trending tokens browser with filters
 */

import { useEffect, useState } from 'react';
import { 
  dexscreenerApi, 
  formatPrice, 
  formatMarketCap, 
  formatVolume, 
  formatChange,
  formatLiquidity,
  getChainName,
  getChainColor,
  type DexscreenerPair,
  type BoostToken
} from '../lib/dexscreener';

type SortOption = 'boosts' | 'marketCap' | 'volume' | 'change24h' | 'liquidity';
type ChainFilter = 'all' | 'ethereum' | 'base' | 'solana' | 'bsc' | 'arbitrum';

interface TrendingToken {
  token: BoostToken;
  pair: DexscreenerPair | null;
}

export default function TrendingTokens() {
  const [tokens, setTokens] = useState<TrendingToken[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<TrendingToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('boosts');
  const [chainFilter, setChainFilter] = useState<ChainFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const boosted = await dexscreenerApi.getBoostedTokens();
      
      // Fetch pair data in parallel batches
      const tokensWithPairs: TrendingToken[] = [];
      const batchSize = 5;
      
      for (let i = 0; i < boosted.length; i += batchSize) {
        const batch = boosted.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (token) => {
            const pairs = await dexscreenerApi.getTokenPairs(token.tokenAddress);
            const bestPair = pairs.sort((a, b) => 
              (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
            )[0] || null;
            return { token, pair: bestPair };
          })
        );
        tokensWithPairs.push(...batchResults);
      }

      setTokens(tokensWithPairs);
    } catch (err) {
      console.error('Trending tokens error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load trending tokens');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter and sort tokens
  useEffect(() => {
    let filtered = [...tokens];

    // Chain filter
    if (chainFilter !== 'all') {
      filtered = filtered.filter(t => t.token.chainId === chainFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.pair?.baseToken?.symbol?.toLowerCase().includes(query) ||
        t.pair?.baseToken?.name?.toLowerCase().includes(query) ||
        t.token.tokenAddress.toLowerCase().includes(query) ||
        t.token.description?.toLowerCase().includes(query)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'marketCap':
          return (b.pair?.marketCap || b.pair?.fdv || 0) - (a.pair?.marketCap || a.pair?.fdv || 0);
        case 'volume':
          return (b.pair?.volume?.h24 || 0) - (a.pair?.volume?.h24 || 0);
        case 'change24h':
          return (b.pair?.priceChange?.h24 || 0) - (a.pair?.priceChange?.h24 || 0);
        case 'liquidity':
          return (b.pair?.liquidity?.usd || 0) - (a.pair?.liquidity?.usd || 0);
        case 'boosts':
        default:
          return (b.token.amount || 0) - (a.token.amount || 0);
      }
    });

    setFilteredTokens(filtered);
  }, [tokens, chainFilter, searchQuery, sortBy]);

  if (loading && tokens.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap gap-4">
          <div className="h-10 w-64 bg-white/5 rounded-xl animate-pulse"></div>
          <div className="h-10 w-32 bg-white/5 rounded-xl animate-pulse"></div>
          <div className="h-10 w-32 bg-white/5 rounded-xl animate-pulse"></div>
        </div>
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="card-glass p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/10"></div>
                <div className="flex-1">
                  <div className="h-4 bg-white/10 rounded w-1/4 mb-2"></div>
                  <div className="h-3 bg-white/10 rounded w-1/3"></div>
                </div>
                <div className="w-24 h-8 bg-white/10 rounded"></div>
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
            <p className="font-medium">Failed to load trending tokens</p>
            <p className="text-sm opacity-70">{error}</p>
          </div>
        </div>
        <button onClick={fetchData} className="mt-4 btn-glass btn-glass-primary text-sm">
          Retry
        </button>
      </div>
    );
  }

  const chains: ChainFilter[] = ['all', 'ethereum', 'base', 'solana', 'bsc', 'arbitrum'];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tokens..."
            className="input-glass w-full pl-10"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Chain Filter */}
        <div className="flex items-center gap-2">
          {chains.map(chain => (
            <button
              key={chain}
              onClick={() => setChainFilter(chain)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                chainFilter === chain
                  ? 'bg-primary/30 text-primary border border-primary/50'
                  : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
              }`}
            >
              {chain === 'all' ? 'All Chains' : getChainName(chain)}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="input-glass px-4 py-2 min-w-[150px]"
        >
          <option value="boosts">Most Boosted</option>
          <option value="marketCap">Market Cap</option>
          <option value="volume">Volume 24h</option>
          <option value="change24h">Price Change</option>
          <option value="liquidity">Liquidity</option>
        </select>

        {/* Refresh */}
        <button 
          onClick={fetchData}
          disabled={loading}
          className="btn-glass px-4 py-2 disabled:opacity-50"
        >
          {loading ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
        </button>
      </div>

      {/* Results count */}
      <div className="text-sm text-secondary">
        Showing {filteredTokens.length} of {tokens.length} trending tokens
      </div>

      {/* Token List */}
      {filteredTokens.length === 0 ? (
        <div className="card-glass p-12 text-center">
          <div className="w-12 h-12 mx-auto mb-4 bg-white/10 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-white font-medium">No tokens found</p>
          <p className="text-secondary text-sm mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTokens.map((item, index) => {
            const { token, pair } = item;
            const change = formatChange(pair?.priceChange?.h24);
            const change1h = formatChange(pair?.priceChange?.h1);
            
            return (
              <a
                key={`${token.chainId}-${token.tokenAddress}`}
                href={token.url}
                target="_blank"
                rel="noopener noreferrer"
                className="card-glass p-4 flex items-center gap-4 hover:scale-[1.01] transition-all group"
              >
                {/* Rank */}
                <div className={`
                  w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-white group-hover:text-primary transition-colors">
                      {pair?.baseToken?.symbol || token.tokenAddress.slice(0, 8)}
                    </h3>
                    <span 
                      className="px-2 py-0.5 text-[10px] font-medium rounded-full"
                      style={{ 
                        backgroundColor: `${getChainColor(token.chainId)}20`,
                        color: getChainColor(token.chainId)
                      }}
                    >
                      {getChainName(token.chainId)}
                    </span>
                    {token.amount && token.amount > 1 && (
                      <span className="badge-glass badge-glass-orange text-[10px] flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 23c-4.97 0-9-3.58-9-8 0-3.19 2.06-6.37 4.06-8.56A.37.37 0 0 1 7.7 6c.16 0 .3.13.36.29.59 1.59 2.07 3.71 3.94 3.71 1.71 0 2.5-1.29 2.5-2.5 0-.7-.28-1.52-.78-2.32a.38.38 0 0 1 .54-.49C17.07 6.78 21 10.34 21 15c0 4.42-4.03 8-9 8z"/>
                        </svg>
                        {token.amount} boosts
                      </span>
                    )}
                  </div>
                  <p className="text-tertiary text-sm truncate">
                    {pair?.baseToken?.name || token.description || 'Unknown Token'}
                  </p>
                </div>

                {/* Stats */}
                <div className="hidden lg:grid grid-cols-4 gap-6 text-right">
                  <div>
                    <p className="text-tertiary text-xs">Price</p>
                    <p className="text-white font-medium">{formatPrice(pair?.priceUsd)}</p>
                  </div>
                  <div>
                    <p className="text-tertiary text-xs">Market Cap</p>
                    <p className="text-secondary font-medium">{formatMarketCap(pair?.marketCap || pair?.fdv)}</p>
                  </div>
                  <div>
                    <p className="text-tertiary text-xs">Volume 24h</p>
                    <p className="text-secondary font-medium">{formatVolume(pair?.volume?.h24)}</p>
                  </div>
                  <div>
                    <p className="text-tertiary text-xs">Liquidity</p>
                    <p className="text-secondary font-medium">{formatLiquidity(pair?.liquidity?.usd)}</p>
                  </div>
                </div>

                {/* Price Change */}
                <div className="text-right flex-shrink-0">
                  <p className={`text-lg font-bold ${change.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {change.text}
                  </p>
                  <p className={`text-xs ${change1h.positive ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                    1h: {change1h.text}
                  </p>
                </div>

                {/* Arrow */}
                <svg className="w-5 h-5 text-white/40 group-hover:text-white/80 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
