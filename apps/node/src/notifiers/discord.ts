/**
 * Discord Webhook Notifier
 * 
 * Sends rich embed notifications to Discord channels for important signals.
 * 
 * Required ENV:
 * - DISCORD_WEBHOOK_URL: Webhook URL from Discord channel settings
 */

import type { Signal } from '@clawfi/core';

// ============================================
// Types
// ============================================

export interface DiscordConfig {
  webhookUrl: string;
  enabled?: boolean;
  signalTypes?: string[];
  minSeverity?: 'low' | 'medium' | 'high' | 'critical';
  username?: string;
  avatarUrl?: string;
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
    icon_url?: string;
  };
  timestamp?: string;
  url?: string;
  thumbnail?: {
    url: string;
  };
}

interface DiscordWebhookPayload {
  username?: string;
  avatar_url?: string;
  content?: string;
  embeds?: DiscordEmbed[];
}

// ============================================
// Constants
// ============================================

const SEVERITY_COLORS: Record<string, number> = {
  critical: 0xff0000, // Red
  high: 0xff9500,     // Orange
  medium: 0xffc107,   // Yellow
  low: 0x3498db,      // Blue
  info: 0x2ecc71,     // Green
};

const SEVERITY_EMOJI: Record<string, string> = {
  critical: ':red_circle:',
  high: ':orange_circle:',
  medium: ':yellow_circle:',
  low: ':blue_circle:',
  info: ':green_circle:',
};

const SIGNAL_TYPE_EMOJI: Record<string, string> = {
  LaunchDetected: ':rocket:',
  MoltDetected: ':crab:',
  EarlyDistribution: ':warning:',
  LiquidityRisk: ':fire:',
  RapidCreatorActivity: ':zap:',
  RiskAlert: ':warning:',
  PriceAlert: ':chart_with_upwards_trend:',
  TokenWarning: ':triangular_flag_on_post:',
};

const SEVERITY_ORDER = ['low', 'medium', 'high', 'critical'];

const DEFAULT_AVATAR = 'https://raw.githubusercontent.com/clawfiai/clawfi/main/docs/clawfi-logo.png';

// ============================================
// Discord Notifier
// ============================================

export class DiscordNotifier {
  private readonly config: Required<DiscordConfig>;
  private lastSendTime = 0;
  private readonly minIntervalMs = 500; // Rate limit: 2 msg/sec

  constructor(config: DiscordConfig) {
    this.config = {
      enabled: true,
      signalTypes: [
        'LaunchDetected',
        'MoltDetected',
        'EarlyDistribution',
        'LiquidityRisk',
        'RapidCreatorActivity',
      ],
      minSeverity: 'low',
      username: 'ClawFi',
      avatarUrl: DEFAULT_AVATAR,
      ...config,
    };
  }

  /**
   * Check if notifier is configured and enabled
   */
  isEnabled(): boolean {
    return (
      this.config.enabled &&
      !!this.config.webhookUrl &&
      this.config.webhookUrl.includes('discord.com/api/webhooks')
    );
  }

  /**
   * Check if signal should be notified
   */
  shouldNotify(signal: Signal): boolean {
    if (!this.isEnabled()) return false;

    // Check signal type
    if (
      signal.signalType &&
      !this.config.signalTypes.includes(signal.signalType)
    ) {
      return false;
    }

    // Check severity
    const signalSeverityIndex = SEVERITY_ORDER.indexOf(signal.severity);
    const minSeverityIndex = SEVERITY_ORDER.indexOf(this.config.minSeverity);
    
    if (signalSeverityIndex < minSeverityIndex) {
      return false;
    }

    return true;
  }

  /**
   * Send notification for a signal
   */
  async notify(signal: Signal): Promise<boolean> {
    if (!this.shouldNotify(signal)) {
      return false;
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastSend = now - this.lastSendTime;
    if (timeSinceLastSend < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - timeSinceLastSend));
    }

    const payload = this.formatPayload(signal);
    const success = await this.sendWebhook(payload);
    
    if (success) {
      this.lastSendTime = Date.now();
    }

    return success;
  }

  /**
   * Format signal into Discord webhook payload with rich embed
   */
  private formatPayload(signal: Signal): DiscordWebhookPayload {
    const typeEmoji = signal.signalType 
      ? (SIGNAL_TYPE_EMOJI[signal.signalType] || ':bell:')
      : ':bell:';
    const severityEmoji = SEVERITY_EMOJI[signal.severity] || ':white_circle:';
    
    const color = SEVERITY_COLORS[signal.severity] || SEVERITY_COLORS.info;

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

    // Severity field
    fields.push({
      name: 'Severity',
      value: `${severityEmoji} ${signal.severity.toUpperCase()}`,
      inline: true,
    });

    // Chain field
    if (signal.chain) {
      fields.push({
        name: 'Chain',
        value: signal.chain.toUpperCase(),
        inline: true,
      });
    }

    // Signal type field
    if (signal.signalType) {
      fields.push({
        name: 'Type',
        value: `${typeEmoji} ${signal.signalType}`,
        inline: true,
      });
    }

    // Token field with link
    if (signal.token) {
      const shortAddr = `${signal.token.slice(0, 6)}...${signal.token.slice(-4)}`;
      const basescanUrl = `https://basescan.org/token/${signal.token}`;
      fields.push({
        name: 'Token',
        value: signal.tokenSymbol 
          ? `[${signal.tokenSymbol}](${basescanUrl}) (${shortAddr})`
          : `[${shortAddr}](${basescanUrl})`,
        inline: true,
      });
    }

    // Evidence-based fields
    if (signal.evidence && typeof signal.evidence === 'object') {
      const evidence = signal.evidence as Record<string, unknown>;
      
      if (evidence.creatorAddress) {
        const addr = String(evidence.creatorAddress);
        const shortAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
        const url = `https://basescan.org/address/${addr}`;
        fields.push({
          name: 'Creator',
          value: `[${shortAddr}](${url})`,
          inline: true,
        });
      }

      if (evidence.creatorTokenCount) {
        fields.push({
          name: 'Creator Tokens',
          value: `${evidence.creatorTokenCount} total`,
          inline: true,
        });
      }

      if (evidence.wallet) {
        const addr = String(evidence.wallet);
        const shortAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
        const url = `https://basescan.org/address/${addr}`;
        fields.push({
          name: 'Wallet',
          value: `[${shortAddr}](${url})`,
          inline: true,
        });
      }

      if (evidence.txHash) {
        const txUrl = `https://basescan.org/tx/${evidence.txHash}`;
        fields.push({
          name: 'Transaction',
          value: `[View on Basescan](${txUrl})`,
          inline: true,
        });
      }

      if (evidence.marketCapUsd) {
        fields.push({
          name: 'Market Cap',
          value: `$${Number(evidence.marketCapUsd).toLocaleString()}`,
          inline: true,
        });
      }
    }

    // Build embed
    const embed: DiscordEmbed = {
      title: `${typeEmoji} ${signal.title}`,
      description: signal.summary,
      color,
      fields,
      footer: {
        text: `ClawFi Intelligence • ${signal.strategyId || 'System'}`,
      },
      timestamp: new Date(signal.ts).toISOString(),
    };

    // Add token URL if available
    if (signal.token) {
      embed.url = `https://basescan.org/token/${signal.token}`;
    }

    return {
      username: this.config.username,
      avatar_url: this.config.avatarUrl,
      embeds: [embed],
    };
  }

  /**
   * Send webhook request to Discord
   */
  private async sendWebhook(payload: DiscordWebhookPayload): Promise<boolean> {
    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('[Discord] Webhook failed:', response.status, text);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[Discord] Webhook error:', error);
      return false;
    }
  }

  /**
   * Test connection by sending a test embed
   */
  async testConnection(): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      const payload: DiscordWebhookPayload = {
        username: this.config.username,
        avatar_url: this.config.avatarUrl,
        embeds: [{
          title: ':crab: ClawFi Connected',
          description: 'Discord notifications are now active. You will receive alerts for important signals.',
          color: 0x14b899, // ClawFi teal
          fields: [
            {
              name: 'Status',
              value: ':green_circle: Online',
              inline: true,
            },
            {
              name: 'Version',
              value: 'v0.2.0',
              inline: true,
            },
          ],
          footer: {
            text: 'ClawFi Intelligence',
          },
          timestamp: new Date().toISOString(),
        }],
      };

      return await this.sendWebhook(payload);
    } catch {
      return false;
    }
  }

  /**
   * Send a batch of signals (for digest mode)
   */
  async sendDigest(signals: Signal[], title: string = 'Signal Digest'): Promise<boolean> {
    if (!this.isEnabled() || signals.length === 0) {
      return false;
    }

    const bySeverity = {
      critical: signals.filter(s => s.severity === 'critical').length,
      high: signals.filter(s => s.severity === 'high').length,
      medium: signals.filter(s => s.severity === 'medium').length,
      low: signals.filter(s => s.severity === 'low').length,
    };

    const summaryLines = signals.slice(0, 10).map(s => {
      const emoji = s.signalType ? (SIGNAL_TYPE_EMOJI[s.signalType] || ':bell:') : ':bell:';
      return `${emoji} ${s.title}`;
    });

    if (signals.length > 10) {
      summaryLines.push(`...and ${signals.length - 10} more`);
    }

    const payload: DiscordWebhookPayload = {
      username: this.config.username,
      avatar_url: this.config.avatarUrl,
      embeds: [{
        title: `:scroll: ${title}`,
        description: summaryLines.join('\n'),
        color: 0x14b899,
        fields: [
          {
            name: 'Total Signals',
            value: String(signals.length),
            inline: true,
          },
          {
            name: 'Critical/High',
            value: `${bySeverity.critical}/${bySeverity.high}`,
            inline: true,
          },
          {
            name: 'Medium/Low',
            value: `${bySeverity.medium}/${bySeverity.low}`,
            inline: true,
          },
        ],
        footer: {
          text: 'ClawFi Intelligence Digest',
        },
        timestamp: new Date().toISOString(),
      }],
    };

    return await this.sendWebhook(payload);
  }
}

/**
 * Create Discord notifier from environment
 */
export function createDiscordNotifier(): DiscordNotifier {
  return new DiscordNotifier({
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
    enabled: process.env.DISCORD_ENABLED !== 'false',
    username: process.env.DISCORD_USERNAME || 'ClawFi',
  });
}
