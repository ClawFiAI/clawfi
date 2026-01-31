/**
 * Notifiers Index
 * 
 * Export all notification providers
 */

export { TelegramNotifier, createTelegramNotifier, type TelegramConfig } from './telegram.js';
export { DiscordNotifier, createDiscordNotifier, type DiscordConfig } from './discord.js';

import type { Signal } from '@clawfi/core';
import { TelegramNotifier, createTelegramNotifier } from './telegram.js';
import { DiscordNotifier, createDiscordNotifier } from './discord.js';

/**
 * Unified notification manager
 * Sends signals to all configured notification channels
 */
export class NotificationManager {
  private telegram: TelegramNotifier;
  private discord: DiscordNotifier;

  constructor() {
    this.telegram = createTelegramNotifier();
    this.discord = createDiscordNotifier();
  }

  /**
   * Send notification to all enabled channels
   */
  async notify(signal: Signal): Promise<{ telegram: boolean; discord: boolean }> {
    const [telegram, discord] = await Promise.all([
      this.telegram.notify(signal).catch(() => false),
      this.discord.notify(signal).catch(() => false),
    ]);

    return { telegram, discord };
  }

  /**
   * Test all notification channels
   */
  async testAll(): Promise<{ telegram: boolean; discord: boolean }> {
    const results = {
      telegram: false,
      discord: false,
    };

    if (this.telegram.isEnabled()) {
      results.telegram = await this.telegram.testConnection();
      console.log(`[Notifiers] Telegram: ${results.telegram ? 'OK' : 'FAILED'}`);
    } else {
      console.log('[Notifiers] Telegram: Not configured');
    }

    if (this.discord.isEnabled()) {
      results.discord = await this.discord.testConnection();
      console.log(`[Notifiers] Discord: ${results.discord ? 'OK' : 'FAILED'}`);
    } else {
      console.log('[Notifiers] Discord: Not configured');
    }

    return results;
  }

  /**
   * Get status of all notification channels
   */
  getStatus(): { telegram: boolean; discord: boolean } {
    return {
      telegram: this.telegram.isEnabled(),
      discord: this.discord.isEnabled(),
    };
  }

  /**
   * Send digest to all channels
   */
  async sendDigest(signals: Signal[], title?: string): Promise<{ telegram: boolean; discord: boolean }> {
    // Discord supports rich digests
    const discord = await this.discord.sendDigest(signals, title).catch(() => false);
    
    // For Telegram, we just send the top signals
    let telegram = false;
    if (this.telegram.isEnabled() && signals.length > 0) {
      const topSignal = signals.find(s => s.severity === 'critical' || s.severity === 'high') || signals[0];
      if (topSignal) {
        telegram = await this.telegram.notify(topSignal).catch(() => false);
      }
    }

    return { telegram, discord };
  }
}

/**
 * Create notification manager instance
 */
export function createNotificationManager(): NotificationManager {
  return new NotificationManager();
}
