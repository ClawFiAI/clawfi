/**
 * Pump.fun Connector Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PumpFunConnector } from './index.js';

describe('PumpFunConnector', () => {
  let connector: PumpFunConnector;

  beforeEach(() => {
    connector = new PumpFunConnector({ enabled: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create connector with default config', () => {
      expect(connector.id).toBe('pumpfun');
      expect(connector.name).toBe('Pump.fun');
      expect(connector.chain).toBe('solana');
      expect(connector.type).toBe('launchpad');
    });

    it('should be enabled by default', () => {
      expect(connector.isEnabled()).toBe(true);
    });

    it('should respect enabled config', () => {
      const disabled = new PumpFunConnector({ enabled: false });
      expect(disabled.isEnabled()).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return connected status when API is reachable', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ data: [{ mint: '123' }] }),
      };
      vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response);

      const status = await connector.getStatus();
      
      expect(status.connected).toBe(true);
      expect(status.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return disconnected status when API returns error', async () => {
      const mockResponse = { ok: false, status: 500 };
      vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response);

      const status = await connector.getStatus();
      
      expect(status.connected).toBe(false);
      expect(status.error).toContain('500');
    });

    it('should return disconnected status on network error', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const status = await connector.getStatus();
      
      expect(status.connected).toBe(false);
      expect(status.error).toBe('Network error');
    });
  });

  describe('fetchRecentLaunches', () => {
    it('should fetch and map tokens correctly', async () => {
      const mockToken = {
        mint: 'TokenMint123456789',
        name: 'Test Token',
        symbol: 'TEST',
        description: 'A test token',
        creator: 'CreatorAddress123',
        created_timestamp: Date.now(),
        usd_market_cap: 50000,
        complete: false,
        twitter: 'https://twitter.com/test',
      };

      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ data: [mockToken] }),
      } as Response);

      const tokens = await connector.fetchRecentLaunches();

      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({
        address: 'TokenMint123456789',
        symbol: 'TEST',
        name: 'Test Token',
        chain: 'solana',
        launchpad: 'pumpfun',
        creator: 'CreatorAddress123',
        marketCapUsd: 50000,
      });
      expect(tokens[0]?.extensions?.twitter).toBe('https://twitter.com/test');
      expect(tokens[0]?.extensions?.graduated).toBe(false);
    });

    it('should return empty array on API error', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response);

      const tokens = await connector.fetchRecentLaunches();
      
      expect(tokens).toEqual([]);
    });
  });

  describe('fetchToken', () => {
    it('should fetch single token by mint', async () => {
      const mockToken = {
        mint: 'TokenMint123',
        name: 'Single Token',
        symbol: 'SINGLE',
        creator: 'Creator123',
        created_timestamp: Date.now(),
      };

      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockToken,
      } as Response);

      const token = await connector.fetchToken('TokenMint123');

      expect(token).not.toBeNull();
      expect(token?.address).toBe('TokenMint123');
      expect(token?.symbol).toBe('SINGLE');
    });

    it('should return null for non-existent token', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response);

      const token = await connector.fetchToken('NonExistent');
      
      expect(token).toBeNull();
    });
  });

  describe('fetchGraduatedTokens', () => {
    it('should fetch only graduated tokens', async () => {
      const mockToken = {
        mint: 'GraduatedToken123',
        name: 'Graduated',
        symbol: 'GRAD',
        creator: 'Creator123',
        created_timestamp: Date.now(),
        complete: true,
        raydium_pool: 'RaydiumPool123',
      };

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ data: [mockToken] }),
      } as Response);

      const tokens = await connector.fetchGraduatedTokens();

      expect(tokens).toHaveLength(1);
      expect(tokens[0]?.extensions?.graduated).toBe(true);
      expect(tokens[0]?.extensions?.raydiumPool).toBe('RaydiumPool123');
      
      // Verify query params
      const calledUrl = new URL(fetchSpy.mock.calls[0]?.[0] as string);
      expect(calledUrl.searchParams.get('complete')).toBe('true');
    });
  });
});
