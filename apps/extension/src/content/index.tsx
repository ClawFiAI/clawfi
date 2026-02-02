/**
 * ClawFi Extension - Enhanced Content Script
 * 
 * Premium Liquid Glass UI for in-page overlays
 * Full ClawFi + DeFi API integration
 * 
 * Supports: Dexscreener, Etherscan, Basescan, Arbiscan, Uniswap, 
 *           GeckoTerminal, DexTools, Defined.fi, Birdeye
 */

import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

console.log('[ClawFi] Liquid Glass content script loaded:', window.location.href);

// ============================================
// CONSTANTS & TYPES
// ============================================

const ETH_ADDRESS_REGEX = /0x[a-fA-F0-9]{40}/g;

interface Signal {
  id: string;
  ts: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  summary: string;
  recommendedAction: string;
}

interface Settings {
  nodeUrl: string;
  overlayEnabled: boolean;
}

interface MarketData {
  priceUsd: number;
  priceChange24h: number;
  priceChangeH1: number;
  priceChange5m?: number;
  volume24h: number;
  liquidity: number;
  marketCap?: number;
  fdv?: number;
  txns24h: { buys: number; sells: number };
  dex: string;
  dexscreenerUrl: string;
  pairCreatedAt?: number;
}

interface SafetyData {
  overallRisk: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  issues: string[];
  honeypot: boolean;
  liquidityLocked: boolean;
  contractVerified: boolean;
}

// ============================================
// UTILITIES
// ============================================

function getIconUrl(size: number = 48): string {
  try {
    return chrome.runtime.getURL(`icons/icon${size}.png`);
  } catch {
    return '';
  }
}

function detectChain(url: string): string | undefined {
  const urlLower = url.toLowerCase();
  
  // Explorer sites
  if (urlLower.includes('etherscan.io')) return 'ethereum';
  if (urlLower.includes('arbiscan.io')) return 'arbitrum';
  if (urlLower.includes('basescan.org')) return 'base';
  if (urlLower.includes('bscscan.com')) return 'bsc';
  if (urlLower.includes('polygonscan.com')) return 'polygon';
  if (urlLower.includes('snowtrace.io')) return 'avalanche';
  
  // DeFi platforms
  if (urlLower.includes('dexscreener.com')) {
    const pathMatch = url.match(/dexscreener\.com\/([^\/]+)/i);
    if (pathMatch && pathMatch[1]) {
      const chain = pathMatch[1].toLowerCase();
      if (chain === 'ethereum' || chain === 'eth') return 'ethereum';
      if (['base', 'arbitrum', 'bsc', 'polygon', 'solana', 'avalanche', 'optimism'].includes(chain)) {
        return chain;
      }
      return chain;
    }
  }
  
  if (urlLower.includes('geckoterminal.com')) {
    const pathMatch = url.match(/geckoterminal\.com\/([^\/]+)/i);
    if (pathMatch && pathMatch[1]) {
      const chain = pathMatch[1].toLowerCase();
      if (chain === 'eth') return 'ethereum';
      return chain;
    }
  }
  
  if (urlLower.includes('uniswap.org')) {
    if (urlLower.includes('chain=1') || urlLower.includes('chain=mainnet')) return 'ethereum';
    if (urlLower.includes('chain=8453') || urlLower.includes('chain=base')) return 'base';
    if (urlLower.includes('chain=42161') || urlLower.includes('chain=arbitrum')) return 'arbitrum';
    return 'ethereum';
  }
  
  if (urlLower.includes('dextools.io')) {
    const pathMatch = url.match(/dextools\.io\/app\/([^\/]+)/i);
    if (pathMatch && pathMatch[1]) {
      const chain = pathMatch[1].toLowerCase();
      if (chain === 'ether') return 'ethereum';
      if (chain === 'bnb') return 'bsc';
      return chain;
    }
  }
  
  return undefined;
}

function detectTokenAddress(): string | null {
  const url = window.location.href;
  
  // Dexscreener: https://dexscreener.com/base/0x...
  if (url.includes('dexscreener.com')) {
    const dexMatch = url.match(/dexscreener\.com\/[^\/]+\/(0x[a-fA-F0-9]{40})/i);
    if (dexMatch?.[1]) return dexMatch[1];
  }
  
  // GeckoTerminal: https://www.geckoterminal.com/eth/pools/0x...
  if (url.includes('geckoterminal.com')) {
    const geckoMatch = url.match(/pools\/(0x[a-fA-F0-9]{40})/i);
    if (geckoMatch?.[1]) return geckoMatch[1];
  }
  
  // DexTools: https://www.dextools.io/app/ether/pair-explorer/0x...
  if (url.includes('dextools.io')) {
    const dextoolsMatch = url.match(/pair-explorer\/(0x[a-fA-F0-9]{40})/i);
    if (dextoolsMatch?.[1]) return dextoolsMatch[1];
  }
  
  // Try URL
  const urlMatch = url.match(ETH_ADDRESS_REGEX);
  if (urlMatch) return urlMatch[0];
  
  // Fallback to page content
  const pageText = document.body?.innerText || '';
  const pageMatches = pageText.match(ETH_ADDRESS_REGEX);
  if (pageMatches?.length) {
    const commonAddresses = new Set([
      '0x0000000000000000000000000000000000000000',
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    ]);
    for (const addr of pageMatches) {
      if (!commonAddresses.has(addr.toLowerCase())) {
        return addr;
      }
    }
  }
  
  return null;
}

// API Functions
async function fetchMarketData(token: string, chain?: string, settings?: Settings): Promise<MarketData | null> {
  try {
    const nodeUrl = settings?.nodeUrl || 'https://api.clawfi.ai';
    const chainParam = chain ? `?chain=${chain}` : '';
    
    const response = await fetch(`${nodeUrl}/dexscreener/token/${token}${chainParam}`);
    
    if (!response.ok) {
      // Fallback to direct Dexscreener API
      const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`);
      if (!dexResponse.ok) return null;
      
      const dexData = await dexResponse.json();
      const pair = dexData.pairs?.[0];
      if (!pair) return null;
      
      return {
        priceUsd: parseFloat(pair.priceUsd) || 0,
        priceChange24h: pair.priceChange?.h24 || 0,
        priceChangeH1: pair.priceChange?.h1 || 0,
        priceChange5m: pair.priceChange?.m5 || 0,
        volume24h: pair.volume?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
        marketCap: pair.marketCap || 0,
        fdv: pair.fdv || 0,
        txns24h: { buys: pair.txns?.h24?.buys || 0, sells: pair.txns?.h24?.sells || 0 },
        dex: pair.dexId || 'Unknown',
        dexscreenerUrl: pair.url || `https://dexscreener.com/search?q=${token}`,
        pairCreatedAt: pair.pairCreatedAt,
      };
    }
    
    const data = await response.json();
    if (data.success && data.data) {
      return {
        priceUsd: data.data.priceUsd,
        priceChange24h: data.data.priceChange24h,
        priceChangeH1: data.data.priceChangeH1,
        priceChange5m: data.data.priceChange5m,
        volume24h: data.data.volume24h,
        liquidity: data.data.liquidity,
        marketCap: data.data.marketCap,
        fdv: data.data.fdv,
        txns24h: data.data.txns24h,
        dex: data.data.dex,
        dexscreenerUrl: data.data.dexscreenerUrl,
        pairCreatedAt: data.data.pairCreatedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchSafetyData(token: string, chain?: string, settings?: Settings): Promise<SafetyData | null> {
  try {
    const nodeUrl = settings?.nodeUrl || 'https://api.clawfi.ai';
    const response = await fetch(`${nodeUrl}/analyze/token/${token}${chain ? `?chain=${chain}` : ''}`);
    
    if (!response.ok) {
      // Return estimated data if API is not available
      return {
        overallRisk: 'medium',
        riskScore: 50,
        issues: ['Unable to fully analyze - proceed with caution'],
        honeypot: false,
        liquidityLocked: false,
        contractVerified: false,
      };
    }
    
    const data = await response.json();
    if (data.success && data.data) {
      return data.data;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================
// OVERLAY COMPONENT
// ============================================

function ClawFiOverlay() {
  const [token, setToken] = useState<string | null>(null);
  const [chain, setChain] = useState<string | undefined>();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [safetyData, setSafetyData] = useState<SafetyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activeTab, setActiveTab] = useState<'market' | 'safety' | 'signals'>('market');
  
  const iconUrl = getIconUrl(48);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (s: Settings) => {
      setEnabled(s?.overlayEnabled ?? true);
      setSettings(s);
    });

    const detectedToken = detectTokenAddress();
    const detectedChain = detectChain(window.location.href);
    
    if (detectedToken) {
      setToken(detectedToken);
      setChain(detectedChain);
      
      chrome.runtime.sendMessage({
        type: 'DETECTED_TOKEN',
        token: detectedToken,
        chain: detectedChain,
      });
      
      // Fetch signals
      setLoading(true);
      chrome.runtime.sendMessage(
        { type: 'GET_SIGNALS', token: detectedToken, chain: detectedChain },
        (data: Signal[]) => {
          setSignals(data || []);
          setLoading(false);
        }
      );
      
      // Fetch market & safety data
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, async (s: Settings) => {
        const [md, sd] = await Promise.all([
          fetchMarketData(detectedToken, detectedChain, s),
          fetchSafetyData(detectedToken, detectedChain, s),
        ]);
        setMarketData(md);
        setSafetyData(sd);
      });
    }
  }, []);

  // Re-check on URL changes (SPA navigation)
  useEffect(() => {
    const checkForTokenChanges = () => {
      const newToken = detectTokenAddress();
      const newChain = detectChain(window.location.href);
      
      if (newToken && newToken !== token) {
        setToken(newToken);
        setChain(newChain);
        setLoading(true);
        
        // Fetch new data
        chrome.runtime.sendMessage(
          { type: 'GET_SIGNALS', token: newToken, chain: newChain },
          (data: Signal[]) => {
            setSignals(data || []);
            setLoading(false);
          }
        );
        
        fetchMarketData(newToken, newChain, settings || undefined).then(setMarketData);
        fetchSafetyData(newToken, newChain, settings || undefined).then(setSafetyData);
      }
    };

    // Listen for URL changes
    const observer = new MutationObserver(checkForTokenChanges);
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Also check on popstate for SPA routing
    window.addEventListener('popstate', checkForTokenChanges);
    
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', checkForTokenChanges);
    };
  }, [token, settings]);

  if (!enabled || !token) {
    return null;
  }

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const formatNumber = (num: number): string => {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    if (num < 0.0001) return num.toExponential(2);
    return num.toFixed(num < 1 ? 4 : 2);
  };
  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };
  const formatAge = (timestamp?: number) => {
    if (!timestamp) return 'Unknown';
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days < 1) return 'Today';
    if (days === 1) return '1 day';
    if (days < 30) return `${days} days`;
    if (days < 365) return `${Math.floor(days / 30)} months`;
    return `${Math.floor(days / 365)} years`;
  };

  const getRiskColor = (risk: string): string => {
    const colors: Record<string, string> = {
      safe: '#30D158',
      low: '#0A84FF',
      medium: '#FFD60A',
      high: '#FF9F0A',
      critical: '#FF453A',
    };
    return colors[risk] || '#FFD60A';
  };

  const severityColor: Record<string, string> = {
    critical: '#FF453A',
    high: '#FF9F0A',
    medium: '#FFD60A',
    low: '#0A84FF',
  };

  const chainColors: Record<string, string> = {
    ethereum: '#627EEA',
    base: '#0052FF',
    arbitrum: '#28A0F0',
    solana: '#9945FF',
    bsc: '#F0B90B',
    polygon: '#8247E5',
    avalanche: '#E84142',
    optimism: '#FF0420',
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 2147483647,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Collapsed FAB */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="clawfi-fab"
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '18px',
            background: 'linear-gradient(145deg, #0A84FF 0%, #5856D6 100%)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(10, 132, 255, 0.45), inset 0 1px 0 rgba(255,255,255,0.35)',
            position: 'relative',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden',
          }}
        >
          {/* Specular highlight */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.1) 30%, transparent 50%)',
              pointerEvents: 'none',
              borderRadius: 'inherit',
            }}
          />
          
          {iconUrl ? (
            <img src={iconUrl} alt="ClawFi" style={{ width: '34px', height: '34px', borderRadius: '8px', objectFit: 'contain', position: 'relative', zIndex: 1 }} />
          ) : (
            <svg viewBox="0 0 100 100" style={{ width: '34px', height: '34px', position: 'relative', zIndex: 1 }}>
              <circle cx="50" cy="50" r="45" fill="#0A84FF"/>
              <ellipse cx="35" cy="40" rx="8" ry="10" fill="white"/>
              <ellipse cx="65" cy="40" rx="8" ry="10" fill="white"/>
              <circle cx="35" cy="40" r="4" fill="#0A84FF"/>
              <circle cx="65" cy="40" r="4" fill="#0A84FF"/>
            </svg>
          )}
          
          {/* Signal badge */}
          {signals.length > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-6px',
                right: '-6px',
                minWidth: '24px',
                height: '24px',
                borderRadius: '12px',
                background: '#FF453A',
                color: 'white',
                fontSize: '12px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 6px',
                boxShadow: '0 3px 10px rgba(255, 69, 58, 0.5)',
                zIndex: 2,
              }}
            >
              {signals.length}
            </span>
          )}
          
          {/* Risk indicator */}
          {safetyData && (
            <span
              style={{
                position: 'absolute',
                bottom: '4px',
                right: '4px',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: getRiskColor(safetyData.overallRisk),
                boxShadow: `0 0 12px ${getRiskColor(safetyData.overallRisk)}`,
                zIndex: 2,
                animation: 'clawfi-glow-pulse 2s ease-in-out infinite',
              }}
            />
          )}
        </button>
      )}

      {/* Expanded Panel */}
      {expanded && (
        <div
          style={{
            width: '380px',
            background: 'rgba(20, 20, 28, 0.92)',
            backdropFilter: 'blur(60px) saturate(200%)',
            WebkitBackdropFilter: 'blur(60px) saturate(200%)',
            borderRadius: '24px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 40px rgba(10, 132, 255, 0.2)',
            overflow: 'hidden',
            animation: 'clawfi-slide-up 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
          }}
        >
          {/* Top highlight */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
            }}
          />
          
          {/* Header */}
          <div
            style={{
              padding: '18px 22px',
              background: 'linear-gradient(180deg, rgba(10, 132, 255, 0.9) 0%, rgba(88, 86, 214, 0.85) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
              position: 'relative',
            }}
          >
            {/* Header specular */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 40%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative', zIndex: 1 }}>
              {iconUrl ? (
                <img src={iconUrl} alt="" style={{ width: '26px', height: '26px', borderRadius: '6px' }} />
              ) : (
                <svg viewBox="0 0 100 100" style={{ width: '26px', height: '26px' }}>
                  <circle cx="50" cy="50" r="45" fill="white"/>
                  <ellipse cx="35" cy="40" rx="8" ry="10" fill="#0A84FF"/>
                  <ellipse cx="65" cy="40" rx="8" ry="10" fill="#0A84FF"/>
                </svg>
              )}
              <span style={{ fontWeight: '700', color: 'white', fontSize: '17px', letterSpacing: '-0.4px' }}>
                ClawFi
              </span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: 'white',
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 1,
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'; }}
            >
              ×
            </button>
          </div>

          {/* Token Info */}
          <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <code
                  style={{
                    fontSize: '13px',
                    color: 'white',
                    background: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    padding: '7px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    fontFamily: "'SF Mono', Menlo, monospace",
                  }}
                >
                  {formatAddress(token)}
                </code>
                {chain && (
                  <span
                    style={{
                      fontSize: '11px',
                      color: chainColors[chain] || '#0A84FF',
                      background: `${chainColors[chain] || '#0A84FF'}20`,
                      padding: '5px 12px',
                      borderRadius: '100px',
                      border: `1px solid ${chainColors[chain] || '#0A84FF'}40`,
                      textTransform: 'capitalize',
                      fontWeight: '600',
                    }}
                  >
                    {chain}
                  </span>
                )}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(token)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  transition: 'all 0.2s',
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(10, 132, 255, 0.2)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; }}
              >
                📋
              </button>
            </div>
            
            {/* Safety Badge */}
            {safetyData && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 14px',
                  background: `${getRiskColor(safetyData.overallRisk)}15`,
                  border: `1px solid ${getRiskColor(safetyData.overallRisk)}35`,
                  borderRadius: '12px',
                }}
              >
                <span
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: getRiskColor(safetyData.overallRisk),
                    boxShadow: `0 0 12px ${getRiskColor(safetyData.overallRisk)}`,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, fontWeight: '600', fontSize: '14px', color: 'rgba(255,255,255,0.95)', textTransform: 'capitalize' }}>
                  {safetyData.overallRisk} Risk
                </span>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                  Score: {safetyData.riskScore}/100
                </span>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div
            style={{
              display: 'flex',
              padding: '12px 16px',
              gap: '8px',
              background: 'rgba(0, 0, 0, 0.25)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            {[
              { id: 'market', label: 'Market', icon: '📊' },
              { id: 'safety', label: 'Safety', icon: '🛡️' },
              { id: 'signals', label: 'Signals', icon: '🔔', count: signals.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: activeTab === tab.id ? '1px solid rgba(10, 132, 255, 0.5)' : '1px solid transparent',
                  background: activeTab === tab.id ? 'rgba(10, 132, 255, 0.25)' : 'transparent',
                  color: activeTab === tab.id ? 'white' : 'rgba(255, 255, 255, 0.6)',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.2s',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count && tab.count > 0 && (
                  <span
                    style={{
                      background: '#FF453A',
                      color: 'white',
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      fontWeight: '600',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ maxHeight: '320px', overflow: 'auto' }} className="clawfi-scrollbar">
            {/* Market Tab */}
            {activeTab === 'market' && (
              <div style={{ padding: '16px 20px' }}>
                {marketData ? (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '10px',
                      }}
                    >
                      <div
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          borderRadius: '14px',
                          padding: '14px',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                      >
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Price</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: 'white' }}>
                          ${formatNumber(marketData.priceUsd)}
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: marketData.priceChange24h >= 0 ? '#30D158' : '#FF453A',
                            marginTop: '2px',
                            fontWeight: '500',
                          }}
                        >
                          {marketData.priceChange24h >= 0 ? '▲' : '▼'} {Math.abs(marketData.priceChange24h).toFixed(2)}% (24h)
                        </div>
                      </div>
                      
                      <div
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          borderRadius: '14px',
                          padding: '14px',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                      >
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Volume 24H</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: 'white' }}>
                          ${formatNumber(marketData.volume24h)}
                        </div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                          {marketData.txns24h.buys}↑ {marketData.txns24h.sells}↓
                        </div>
                      </div>
                      
                      <div
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          borderRadius: '14px',
                          padding: '14px',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                      >
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Liquidity</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: 'white' }}>
                          ${formatNumber(marketData.liquidity)}
                        </div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                          on {marketData.dex}
                        </div>
                      </div>
                      
                      <div
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          borderRadius: '14px',
                          padding: '14px',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                      >
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Market Cap</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: 'white' }}>
                          {marketData.marketCap ? `$${formatNumber(marketData.marketCap)}` : 'N/A'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                          Age: {formatAge(marketData.pairCreatedAt)}
                        </div>
                      </div>
                    </div>
                    
                    {/* Quick Actions */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginTop: '14px' }}>
                      <a
                        href={marketData.dexscreenerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '12px',
                          background: 'rgba(10, 132, 255, 0.15)',
                          border: '1px solid rgba(10, 132, 255, 0.3)',
                          borderRadius: '12px',
                          textDecoration: 'none',
                          textAlign: 'center',
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#0A84FF',
                          transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(10, 132, 255, 0.25)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(10, 132, 255, 0.15)'; }}
                      >
                        📊 View Chart
                      </a>
                      <a
                        href={chain === 'solana' ? `https://jup.ag/swap/SOL-${token}` : `https://app.uniswap.org/swap?outputCurrency=${token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '12px',
                          background: 'rgba(48, 209, 88, 0.15)',
                          border: '1px solid rgba(48, 209, 88, 0.3)',
                          borderRadius: '12px',
                          textDecoration: 'none',
                          textAlign: 'center',
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#30D158',
                          transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(48, 209, 88, 0.25)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(48, 209, 88, 0.15)'; }}
                      >
                        🔄 Swap
                      </a>
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                    <div style={{ marginBottom: '12px', fontSize: '32px', opacity: 0.6 }}>📊</div>
                    <div style={{ fontSize: '14px' }}>Loading market data...</div>
                  </div>
                )}
              </div>
            )}

            {/* Safety Tab */}
            {activeTab === 'safety' && (
              <div style={{ padding: '16px 20px' }}>
                {safetyData ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                      <div
                        style={{
                          padding: '12px',
                          background: safetyData.honeypot ? 'rgba(255, 69, 58, 0.12)' : 'rgba(48, 209, 88, 0.12)',
                          border: `1px solid ${safetyData.honeypot ? 'rgba(255, 69, 58, 0.3)' : 'rgba(48, 209, 88, 0.3)'}`,
                          borderRadius: '12px',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: '18px', marginBottom: '4px' }}>{safetyData.honeypot ? '🚨' : '✅'}</div>
                        <div style={{ fontSize: '11px', color: safetyData.honeypot ? '#FF453A' : '#30D158', fontWeight: '600' }}>
                          {safetyData.honeypot ? 'Honeypot' : 'Tradeable'}
                        </div>
                      </div>
                      
                      <div
                        style={{
                          padding: '12px',
                          background: safetyData.liquidityLocked ? 'rgba(48, 209, 88, 0.12)' : 'rgba(255, 159, 10, 0.12)',
                          border: `1px solid ${safetyData.liquidityLocked ? 'rgba(48, 209, 88, 0.3)' : 'rgba(255, 159, 10, 0.3)'}`,
                          borderRadius: '12px',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: '18px', marginBottom: '4px' }}>{safetyData.liquidityLocked ? '🔒' : '⚠️'}</div>
                        <div style={{ fontSize: '11px', color: safetyData.liquidityLocked ? '#30D158' : '#FF9F0A', fontWeight: '600' }}>
                          {safetyData.liquidityLocked ? 'LP Locked' : 'LP Unlocked'}
                        </div>
                      </div>
                      
                      <div
                        style={{
                          padding: '12px',
                          background: safetyData.contractVerified ? 'rgba(48, 209, 88, 0.12)' : 'rgba(255, 159, 10, 0.12)',
                          border: `1px solid ${safetyData.contractVerified ? 'rgba(48, 209, 88, 0.3)' : 'rgba(255, 159, 10, 0.3)'}`,
                          borderRadius: '12px',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: '18px', marginBottom: '4px' }}>{safetyData.contractVerified ? '✓' : '?'}</div>
                        <div style={{ fontSize: '11px', color: safetyData.contractVerified ? '#30D158' : '#FF9F0A', fontWeight: '600' }}>
                          {safetyData.contractVerified ? 'Verified' : 'Unverified'}
                        </div>
                      </div>
                    </div>
                    
                    {safetyData.issues.length > 0 && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Issues Found</div>
                        {safetyData.issues.map((issue, i) => (
                          <div
                            key={i}
                            style={{
                              padding: '10px 12px',
                              background: 'rgba(255, 69, 58, 0.1)',
                              border: '1px solid rgba(255, 69, 58, 0.2)',
                              borderRadius: '10px',
                              marginBottom: '6px',
                              fontSize: '12px',
                              color: 'rgba(255,255,255,0.8)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                          >
                            <span>⚠️</span>
                            {issue}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                    <div style={{ marginBottom: '12px', fontSize: '32px', opacity: 0.6 }}>🛡️</div>
                    <div style={{ fontSize: '14px' }}>Analyzing token safety...</div>
                  </div>
                )}
              </div>
            )}

            {/* Signals Tab */}
            {activeTab === 'signals' && (
              <div>
                {loading ? (
                  <div style={{ padding: '50px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        border: '2.5px solid rgba(255, 255, 255, 0.1)',
                        borderTopColor: '#0A84FF',
                        borderRadius: '50%',
                        margin: '0 auto 12px',
                        animation: 'clawfi-spin 0.8s linear infinite',
                      }}
                    />
                    Loading signals...
                  </div>
                ) : signals.length === 0 ? (
                  <div style={{ padding: '50px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                    <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.6 }}>✨</div>
                    <div style={{ fontSize: '14px', fontWeight: '500' }}>No signals</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>Token looks clean</div>
                  </div>
                ) : (
                  signals.map((signal) => (
                    <div
                      key={signal.id}
                      style={{
                        padding: '14px 20px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                        transition: 'background 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <span
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: severityColor[signal.severity] || '#0A84FF',
                            boxShadow: `0 0 10px ${severityColor[signal.severity] || '#0A84FF'}`,
                          }}
                        />
                        <span style={{ fontSize: '14px', fontWeight: '600', color: 'white', flex: 1 }}>
                          {signal.title}
                        </span>
                      </div>
                      <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', margin: '0 0 6px 20px', lineHeight: '1.5' }}>
                        {signal.summary.slice(0, 120)}
                        {signal.summary.length > 120 ? '...' : ''}
                      </p>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginLeft: '20px' }}>
                        {formatTime(signal.ts)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '14px 20px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
              ClawFi v0.5.0
            </span>
            <button
              onClick={() => chrome.runtime.openOptionsPage()}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#0A84FF',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <svg viewBox="0 0 24 24" style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Settings
            </button>
          </div>
        </div>
      )}
      
      {/* CSS Animations */}
      <style>{`
        @keyframes clawfi-slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes clawfi-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes clawfi-glow-pulse {
          0%, 100% { filter: drop-shadow(0 0 8px currentColor); }
          50% { filter: drop-shadow(0 0 16px currentColor); }
        }
        .clawfi-scrollbar::-webkit-scrollbar { width: 6px; }
        .clawfi-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .clawfi-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 3px; }
      `}</style>
    </div>
  );
}

// ============================================
// MOUNT
// ============================================

function mountOverlay() {
  const container = document.createElement('div');
  container.id = 'clawfi-overlay-root';
  document.body.appendChild(container);
  
  const root = createRoot(container);
  root.render(<ClawFiOverlay />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountOverlay);
} else {
  mountOverlay();
}
