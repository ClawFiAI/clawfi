/**
 * ClawFi Extension - Liquid Glass Popup
 * v0.5.0 - Professional Icons, ClawF Agent Integration
 */

import { getWatchlist, getAlerts, getRecentTokens, type WatchlistToken, type StoredPriceAlert, type RecentToken } from '../services/storage';
import { dexscreenerAPI } from '../services/api/dexscreener';
import type { TrendingToken } from '../services/api/types';

// ============================================
// SVG ICONS
// ============================================

const icons = {
  logo: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="45" fill="url(#logoGrad)"/>
    <ellipse cx="35" cy="40" rx="8" ry="10" fill="white"/>
    <ellipse cx="65" cy="40" rx="8" ry="10" fill="white"/>
    <circle cx="35" cy="40" r="4" fill="#0A84FF"/>
    <circle cx="65" cy="40" r="4" fill="#0A84FF"/>
    <path d="M30 65 Q50 80 70 65" stroke="white" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M15 35 L5 25 L15 30" stroke="white" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M85 35 L95 25 L85 30" stroke="white" stroke-width="3" fill="none" stroke-linecap="round"/>
    <defs>
      <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0A84FF"/>
        <stop offset="100%" stop-color="#5856D6"/>
      </linearGradient>
    </defs>
  </svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  fire: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 23c-3.65 0-6.5-2.85-6.5-6.5 0-2.68 2.08-5.35 4.5-7.5 2.42 2.15 4.5 4.82 4.5 7.5 0 3.65-2.85 6.5-6.5 6.5zM12 1c0 4-3 7-3 11 0 3.31 2.69 6 6 6s6-2.69 6-6c0-6-6-11-9-11z"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>`,
  rocket: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  gem: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  coin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v2m0 8v2m-4-6h2m6 0h2"/></svg>`,
  externalLink: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z"/></svg>`,
  trendUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
};

// ============================================
// STATE
// ============================================

interface GemCandidate {
  address: string;
  chain: string;
  symbol?: string;
  name?: string;
  score: number;
  signal: string;
  priceChange1h?: number;
  detectedAt: number;
}

interface PopupState {
  activeTab: 'home' | 'gems' | 'watchlist' | 'trending' | 'alerts';
  loading: boolean;
  connected: boolean;
  error: string | null;
  watchlist: WatchlistToken[];
  alerts: StoredPriceAlert[];
  recent: RecentToken[];
  trending: TrendingToken[];
  trendingLoading: boolean;
  gems: GemCandidate[];
  gemsLoading: boolean;
}

let state: PopupState = {
  activeTab: 'home',
  loading: true,
  connected: true,
  error: null,
  watchlist: [],
  alerts: [],
  recent: [],
  trending: [],
  trendingLoading: false,
  gems: [],
  gemsLoading: false,
};

// ============================================
// STYLES
// ============================================

const styles = `
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  body {
    width: 400px;
    height: 580px;
    overflow: hidden;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    background: linear-gradient(145deg, #0a0a12 0%, #12121a 50%, #0d0d15 100%);
    color: rgba(255, 255, 255, 0.95);
    -webkit-font-smoothing: antialiased;
  }
  
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background: 
      radial-gradient(ellipse at 20% 0%, rgba(10, 132, 255, 0.15) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 100%, rgba(88, 86, 214, 0.12) 0%, transparent 50%);
    pointer-events: none;
  }
  
  .popup {
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
    z-index: 1;
  }
  
  .header {
    padding: 20px;
    background: linear-gradient(180deg, rgba(10, 132, 255, 0.2) 0%, transparent 100%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .logo {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(10, 132, 255, 0.3);
  }
  
  .logo svg {
    width: 44px;
    height: 44px;
  }
  
  .brand-text h1 {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.5px;
  }
  
  .brand-text span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }
  
  .header-actions {
    display: flex;
    gap: 8px;
  }
  
  .icon-btn {
    width: 38px;
    height: 38px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    color: rgba(255, 255, 255, 0.7);
  }
  
  .icon-btn svg {
    width: 18px;
    height: 18px;
  }
  
  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }
  
  .status-bar {
    display: flex;
    gap: 12px;
  }
  
  .status-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 100px;
    font-size: 12px;
  }
  
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #30D158;
    box-shadow: 0 0 8px #30D158;
  }
  
  .status-dot.offline {
    background: #FF453A;
    box-shadow: 0 0 8px #FF453A;
  }
  
  .tabs {
    display: flex;
    padding: 10px 12px;
    gap: 4px;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    overflow-x: auto;
  }
  
  .tab {
    flex: 1;
    min-width: 60px;
    padding: 10px 6px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  
  .tab:hover {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.9);
  }
  
  .tab.active {
    background: rgba(10, 132, 255, 0.2);
    color: #0A84FF;
    border: 1px solid rgba(10, 132, 255, 0.3);
  }
  
  .tab-icon {
    width: 20px;
    height: 20px;
  }
  
  .tab-icon svg {
    width: 100%;
    height: 100%;
  }
  
  .tab-badge {
    background: #FF453A;
    color: white;
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 10px;
    margin-left: 2px;
  }
  
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }
  
  .content::-webkit-scrollbar {
    width: 4px;
  }
  
  .content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
  }
  
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-bottom: 16px;
  }
  
  .stat-card {
    padding: 14px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
  }
  
  .stat-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
  }
  
  .stat-value {
    font-size: 24px;
    font-weight: 700;
    color: #0A84FF;
  }
  
  .quick-actions {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 16px;
  }
  
  .quick-action {
    padding: 12px 6px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    text-decoration: none;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    color: inherit;
  }
  
  .quick-action:hover {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-2px);
  }
  
  .quick-action-icon {
    width: 24px;
    height: 24px;
    margin: 0 auto 4px;
    color: #0A84FF;
  }
  
  .quick-action-icon svg {
    width: 100%;
    height: 100%;
  }
  
  .quick-action-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.6);
  }
  
  .card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    overflow: hidden;
    margin-bottom: 14px;
  }
  
  .card-header {
    padding: 12px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  
  .card-title {
    font-size: 13px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .card-title svg {
    width: 16px;
    height: 16px;
    color: #0A84FF;
  }
  
  .card-body {
    padding: 0;
  }
  
  .empty-state {
    text-align: center;
    padding: 24px;
    color: rgba(255, 255, 255, 0.4);
  }
  
  .empty-icon {
    width: 40px;
    height: 40px;
    margin: 0 auto 10px;
    opacity: 0.5;
    color: rgba(255, 255, 255, 0.3);
  }
  
  .empty-icon svg {
    width: 100%;
    height: 100%;
  }
  
  .token-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .token-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  
  .token-item:last-child {
    border-bottom: none;
  }
  
  .token-info {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }
  
  .token-icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(10, 132, 255, 0.3), rgba(88, 86, 214, 0.3));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #0A84FF;
  }
  
  .token-icon svg {
    width: 16px;
    height: 16px;
  }
  
  .token-icon img {
    width: 100%;
    height: 100%;
    border-radius: 10px;
    object-fit: cover;
  }
  
  .token-details {
    min-width: 0;
    flex: 1;
  }
  
  .token-symbol {
    font-weight: 600;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .token-name {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .token-chain {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.4);
    background: rgba(255, 255, 255, 0.08);
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
  }
  
  .token-price {
    text-align: right;
    flex-shrink: 0;
  }
  
  .token-price-value {
    font-weight: 600;
    font-size: 13px;
  }
  
  .token-change {
    font-size: 11px;
  }
  
  .token-change.positive {
    color: #30D158;
  }
  
  .token-change.negative {
    color: #FF453A;
  }
  
  .gem-item {
    display: flex;
    align-items: center;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .gem-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  
  .gem-item.mooning {
    background: linear-gradient(90deg, rgba(255, 215, 0, 0.1), transparent);
    border-left: 3px solid #FFD700;
  }
  
  .gem-score {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: linear-gradient(135deg, #0A84FF, #5856D6);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    margin-right: 12px;
  }
  
  .gem-signal {
    font-size: 10px;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(10, 132, 255, 0.2);
    color: #0A84FF;
    margin-top: 4px;
    display: inline-block;
  }
  
  .gem-change {
    margin-left: auto;
    font-size: 14px;
    font-weight: 700;
  }
  
  .gem-change.positive {
    color: #30D158;
  }
  
  .gem-change.huge {
    color: #FFD700;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
  }
  
  .alert-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  
  .alert-item:last-child {
    border-bottom: none;
  }
  
  .alert-info {
    flex: 1;
  }
  
  .alert-symbol {
    font-weight: 600;
    font-size: 13px;
  }
  
  .alert-condition {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
  }
  
  .alert-status {
    font-size: 9px;
    padding: 3px 8px;
    border-radius: 6px;
  }
  
  .alert-status.active {
    background: rgba(48, 209, 88, 0.2);
    color: #30D158;
  }
  
  .alert-status.triggered {
    background: rgba(255, 149, 0, 0.2);
    color: #FF9500;
  }
  
  .loading-spinner {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 30px;
  }
  
  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-top-color: #0A84FF;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .footer {
    padding: 12px 16px;
    background: rgba(0, 0, 0, 0.3);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  .footer-version {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
  }
  
  .btn-dashboard {
    padding: 8px 16px;
    border: none;
    border-radius: 100px;
    background: linear-gradient(135deg, #0A84FF 0%, #5856D6 100%);
    color: white;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
  }
  
  .btn-dashboard svg {
    width: 14px;
    height: 14px;
  }
  
  .btn-dashboard:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 20px rgba(10, 132, 255, 0.4);
  }
  
  .error-banner {
    background: rgba(255, 69, 58, 0.15);
    border: 1px solid rgba(255, 69, 58, 0.3);
    color: #FF453A;
    padding: 10px 14px;
    border-radius: 10px;
    margin-bottom: 14px;
    font-size: 12px;
  }
  
  .rank-badge {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    margin-right: 8px;
  }
  
  .rank-badge.top3 {
    background: linear-gradient(135deg, #FFD700 0%, #FF9500 100%);
    color: #000;
  }
`;

// ============================================
// HELPERS
// ============================================

function getLogoUrl(): string {
  try {
    return chrome.runtime.getURL('icons/icon48.png');
  } catch {
    return '';
  }
}

function formatPrice(price: number): string {
  if (price === 0) return '$0.00';
  if (price < 0.0001) return `$${price.toExponential(2)}`;
  if (price < 1) return `$${price.toFixed(6)}`;
  if (price < 1000) return `$${price.toFixed(2)}`;
  return `$${(price / 1000).toFixed(1)}K`;
}

function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  if (Math.abs(change) >= 1000) {
    return `${sign}${(change / 1000).toFixed(1)}K%`;
  }
  return `${sign}${change.toFixed(1)}%`;
}

function truncateAddress(addr: string): string {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ============================================
// DATA LOADING
// ============================================

async function loadLocalData(): Promise<void> {
  try {
    const [watchlist, alerts, recent] = await Promise.all([
      getWatchlist(),
      getAlerts(),
      getRecentTokens(),
    ]);
    
    state.watchlist = watchlist;
    state.alerts = alerts;
    state.recent = recent;
    state.loading = false;
    render();
  } catch (error) {
    console.error('[ClawFi] Error loading local data:', error);
    state.loading = false;
    render();
  }
}

async function loadTrendingData(): Promise<void> {
  if (state.trendingLoading) return;
  
  state.trendingLoading = true;
  render();
  
  try {
    const trending = await dexscreenerAPI.getBoostedTokens();
    state.trending = trending.slice(0, 10);
  } catch (error) {
    console.error('[ClawFi] Error loading trending:', error);
    state.trending = [];
  }
  
  state.trendingLoading = false;
  render();
}

async function loadGemsData(): Promise<void> {
  if (state.gemsLoading) return;
  
  state.gemsLoading = true;
  render();
  
  try {
    // Try to fetch from ClawFi API
    const response = await fetch('https://api.clawfi.ai/clawf/gems');
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        state.gems = data.data.slice(0, 10).map((gem: any) => ({
          address: gem.address,
          chain: gem.chain || 'solana',
          symbol: gem.symbol,
          name: gem.name,
          score: gem.scores?.composite || 0,
          signal: gem.bestSignal || gem.signals?.[0] || 'New Detection',
          priceChange1h: gem.priceChange1h || 0,
          detectedAt: gem.detectedAt || Date.now(),
        }));
      }
    }
  } catch (error) {
    console.error('[ClawFi] Error loading gems:', error);
    state.gems = [];
  }
  
  state.gemsLoading = false;
  render();
}

// ============================================
// RENDER
// ============================================

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;

  const logoUrl = getLogoUrl();
  const activeAlerts = state.alerts.filter(a => a.enabled && !a.triggered).length;

  app.innerHTML = `
    <div class="popup">
      <div class="header">
        <div class="header-top">
          <div class="brand">
            <div class="logo">
              ${logoUrl ? `<img src="${logoUrl}" alt="ClawFi" style="width:44px;height:44px;border-radius:12px;">` : icons.logo}
            </div>
            <div class="brand-text">
              <h1>ClawFi</h1>
              <span>Degen Trading Assistant</span>
            </div>
          </div>
          <div class="header-actions">
            <button class="icon-btn" id="refresh-btn" title="Refresh">${icons.refresh}</button>
            <button class="icon-btn" id="settings-btn" title="Settings">${icons.settings}</button>
          </div>
        </div>
        <div class="status-bar">
          <div class="status-item">
            <span class="status-dot ${state.connected ? '' : 'offline'}"></span>
            <span>${state.connected ? 'Active' : 'Offline'}</span>
          </div>
          <div class="status-item">
            <span style="width:14px;height:14px;display:inline-flex;">${icons.logo}</span>
            <span>v0.5.0</span>
          </div>
        </div>
      </div>
      
      <div class="tabs">
        <button class="tab ${state.activeTab === 'home' ? 'active' : ''}" data-tab="home">
          <span class="tab-icon">${icons.home}</span>
          <span>Home</span>
        </button>
        <button class="tab ${state.activeTab === 'gems' ? 'active' : ''}" data-tab="gems">
          <span class="tab-icon">${icons.gem}</span>
          <span>ClawF${state.gems.length > 0 ? ` (${state.gems.length})` : ''}</span>
        </button>
        <button class="tab ${state.activeTab === 'watchlist' ? 'active' : ''}" data-tab="watchlist">
          <span class="tab-icon">${icons.star}</span>
          <span>Watch</span>
        </button>
        <button class="tab ${state.activeTab === 'trending' ? 'active' : ''}" data-tab="trending">
          <span class="tab-icon">${icons.fire}</span>
          <span>Hot</span>
        </button>
        <button class="tab ${state.activeTab === 'alerts' ? 'active' : ''}" data-tab="alerts">
          <span class="tab-icon">${icons.bell}</span>
          <span>Alerts${activeAlerts > 0 ? `<span class="tab-badge">${activeAlerts}</span>` : ''}</span>
        </button>
      </div>
      
      <div class="content">
        ${state.error ? `<div class="error-banner">${state.error}</div>` : ''}
        ${state.loading ? renderLoading() : renderContent()}
      </div>
      
      <div class="footer">
        <span class="footer-version">ClawFi v0.5.0</span>
        <button class="btn-dashboard" id="dashboard-btn">
          ${icons.externalLink}
          Open Dashboard
        </button>
      </div>
    </div>
  `;

  attachListeners();
}

function renderLoading(): string {
  return `
    <div class="loading-spinner">
      <div class="spinner"></div>
    </div>
  `;
}

function renderContent(): string {
  switch (state.activeTab) {
    case 'home':
      return renderHome();
    case 'gems':
      return renderGems();
    case 'watchlist':
      return renderWatchlist();
    case 'trending':
      return renderTrending();
    case 'alerts':
      return renderAlerts();
    default:
      return '';
  }
}

function renderHome(): string {
  const activeAlerts = state.alerts.filter(a => a.enabled && !a.triggered).length;
  
  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Watchlist</div>
        <div class="stat-value">${state.watchlist.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Alerts</div>
        <div class="stat-value">${activeAlerts}</div>
      </div>
    </div>
    
    <div class="quick-actions">
      <a class="quick-action" href="https://dexscreener.com" target="_blank">
        <div class="quick-action-icon">${icons.chart}</div>
        <span class="quick-action-label">DEXScreener</span>
      </a>
      <a class="quick-action" href="https://jup.ag" target="_blank">
        <div class="quick-action-icon">${icons.globe}</div>
        <span class="quick-action-label">Jupiter</span>
      </a>
      <a class="quick-action" href="https://pump.fun" target="_blank">
        <div class="quick-action-icon">${icons.rocket}</div>
        <span class="quick-action-label">Pump.fun</span>
      </a>
      <a class="quick-action" href="https://clanker.world" target="_blank">
        <div class="quick-action-icon">${icons.sparkle}</div>
        <span class="quick-action-label">Clanker</span>
      </a>
    </div>
    
    <div class="card">
      <div class="card-header">
        <span class="card-title">${icons.clock} Recent Activity</span>
      </div>
      <div class="card-body">
        ${state.recent.length > 0 ? renderRecentTokens() : `
          <div class="empty-state">
            <div class="empty-icon">${icons.search}</div>
            <p>Browse DEX sites to see history</p>
          </div>
        `}
      </div>
    </div>
  `;
}

function renderRecentTokens(): string {
  return state.recent.slice(0, 5).map(token => `
    <div class="token-item" data-address="${token.address}" data-chain="${token.chain}">
      <div class="token-info">
        <div class="token-icon">${icons.coin}</div>
        <div class="token-details">
          <div class="token-symbol">${token.symbol || truncateAddress(token.address)}</div>
          <div class="token-name">${token.name || token.source || 'Token'}</div>
        </div>
      </div>
      <div class="token-price">
        <span class="token-chain">${token.chain}</span>
        <div class="token-name">${timeAgo(token.lastViewed)}</div>
      </div>
    </div>
  `).join('');
}

function renderGems(): string {
  if (state.gemsLoading) {
    return renderLoading();
  }

  if (state.gems.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${icons.gem}</div>
        <p>No gems detected yet</p>
        <p style="font-size: 11px; margin-top: 6px; color: rgba(255,255,255,0.4)">ClawF is scanning for opportunities</p>
      </div>
    `;
  }

  // Sort by price change
  const sortedGems = [...state.gems].sort((a, b) => (b.priceChange1h || 0) - (a.priceChange1h || 0));

  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">${icons.trophy} ClawF Detections</span>
      </div>
      <div class="card-body">
        ${sortedGems.map((gem, index) => {
          const isMooning = (gem.priceChange1h || 0) >= 100;
          const changeClass = isMooning ? 'huge' : (gem.priceChange1h || 0) >= 0 ? 'positive' : '';
          
          return `
            <div class="gem-item ${isMooning ? 'mooning' : ''}" data-address="${gem.address}" data-chain="${gem.chain}">
              <div class="gem-score">${Math.round(gem.score)}</div>
              <div class="token-details">
                <div class="token-symbol">${gem.symbol || truncateAddress(gem.address)}</div>
                <div class="gem-signal">${gem.signal}</div>
              </div>
              <div class="gem-change ${changeClass}">
                ${gem.priceChange1h ? formatChange(gem.priceChange1h) : '-'}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderWatchlist(): string {
  if (state.watchlist.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${icons.star}</div>
        <p>No tokens in watchlist</p>
        <p style="font-size: 11px; margin-top: 6px; color: rgba(255,255,255,0.4)">Add tokens while browsing DEX sites</p>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-body">
        ${state.watchlist.map(token => `
          <div class="token-item" data-address="${token.address}" data-chain="${token.chain}">
            <div class="token-info">
              <div class="token-icon">${icons.star}</div>
              <div class="token-details">
                <div class="token-symbol">${token.symbol || truncateAddress(token.address)}</div>
                <div class="token-name">${token.name || token.chain}</div>
              </div>
            </div>
            <div class="token-price">
              <span class="token-chain">${token.chain}</span>
              <div class="token-name">Added ${timeAgo(token.addedAt)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderTrending(): string {
  if (state.trendingLoading) {
    return renderLoading();
  }

  if (state.trending.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${icons.fire}</div>
        <p>No trending tokens found</p>
        <p style="font-size: 11px; margin-top: 6px; color: rgba(255,255,255,0.4)">Pull to refresh</p>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">${icons.trendUp} Trending on Dexscreener</span>
      </div>
      <div class="card-body">
        ${state.trending.map((item, index) => `
          <div class="token-item" data-address="${item.token.address}" data-chain="${item.pair.chain}" data-url="${item.pair.url || ''}">
            <div class="token-info">
              <span class="rank-badge ${index < 3 ? 'top3' : ''}">${index + 1}</span>
              <div class="token-icon">
                ${item.token.logoUrl ? `<img src="${item.token.logoUrl}" onerror="this.parentElement.innerHTML='${icons.fire}'">` : icons.fire}
              </div>
              <div class="token-details">
                <div class="token-symbol">${item.token.symbol || truncateAddress(item.token.address)}</div>
                <div class="token-name">${item.token.name || 'Unknown'}</div>
              </div>
            </div>
            <div class="token-price">
              <span class="token-chain">${item.pair.chain}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAlerts(): string {
  if (state.alerts.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${icons.bell}</div>
        <p>No price alerts</p>
        <p style="font-size: 11px; margin-top: 6px; color: rgba(255,255,255,0.4)">Create alerts from token overlays</p>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-body">
        ${state.alerts.map(alert => `
          <div class="alert-item">
            <div class="alert-info">
              <div class="alert-symbol">${alert.symbol || truncateAddress(alert.address)}</div>
              <div class="alert-condition">
                ${alert.type === 'above' ? 'Above' : alert.type === 'below' ? 'Below' : 'Change'} 
                ${alert.type === 'change' ? `${alert.value}%` : formatPrice(alert.value)}
              </div>
            </div>
            <span class="alert-status ${alert.triggered ? 'triggered' : 'active'}">
              ${alert.triggered ? 'Triggered' : 'Active'}
            </span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ============================================
// EVENT LISTENERS
// ============================================

function attachListeners(): void {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const newTab = target.dataset.tab as PopupState['activeTab'];
      state.activeTab = newTab;
      
      // Load data when switching tabs
      if (newTab === 'trending' && state.trending.length === 0) {
        loadTrendingData();
      }
      if (newTab === 'gems' && state.gems.length === 0) {
        loadGemsData();
      }
      
      render();
    });
  });

  // Refresh button
  document.getElementById('refresh-btn')?.addEventListener('click', async () => {
    state.loading = true;
    render();
    await loadLocalData();
    if (state.activeTab === 'trending') {
      await loadTrendingData();
    }
    if (state.activeTab === 'gems') {
      await loadGemsData();
    }
  });

  // Settings button
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage?.();
  });

  // Dashboard button - Open ClawFi dashboard
  document.getElementById('dashboard-btn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://clawfi.ai' });
  });

  // Token/gem items click - open in dexscreener
  document.querySelectorAll('.token-item, .gem-item').forEach(item => {
    item.addEventListener('click', () => {
      const el = item as HTMLElement;
      const url = el.dataset.url;
      const address = el.dataset.address;
      const chain = el.dataset.chain;
      
      if (url) {
        chrome.tabs.create({ url });
      } else if (address && chain) {
        chrome.tabs.create({ url: `https://dexscreener.com/${chain}/${address}` });
      }
    });
  });
}

// ============================================
// INIT
// ============================================

function init(): void {
  console.log('[ClawFi Popup] Initializing v0.5.0...');
  
  // Add styles
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
  
  // Load data and render
  loadLocalData();
  // Pre-load gems
  loadGemsData();
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
