/**
 * ClawFi Options Page Script v0.5.1
 * Simplified settings - no auth required
 */

var defaultSettings = {
  nodeUrl: 'https://api.clawfi.ai',
  overlayEnabled: true,
  clankerOverlayEnabled: true,
  solanaOverlayEnabled: true,
};

var form = document.getElementById('settings-form');
var nodeUrlInput = document.getElementById('nodeUrl');
var overlayEnabledInput = document.getElementById('overlayEnabled');
var clankerOverlayEnabledInput = document.getElementById('clankerOverlayEnabled');
var solanaOverlayEnabledInput = document.getElementById('solanaOverlayEnabled');
var statusEl = document.getElementById('status');
var statusIconEl = document.getElementById('status-icon');
var statusTextEl = document.getElementById('status-text');

function showStatus(type, icon, text) {
  statusEl.className = 'status ' + type;
  statusIconEl.textContent = icon;
  statusTextEl.textContent = text;
  if (type === 'success') {
    setTimeout(function() { statusEl.className = 'status'; }, 3000);
  }
}

function applySettings(settings) {
  console.log('[ClawFi Options] Applying settings:', settings);
  nodeUrlInput.value = settings.nodeUrl || defaultSettings.nodeUrl;
  overlayEnabledInput.checked = settings.overlayEnabled !== false;
  clankerOverlayEnabledInput.checked = settings.clankerOverlayEnabled !== false;
  if (solanaOverlayEnabledInput) {
    solanaOverlayEnabledInput.checked = settings.solanaOverlayEnabled !== false;
  }
}

function loadSettings() {
  console.log('[ClawFi Options] Loading settings...');
  chrome.storage.local.get('settings', function(localResult) {
    var error = chrome.runtime.lastError;
    if (error) {
      console.error('[ClawFi Options] Local storage error:', error);
    }
    
    if (localResult && localResult.settings) {
      console.log('[ClawFi Options] Loaded from local storage');
      applySettings(localResult.settings);
    } else {
      // Fall back to sync storage
      chrome.storage.sync.get('settings', function(syncResult) {
        var syncError = chrome.runtime.lastError;
        if (syncError) {
          console.error('[ClawFi Options] Sync storage error:', syncError);
        }
        
        if (syncResult && syncResult.settings) {
          console.log('[ClawFi Options] Loaded from sync storage');
          applySettings(syncResult.settings);
        } else {
          console.log('[ClawFi Options] Using defaults');
          applySettings(defaultSettings);
        }
      });
    }
  });
}

function saveSettings(e) {
  e.preventDefault();
  
  var settings = {
    nodeUrl: nodeUrlInput.value.trim() || defaultSettings.nodeUrl,
    overlayEnabled: overlayEnabledInput.checked,
    clankerOverlayEnabled: clankerOverlayEnabledInput.checked,
    solanaOverlayEnabled: solanaOverlayEnabledInput ? solanaOverlayEnabledInput.checked : true,
  };
  
  console.log('[ClawFi Options] Saving settings...', settings);
  
  // Save to local storage
  chrome.storage.local.set({ settings: settings }, function() {
    var localError = chrome.runtime.lastError;
    if (localError) {
      console.error('[ClawFi Options] Local save error:', localError);
      showStatus('error', '!', 'Error saving: ' + localError.message);
      return;
    }
    
    console.log('[ClawFi Options] Saved to local storage');
    
    // Also save to sync
    chrome.storage.sync.set({ settings: settings }, function() {
      var syncError = chrome.runtime.lastError;
      if (syncError) {
        console.warn('[ClawFi Options] Sync save warning:', syncError);
      } else {
        console.log('[ClawFi Options] Saved to sync storage');
      }
      
      showStatus('success', '', 'Settings saved!');
      
      // Notify background script
      try {
        chrome.runtime.sendMessage({ type: 'SET_SETTINGS', settings: settings }, function(response) {
          var msgError = chrome.runtime.lastError;
          if (msgError) {
            console.warn('[ClawFi Options] Background message error:', msgError);
          } else {
            console.log('[ClawFi Options] Background notified');
          }
        });
      } catch (err) {
        console.warn('[ClawFi Options] Message send error:', err);
      }
    });
  });
  
  return false;
}

document.addEventListener('DOMContentLoaded', function() {
  loadSettings();
  form.addEventListener('submit', saveSettings);
});
