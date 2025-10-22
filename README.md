# AI-Trading Platform

AI-powered cryptocurrency trading platform with autonomous trading capabilities, integrating Gemini 2.5 Pro for decision-making and Binance API for execution.

## Features

- **AI-Powered Trading**: Integration with Gemini 2.5 Pro for trading decisions
- **Risk Management**: 5% position sizing, dynamic stop-loss/take-profit, daily loss limits
- **Real-time Monitoring**: Live price tracking and position management
- **Multi-Exchange Support**: Binance (primary), Bitkub (future expansion)
- **Comprehensive Logging**: Trade history, AI decisions, and performance tracking
- **Mobile Alerts**: Trade notifications and system monitoring
- **Database Storage**: SQLite for persistent trade and decision history

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Binance API credentials
- Gemini API key

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd AI-Trading

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your API keys and configuration
nano .env
```

### Environment Configuration

Required environment variables:

```bash
# Exchange API Configuration
BINANCE_API_KEY=your_binance_api_key_here
BINANCE_API_SECRET=your_binance_api_secret_here

# AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here

# Risk Management
RISK_PER_TRADE_PERCENTAGE=5
MAX_DAILY_LOSS_PERCENTAGE=10
MAX_CONCURRENT_POSITIONS=3

# Trading Configuration
TRADING_ENABLED=false  # Start with false for testing
MIN_TRADE_AMOUNT_USD=10
```

### Build and Test

```bash
# Build the TypeScript project
npm run build

# Run MVP tests
npm run test

# Test the system
npm run dev
```

### Usage

#### Development Mode
```bash
# Start in development mode with file watching
npm run dev

# Run the test suite
npm run test
```

#### Production Mode
```bash
# Build the project
npm run build

# Start the bot
npm start
```

#### Testing
```bash
# Run the MVP validation test
npx ts-node src/scripts/test-mvp.ts
```

## Architecture

### Core Components

1. **Trading Bot (`src/index.ts`)**: Main application orchestrator
2. **Binance Service (`src/services/binance.service.ts`)**: Exchange API integration
3. **Risk Service (`src/services/risk.service.ts`)**: Risk management and position sizing
4. **Database (`src/models/database.ts`)**: SQLite data persistence
5. **Logger (`src/utils/logger.ts`)**: Comprehensive logging system

### Key Features

#### Risk Management
- **Position Sizing**: 5% risk per trade with dynamic calculation
- **Stop Loss**: Volatility-based dynamic stops
- **Take Profit**: 2:1 risk/reward ratio
- **Daily Limits**: Maximum daily loss percentage enforcement
- **Emergency Controls**: Manual kill switch and circuit breakers

#### AI Integration
- **Decision Making**: Gemini 2.5 Pro for trading signals
- **Signal Processing**: Entry/exit point determination
- **Confidence Scoring**: AI decision confidence tracking
- **Learning Loop**: Decision logging for performance analysis

#### Data Management
- **Real-time Data**: WebSocket price feeds
- **Historical Storage**: Market data persistence
- **Trade History**: Complete trade logging with P&L tracking
- **Performance Metrics**: Win rate, profit factor, drawdown analysis

## Safety Features

- **Paper Trading Mode**: Test strategies without real money
- **Position Limits**: Maximum concurrent positions enforcement
- **Daily Loss Limits**: Automatic trading halt on excessive losses
- **Emergency Stop**: Manual override for immediate trading cessation
- **Error Handling**: Comprehensive error recovery and logging
- **API Rate Limiting**: Respect exchange API limits

## Configuration

### Risk Management Settings
- `RISK_PER_TRADE_PERCENTAGE`: Percentage of portfolio risked per trade (default: 5%)
- `MAX_DAILY_LOSS_PERCENTAGE`: Maximum daily loss before trading stops (default: 10%)
- `MAX_CONCURRENT_POSITIONS`: Maximum number of open positions (default: 3)
- `DEFAULT_STOP_LOSS_PERCENTAGE`: Default stop loss percentage (default: 2%)
- `DEFAULT_TAKE_PROFIT_PERCENTAGE`: Default take profit percentage (default: 4%)

### Trading Settings
- `TRADING_ENABLED`: Enable/disable live trading (start with `false`)
- `MIN_TRADE_AMOUNT_USD`: Minimum trade size in USD (default: $10)
- `MAX_TRADES_PER_HOUR`: Maximum trades per hour (default: 10)
- `POSITION_CHECK_INTERVAL_SECONDS`: Position monitoring frequency (default: 30s)

## Monitoring and Alerts

### Logging
- **Trade Logs**: All trades with execution details
- **AI Decision Logs**: AI reasoning and confidence scores
- **Risk Management Logs**: Risk violations and safety triggers
- **Performance Logs**: P&L tracking and system health

### Mobile Alerts
- **Trade Notifications**: Entry/exit confirmations
- **Stop Loss Alerts**: When stop levels are triggered
- **Daily P&L**: End-of-day performance summaries
- **System Alerts**: Errors and emergency stop activation

## Development

### Project Structure
```
src/
├── config/          # Configuration management
├── models/          # Database models and operations
├── services/        # Core business logic
│   ├── binance.service.ts
│   └── risk.service.ts
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
│   └── logger.ts
├── scripts/         # Utility scripts
│   └── test-mvp.ts
└── index.ts         # Main application entry point
```

### Adding New Features
1. Implement service logic in `src/services/`
2. Add database operations in `src/models/`
3. Define types in `src/types/`
4. Add logging with `src/utils/logger.ts`
5. Update configuration in `src/config/`

## Disclaimer

⚠️ **Important**: This software is for educational and personal use only. Cryptocurrency trading involves substantial risk of loss. Use at your own risk and never invest more than you can afford to lose.

- Start with paper trading or very small amounts
- Thoroughly test all configurations before live trading
- Monitor the system closely during operation
- Keep API keys secure and never commit them to version control
- Understand all risk management features before enabling live trading

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes with tests
4. Submit a pull request

**Built with ❤️ for automated cryptocurrency trading**
