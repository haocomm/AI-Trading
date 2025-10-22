# AI Trading Platform - Docker Deployment Guide

## Phase 2.4 Multi-Exchange Expansion Support

This guide provides comprehensive instructions for deploying the AI Trading Platform using Docker with support for multi-exchange operations (Binance + Bitkub) and advanced monitoring.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Configuration](#configuration)
4. [Deployment Options](#deployment-options)
5. [Monitoring & Health Checks](#monitoring--health-checks)
6. [Data Management](#data-management)
7. [Security](#security)
8. [Troubleshooting](#troubleshooting)
9. [Maintenance](#maintenance)

---

## 🔧 Prerequisites

### System Requirements
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **Memory**: Minimum 4GB RAM (8GB recommended for production)
- **Storage**: Minimum 20GB free space
- **Network**: Stable internet connection for exchange APIs

### Required API Keys
1. **Binance API Key & Secret** (Required for trading)
2. **Bitkub API Key & Secret** (Required for Thai market access)
3. **Gemini API Key** (Required for AI decision making)
4. **Optional**: OpenAI, Claude, Custom AI endpoints

---

## 🚀 Quick Start

### 1. Clone and Setup
```bash
# Clone the repository
git clone <your-repo-url>
cd ai-trading-platform

# Copy environment configuration
cp .env.docker .env

# Create necessary directories
mkdir -p data logs config backups
```

### 2. Configure Environment
```bash
# Edit the .env file with your API keys
nano .env

# Minimum required configuration:
# - BINANCE_API_KEY and BINANCE_API_SECRET
# - BITKUB_API_KEY and BITKUB_API_SECRET
# - GEMINI_API_KEY
```

### 3. Start Basic Services
```bash
# Start core services only
docker-compose up -d

# View logs
docker-compose logs -f trading-app
```

### 4. Verify Deployment
```bash
# Check application health
curl http://localhost:3001/health

# Check services status
docker-compose ps
```

---

## ⚙️ Configuration

### Environment Variables

#### Core Configuration
```bash
# Trading Control
TRADING_ENABLED=false          # Start with paper trading
PAPER_TRADING_ENABLED=true     # Enable simulation mode

# Risk Management
RISK_PER_TRADE_PERCENTAGE=5    # 5% risk per trade
MAX_DAILY_LOSS_PERCENTAGE=10   # 10% daily loss limit
MAX_CONCURRENT_POSITIONS=3     # Maximum open positions
```

#### Exchange Configuration
```bash
# Binance
BINANCE_API_KEY=your_binance_key
BINANCE_API_SECRET=your_binance_secret

# Bitkub (Thai Market)
BITKUB_API_KEY=your_bitkub_key
BITKUB_API_SECRET=your_bitkub_secret
```

#### AI Configuration
```bash
# Primary AI Provider
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.0-flash-exp

# Optional Multi-Provider Support
OPENAI_API_KEY=your_openai_key
CLAUDE_API_KEY=your_claude_key
```

### Database Configuration
```bash
# PostgreSQL (Production)
POSTGRES_DB=trading_platform
POSTGRES_USER=trading_user
POSTGRES_PASSWORD=secure_password

# Redis (Caching)
REDIS_PASSWORD=redis_secure_password
```

---

## 🏗️ Deployment Options

### Option 1: Development/Testing
```bash
# Basic deployment with core services
docker-compose up -d trading-app postgres redis

# Includes monitoring
docker-compose --profile monitoring up -d
```

### Option 2: Production Deployment
```bash
# Full production stack
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# With monitoring enabled
docker-compose -f docker-compose.yml -f docker-compose.prod.yml --profile monitoring up -d
```

### Option 3: Custom Configuration
```bash
# Create custom compose file
cp docker-compose.yml docker-compose.custom.yml

# Edit and deploy
docker-compose -f docker-compose.custom.yml up -d
```

---

## 📊 Monitoring & Health Checks

### Health Endpoints

| Endpoint | Port | Description |
|----------|------|-------------|
| `/health/live` | 3001 | Liveness probe |
| `/health/ready` | 3001 | Readiness probe |
| `/health` | 3001 | Comprehensive health |
| `/health/system` | 3001 | System metrics |
| `/metrics` | 3001 | Prometheus metrics |

### Monitoring Stack

#### Grafana Dashboard
- **URL**: http://localhost:3002
- **Default Login**: admin / (check .env for password)
- **Features**: Trading metrics, system health, arbitrage monitoring

#### Prometheus Metrics
- **URL**: http://localhost:9090
- **Features**: Time-series data, alerting rules
- **Data Retention**: 200 hours (configurable)

### Health Check Commands
```bash
# Application health
curl http://localhost:3001/health

# System metrics
curl http://localhost:3001/health/system

# Service status
curl http://localhost:3001/health/services

# Database connectivity
curl http://localhost:3001/health/application
```

---

## 💾 Data Management

### Data Persistence

#### Volumes
```bash
# Application data
./data/           # Database files
./logs/           # Application logs
./config/         # Configuration files
./backups/        # Database backups
```

#### Database Backups
```bash
# Manual backup
docker-compose exec backup /backup.sh

# Scheduled backups (if backup profile enabled)
docker-compose --profile backup up -d backup

# View backup logs
tail -f ./backups/backup.log
```

### Database Operations

#### Connect to PostgreSQL
```bash
# Interactive connection
docker-compose exec postgres psql -U trading_user -d trading_platform

# Execute SQL file
docker-compose exec postgres psql -U trading_user -d trading_platform -f script.sql
```

#### Redis Operations
```bash
# Connect to Redis
docker-compose exec redis redis-cli

# Monitor Redis
docker-compose exec redis redis-cli monitor
```

---

## 🔒 Security

### API Key Management
```bash
# Use Docker secrets (recommended)
echo "your_api_key" | docker secret create binance_api_key -

# Or environment variables (development)
export BINANCE_API_KEY="your_api_key"
```

### Network Security
```bash
# View network configuration
docker network ls
docker network inspect ai-trading_trading-network

# Container isolation
docker-compose exec trading-app ping postgres  # Should work
docker-compose exec trading-app ping google.com  # Should work
```

### SSL/TLS Configuration
```bash
# Enable HTTPS with Nginx
docker-compose --profile production up -d nginx

# Place SSL certificates
./docker/nginx/ssl/cert.pem
./docker/nginx/ssl/key.pem
```

### Access Control
```bash
# Firewall rules (example)
ufw allow 3001/tcp  # Health checks only
ufw allow 9090/tcp  # Prometheus (internal)
ufw allow 3002/tcp  # Grafana (restricted)
```

---

## 🔧 Troubleshooting

### Common Issues

#### Application Won't Start
```bash
# Check logs
docker-compose logs trading-app

# Check configuration
docker-compose config

# Validate environment
docker-compose run --rm trading-app node -e "console.log(process.env.NODE_ENV)"
```

#### Database Connection Issues
```bash
# Check database health
docker-compose exec postgres pg_isready

# Test connection from app container
docker-compose exec trading-app node -e "
const { Client } = require('pg');
const client = new Client({
  host: 'postgres',
  user: 'trading_user',
  password: process.env.POSTGRES_PASSWORD,
  database: 'trading_platform'
});
client.connect().then(() => console.log('Connected!')).catch(console.error);
"
```

#### API Connection Problems
```bash
# Test Binance connection
curl -H "X-MBX-APIKEY: $BINANCE_API_KEY" \
     "https://api.binance.com/api/v3/ping"

# Test Bitkub connection
curl "https://api.bitkub.com/api/v3/market/time"
```

#### Memory Issues
```bash
# Check container memory usage
docker stats

# Restart with increased memory limit
docker-compose up -d --scale trading-app=1
```

### Debug Mode
```bash
# Enable debug logging
echo "LOG_LEVEL=debug" >> .env
docker-compose restart trading-app

# View debug logs
docker-compose logs -f trading-app | grep DEBUG
```

### Performance Issues
```bash
# Monitor resource usage
docker stats --no-stream

# Check database performance
docker-compose exec postgres psql -U trading_user -d trading_platform -c "
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;"
```

---

## 🔄 Maintenance

### Updates and Upgrades

#### Update Application
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose build --no-cache
docker-compose up -d

# Verify update
curl http://localhost:3001/health
```

#### Database Maintenance
```bash
# Clean old market data
docker-compose exec postgres psql -U trading_user -d trading_platform -c "
DELETE FROM market_data
WHERE created_at < NOW() - INTERVAL '90 days';"

# Update statistics
docker-compose exec postgres psql -U trading_user -d trading_platform -c "ANALYZE;"
```

### Log Management
```bash
# Rotate logs
docker-compose exec trading-app logrotate /etc/logrotate.d/trading

# Clean old logs
find ./logs -name "*.log" -mtime +7 -delete

# Monitor log size
du -sh ./logs/
```

### Health Monitoring
```bash
# Create health check script
cat > health_check.sh << 'EOF'
#!/bin/bash
HEALTH=$(curl -s http://localhost:3001/health | jq -r .status)
if [ "$HEALTH" != "healthy" ]; then
    echo "Health check failed: $HEALTH"
    # Send alert
    curl -X POST -H 'Content-type: application/json' \
         --data '{"content":"❌ AI Trading Platform health check failed"}' \
         $ALERT_WEBHOOK_URL
fi
EOF

chmod +x health_check.sh
```

### Scheduled Tasks
```bash
# Add to crontab
crontab -e

# Backup every day at 2 AM
0 2 * * * cd /path/to/ai-trading-platform && docker-compose --profile backup up backup

# Health check every 5 minutes
*/5 * * * * /path/to/health_check.sh

# Log cleanup weekly
0 0 * * 0 find /path/to/ai-trading-platform/logs -name "*.log" -mtime +7 -delete
```

---

## 📈 Performance Optimization

### Production Tuning
```yaml
# docker-compose.prod.yml optimizations
services:
  trading-app:
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
        reservations:
          memory: 1G
          cpus: '0.5'
    environment:
      - NODE_OPTIONS=--max-old-space-size=1536
```

### Database Optimization
```sql
-- PostgreSQL performance tuning
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
SELECT pg_reload_conf();
```

### Monitoring Alerts
Set up alerts for:
- CPU usage > 80%
- Memory usage > 90%
- Disk space < 10%
- API error rate > 5%
- Trading system downtime

---

## 🆘 Support

### Log Locations
- **Application logs**: `./logs/trading.log`
- **Database logs**: `./data/postgres/logs/`
- **Backup logs**: `./backups/backup.log`
- **Docker logs**: `docker-compose logs [service]`

### Useful Commands
```bash
# Service status
docker-compose ps

# Resource usage
docker stats

# Network issues
docker-compose exec trading-app ping postgres

# Full restart
docker-compose down && docker-compose up -d

# Clean rebuild
docker-compose down -v && docker-compose build --no-cache && docker-compose up -d
```

### Emergency Procedures
```bash
# Emergency stop (graceful)
docker-compose stop

# Force stop (emergency)
docker-compose kill

# Data recovery from backup
docker-compose down
./restore_backup.sh backup_file.sql
docker-compose up -d
```

---

## 📝 Version History

- **v1.0.0**: Initial Docker deployment
- **v1.1.0**: Added monitoring stack
- **v1.2.0**: Phase 2.4 multi-exchange support
- **v1.3.0**: Production optimizations and security enhancements

---

**Note**: This deployment guide assumes you have proper API keys and understand the risks associated with automated trading. Always start with paper trading enabled and monitor systems closely in production environments.