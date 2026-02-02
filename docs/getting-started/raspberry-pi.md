# Raspberry Pi Setup

Transform your Raspberry Pi into a 24/7 trading intelligence appliance. No cloud dependencies, no subscription fees - your machine, your rules.

## Why Raspberry Pi?

| Feature | Cloud/VPS | Mac Mini | Raspberry Pi |
|---------|-----------|----------|--------------|
| Hardware Cost | $0 | $599+ | $55 |
| Monthly Cost | $20-100 | $0 | $0 |
| Power Usage | N/A | 30-50W | 3-5W |
| Monthly Electric | N/A | ~$15 | ~$1 |
| Data Privacy | Shared | Local | Local |
| Setup Time | Minutes | Hours | Minutes |

## Requirements

### Hardware

- **Raspberry Pi 4** (4GB+ RAM) or **Raspberry Pi 5**
- 32GB+ microSD card (64GB recommended)
- Reliable internet connection
- Official Raspberry Pi power supply

### Software

- Raspberry Pi OS (64-bit recommended)
- SSH access enabled

## Quick Install

One command installs everything:

```bash
curl -sL https://raw.githubusercontent.com/ClawFiAI/clawfi/main/installers/linux/install.sh | sudo bash
```

The installer automatically:
1. Installs Node.js and dependencies
2. Clones and builds ClawF
3. Configures systemd for auto-start on boot
4. Generates secure credentials
5. Starts the ClawF agent and dashboard

## After Installation

Once complete, you'll see:

```
Dashboard:     http://<your-pi-ip>:3000
Agent API:     http://<your-pi-ip>:3001
Health Check:  http://<your-pi-ip>:3001/health
```

Access the dashboard from any device on your network.

## Verify It's Running

```bash
# Check service status
sudo systemctl status clawfi

# View live logs
sudo journalctl -u clawfi -f

# Quick health check
curl http://localhost:3001/health
```

## Managing ClawF

### Start/Stop/Restart

```bash
sudo systemctl start clawfi      # Start
sudo systemctl stop clawfi       # Stop
sudo systemctl restart clawfi    # Restart
sudo systemctl enable clawfi     # Enable auto-start on boot
```

### View Logs

```bash
# Agent logs (live)
sudo journalctl -u clawfi -f

# Dashboard logs
sudo journalctl -u clawfi-dashboard -f

# Last 100 lines
sudo journalctl -u clawfi -n 100
```

### Update ClawF

```bash
sudo /opt/clawfi/installers/linux/update.sh
```

Updates preserve all your data and configuration.

## Configuration

Edit settings at `/opt/clawfi/data/.env`:

```bash
sudo nano /opt/clawfi/data/.env
```

Key settings:

```env
# RPC Endpoints (add your own for better performance)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
BASE_RPC_URL=https://mainnet.base.org

# Ports
PORT=3001
DASHBOARD_PORT=3000
```

Restart after changes:

```bash
sudo systemctl restart clawfi
```

## Data & Backups

All data is stored in `/opt/clawfi/data/`:

| Folder | Contents |
|--------|----------|
| `db/` | SQLite database |
| `logs/` | Application logs |
| `cache/` | Temporary cache |
| `backups/` | Automatic backups |
| `.env` | Configuration |

### Manual Backup

```bash
# Create backup
sudo tar -czf ~/clawfi-backup-$(date +%Y%m%d).tar.gz -C /opt/clawfi/data .

# Restore backup
sudo tar -xzf ~/clawfi-backup-YYYYMMDD.tar.gz -C /opt/clawfi/data
sudo systemctl restart clawfi
```

## Performance Tips

1. **Use a fast microSD card** - Class 10 / A2 rated
2. **Consider USB SSD** - Faster database performance
3. **Use Pi OS Lite** - No desktop = less overhead
4. **Dedicated Pi** - Don't run other heavy services

## Troubleshooting

### Service Won't Start

```bash
# Check for errors
sudo journalctl -u clawfi -n 50 --no-pager

# Check disk space
df -h

# Check memory
free -h
```

### Out of Memory

```bash
# Add swap space
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### Port Already in Use

```bash
# Find what's using the port
sudo lsof -i :3001

# Change port in config
sudo nano /opt/clawfi/data/.env
```

## Uninstall

```bash
# Keep data
sudo /opt/clawfi/installers/linux/uninstall.sh

# Remove everything including data
sudo /opt/clawfi/installers/linux/uninstall.sh --purge
```

## Security

1. Change default SSH password
2. Enable firewall (allow ports 3000, 3001 only)
3. Use HTTPS with a reverse proxy for remote access
4. Keep Pi OS and ClawF updated

---

**Your $55 Raspberry Pi is now a 24/7 trading intelligence machine.**
