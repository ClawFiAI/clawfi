/**
 * ClawFi Extension - Background Service Worker
 * 
 * Handles:
 * - Settings storage (persistent)
 * - Communication between content scripts and options page
 * - Badge updates
 * - Signal fetching from ClawFi Node
 * - Service worker keep-alive for network resilience
 */

interface ExtensionSettings {
  nodeUrl: string;
  overlayEnabled: boolean;
  clankerOverlayEnabled: boolean;
  solanaOverlayEnabled: boolean;
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  nodeUrl: 'https://api.clawfi.ai',
  overlayEnabled: true,
  clankerOverlayEnabled: true,
  solanaOverlayEnabled: true,
};

// Message types
interface GetSettingsMessage {
  type: 'GET_SETTINGS';
}

interface SetSettingsMessage {
  type: 'SET_SETTINGS';
  settings: Partial<ExtensionSettings>;
}

interface GetSignalsMessage {
  type: 'GET_SIGNALS';
  token: string;
  chain?: string;
  limit?: number;
}

interface DetectedTokenMessage {
  type: 'DETECTED_TOKEN';
  token: string;
  chain?: string;
  source?: string;
}

interface PingMessage {
  type: 'PING';
}

type ExtensionMessage = 
  | GetSettingsMessage 
  | SetSettingsMessage 
  | GetSignalsMessage
  | DetectedTokenMessage
  | PingMessage;

// Cache settings in memory for faster access
let cachedSettings: ExtensionSettings | null = null;

// Get settings from storage (with memory cache)
// Prioritize local storage for authToken (sync has size limits)
async function getSettings(): Promise<ExtensionSettings> {
  if (cachedSettings) {
    return cachedSettings;
  }
  
  try {
    // Try local storage first (more reliable for large tokens)
    const localResult = await chrome.storage.local.get('settings');
    if (localResult.settings && localResult.settings.authToken) {
      cachedSettings = { ...DEFAULT_SETTINGS, ...localResult.settings };
      console.log('[ClawFi] Settings loaded from local storage');
      return cachedSettings;
    }
    
    // Fall back to sync storage
    const result = await chrome.storage.sync.get('settings');
    if (result.settings) {
      cachedSettings = { ...DEFAULT_SETTINGS, ...result.settings };
      console.log('[ClawFi] Settings loaded from sync storage');
      return cachedSettings;
    }
    
    console.log('[ClawFi] Using default settings');
    cachedSettings = DEFAULT_SETTINGS;
    return cachedSettings;
  } catch (error) {
    console.error('[ClawFi] Error getting settings:', error);
    return DEFAULT_SETTINGS;
  }
}

// Save settings to storage (local first, then sync)
async function saveSettings(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  try {
    const current = await getSettings();
    const updated = { ...current, ...settings };
    
    // Save to local first (no size limits)
    await chrome.storage.local.set({ settings: updated });
    console.log('[ClawFi] Settings saved to local storage');
    
    // Try to save to sync (may fail for large tokens, but that's OK)
    try {
      await chrome.storage.sync.set({ settings: updated });
      console.log('[ClawFi] Settings saved to sync storage');
    } catch (syncError) {
      console.warn('[ClawFi] Sync storage save failed (likely due to size):', syncError);
      // This is OK - local storage has the data
    }
    
    // Update cache
    cachedSettings = updated;
    
    console.log('[ClawFi] Settings saved:', { ...updated, authToken: updated.authToken ? `***${updated.authToken.slice(-8)}` : '' });
    return updated;
  } catch (error) {
    console.error('[ClawFi] Error saving settings:', error);
    throw error;
  }
}

// Fetch signals from node API with retry
async function fetchSignals(token: string, chain?: string, limit?: number, retries = 2): Promise<unknown[]> {
  const settings = await getSettings();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const params = new URLSearchParams({ token: token.toLowerCase() });
      if (chain) params.set('chain', chain);
      if (limit) params.set('limit', String(limit));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${settings.nodeUrl}/signals/token?${params}`, {
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error('[ClawFi] Signal fetch failed:', response.status);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        return [];
      }

      const data = await response.json() as { success: boolean; data: unknown[] };
      return data.success ? data.data : [];
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[ClawFi] Signal fetch timeout');
      } else {
        console.error('[ClawFi] Failed to fetch signals:', error);
      }
      
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return [];
    }
  }
  
  return [];
}

// Handle messages from content scripts and options page
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  console.log('[ClawFi] Message received:', message.type);
  
  // Handle ping for keep-alive
  if (message.type === 'PING') {
    sendResponse({ pong: true, time: Date.now() });
    return true;
  }
  
  (async () => {
    try {
      switch (message.type) {
        case 'GET_SETTINGS':
          const settings = await getSettings();
          sendResponse(settings);
          break;

        case 'SET_SETTINGS':
          const updated = await saveSettings(message.settings);
          sendResponse(updated);
          break;

        case 'GET_SIGNALS':
          const signals = await fetchSignals(message.token, message.chain, message.limit);
          sendResponse(signals);
          break;

        case 'DETECTED_TOKEN':
          // Update badge to show token detected
          const badgeColor = message.source === 'clanker' ? '#0A84FF' : '#30D158';
          try {
            await chrome.action.setBadgeText({ text: '!' });
            await chrome.action.setBadgeBackgroundColor({ color: badgeColor });
            setTimeout(async () => {
              try {
                await chrome.action.setBadgeText({ text: '' });
              } catch (e) {
                // Ignore errors clearing badge
              }
            }, 3000);
          } catch (e) {
            console.warn('[ClawFi] Badge update failed:', e);
          }
          
          console.log(`[ClawFi] Token detected: ${message.token} on ${message.chain || 'unknown'} from ${message.source || 'generic'}`);
          sendResponse({ ok: true });
          break;

        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('[ClawFi] Message handler error:', error);
      sendResponse({ error: String(error) });
    }
  })();
  
  return true; // Keep message channel open for async response
});

// Listen for storage changes to invalidate cache
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.settings) {
    console.log('[ClawFi] Settings changed in', namespace);
    cachedSettings = null; // Invalidate cache
  }
});

// Extension installed/updated
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[ClawFi] Extension installed/updated:', details.reason);
  
  // Ensure default settings exist
  const settings = await getSettings();
  await saveSettings(settings);
  
  // Set initial badge
  try {
    await chrome.action.setBadgeText({ text: '' });
  } catch (e) {
    // Ignore
  }
});

// Service worker activated
chrome.runtime.onStartup.addListener(async () => {
  console.log('[ClawFi] Service worker startup');
  // Pre-load settings into cache
  await getSettings();
});

// Keep service worker alive by self-pinging
// This helps survive network interruptions
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

function startKeepAlive() {
  if (keepAliveInterval) return;
  
  keepAliveInterval = setInterval(() => {
    // Just accessing chrome API keeps the service worker alive
    chrome.storage.local.get('_keepalive', () => {
      // Ignore result
    });
  }, 20000); // Every 20 seconds
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// Start keep-alive on load
startKeepAlive();

// Log startup
console.log('[ClawFi] Background service worker loaded');
