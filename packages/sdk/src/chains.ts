/**
 * Multi-Chain Support Utilities
 * 
 * Chain definitions and helper functions for cross-chain operations
 */

// ============================================
// Chain Definitions
// ============================================

export type ChainId = 
  | 'ethereum' 
  | 'base' 
  | 'arbitrum' 
  | 'bsc' 
  | 'solana';

export interface ChainConfig {
  id: ChainId;
  name: string;
  shortName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorers: {
    name: string;
    url: string;
    apiUrl?: string;
  }[];
  isEVM: boolean;
  chainIdNum?: number;
  launchpads?: string[];
}

export const CHAINS: Record<ChainId, ChainConfig> = {
  ethereum: {
    id: 'ethereum',
    name: 'Ethereum',
    shortName: 'ETH',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://eth.llamarpc.com', 'https://rpc.ankr.com/eth'],
    blockExplorers: [
      { name: 'Etherscan', url: 'https://etherscan.io', apiUrl: 'https://api.etherscan.io/api' },
    ],
    isEVM: true,
    chainIdNum: 1,
  },
  base: {
    id: 'base',
    name: 'Base',
    shortName: 'BASE',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.base.org', 'https://base.llamarpc.com'],
    blockExplorers: [
      { name: 'Basescan', url: 'https://basescan.org', apiUrl: 'https://api.basescan.org/api' },
    ],
    isEVM: true,
    chainIdNum: 8453,
    launchpads: ['clanker'],
  },
  arbitrum: {
    id: 'arbitrum',
    name: 'Arbitrum One',
    shortName: 'ARB',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.llamarpc.com'],
    blockExplorers: [
      { name: 'Arbiscan', url: 'https://arbiscan.io', apiUrl: 'https://api.arbiscan.io/api' },
    ],
    isEVM: true,
    chainIdNum: 42161,
  },
  bsc: {
    id: 'bsc',
    name: 'BNB Smart Chain',
    shortName: 'BSC',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-dataseed.binance.org', 'https://bsc.llamarpc.com'],
    blockExplorers: [
      { name: 'BscScan', url: 'https://bscscan.com', apiUrl: 'https://api.bscscan.com/api' },
    ],
    isEVM: true,
    chainIdNum: 56,
    launchpads: ['fourmeme'],
  },
  solana: {
    id: 'solana',
    name: 'Solana',
    shortName: 'SOL',
    nativeCurrency: { name: 'SOL', symbol: 'SOL', decimals: 9 },
    rpcUrls: ['https://api.mainnet-beta.solana.com'],
    blockExplorers: [
      { name: 'Solscan', url: 'https://solscan.io' },
      { name: 'Solana Explorer', url: 'https://explorer.solana.com' },
    ],
    isEVM: false,
    launchpads: ['pumpfun'],
  },
};

// ============================================
// Address Validation
// ============================================

/**
 * Ethereum/EVM address regex
 */
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Solana address regex (Base58 encoded, 32-44 chars)
 */
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Validate an address for a specific chain
 */
export function isValidAddress(address: string, chain: ChainId): boolean {
  if (chain === 'solana') {
    return SOLANA_ADDRESS_REGEX.test(address);
  }
  return EVM_ADDRESS_REGEX.test(address);
}

/**
 * Detect chain from address format
 */
export function detectChainFromAddress(address: string): ChainId | null {
  if (EVM_ADDRESS_REGEX.test(address)) {
    // Could be any EVM chain - return null to indicate ambiguity
    return null;
  }
  if (SOLANA_ADDRESS_REGEX.test(address)) {
    return 'solana';
  }
  return null;
}

/**
 * Get chain config by ID
 */
export function getChain(chainId: ChainId): ChainConfig {
  return CHAINS[chainId];
}

/**
 * Get all supported chain IDs
 */
export function getSupportedChains(): ChainId[] {
  return Object.keys(CHAINS) as ChainId[];
}

/**
 * Get all EVM chains
 */
export function getEVMChains(): ChainId[] {
  return (Object.keys(CHAINS) as ChainId[]).filter(id => CHAINS[id].isEVM);
}

// ============================================
// Explorer URLs
// ============================================

/**
 * Get block explorer URL for a token
 */
export function getTokenExplorerUrl(address: string, chain: ChainId): string {
  const config = CHAINS[chain];
  const explorer = config?.blockExplorers?.[0];
  if (!explorer) {
    return '';
  }
  
  if (chain === 'solana') {
    return `${explorer.url}/token/${address}`;
  }
  
  return `${explorer.url}/token/${address}`;
}

/**
 * Get block explorer URL for a wallet/account
 */
export function getWalletExplorerUrl(address: string, chain: ChainId): string {
  const config = CHAINS[chain];
  const explorer = config?.blockExplorers?.[0];
  if (!explorer) {
    return '';
  }
  
  if (chain === 'solana') {
    return `${explorer.url}/account/${address}`;
  }
  
  return `${explorer.url}/address/${address}`;
}

/**
 * Get block explorer URL for a transaction
 */
export function getTxExplorerUrl(txHash: string, chain: ChainId): string {
  const config = CHAINS[chain];
  const explorer = config?.blockExplorers?.[0];
  if (!explorer) {
    return '';
  }
  
  return `${explorer.url}/tx/${txHash}`;
}

// ============================================
// DEX Screener Integration
// ============================================

const DEX_SCREENER_CHAIN_MAP: Record<ChainId, string> = {
  ethereum: 'ethereum',
  base: 'base',
  arbitrum: 'arbitrum',
  bsc: 'bsc',
  solana: 'solana',
};

/**
 * Get DEX Screener URL for a token
 */
export function getDexScreenerUrl(address: string, chain: ChainId): string {
  const dexChain = DEX_SCREENER_CHAIN_MAP[chain];
  if (!dexChain) return '';
  return `https://dexscreener.com/${dexChain}/${address}`;
}

/**
 * Get DEX Screener API URL for token info
 */
export function getDexScreenerApiUrl(address: string): string {
  return `https://api.dexscreener.com/latest/dex/tokens/${address}`;
}

// ============================================
// Launchpad URLs
// ============================================

/**
 * Get launchpad URL for a token
 */
export function getLaunchpadUrl(address: string, launchpad: string): string {
  switch (launchpad) {
    case 'clanker':
      return `https://clanker.world/clanker/${address}`;
    case 'pumpfun':
      return `https://pump.fun/coin/${address}`;
    case 'fourmeme':
      return `https://four.meme/token/${address}`;
    default:
      return '';
  }
}

// ============================================
// Address Formatting
// ============================================

/**
 * Shorten an address for display
 */
export function shortenAddress(address: string, chars: number = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format address with checksum (EVM only)
 */
export function formatAddress(address: string, chain: ChainId): string {
  if (chain === 'solana') {
    return address; // Solana addresses are case-sensitive
  }
  // For EVM, return lowercase (checksum formatting would need ethers/viem)
  return address.toLowerCase();
}

// ============================================
// Exports
// ============================================

export {
  EVM_ADDRESS_REGEX,
  SOLANA_ADDRESS_REGEX,
};
