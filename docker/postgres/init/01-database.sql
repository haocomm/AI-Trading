-- =============================================================================
-- AI Trading Platform - PostgreSQL Database Initialization
-- Phase 2.4 Multi-Exchange Expansion Schema
-- =============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create indexes for performance
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Application timezone
SET timezone = 'Asia/Bangkok';

-- =============================================================================
-- CORE TRADING TABLES
-- =============================================================================

-- Trades table - stores all executed trades
CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(4) NOT NULL CHECK(side IN ('BUY', 'SELL')),
    quantity DECIMAL(20,8) NOT NULL,
    price DECIMAL(20,8) NOT NULL,
    timestamp BIGINT NOT NULL,
    order_id VARCHAR(100),
    exchange VARCHAR(20) NOT NULL CHECK(exchange IN ('binance', 'bitkub')),
    type VARCHAR(10) NOT NULL CHECK(type IN ('MARKET', 'LIMIT')),
    status VARCHAR(20) NOT NULL CHECK(status IN ('PENDING', 'FILLED', 'CANCELLED', 'FAILED')),
    fees DECIMAL(20,8),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Positions table - tracks current and historical positions
CREATE TABLE IF NOT EXISTS positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) NOT NULL,
    quantity DECIMAL(20,8) NOT NULL,
    entry_price DECIMAL(20,8) NOT NULL,
    current_price DECIMAL(20,8) NOT NULL,
    unrealized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
    realized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
    timestamp BIGINT NOT NULL,
    exchange VARCHAR(20) NOT NULL CHECK(exchange IN ('binance', 'bitkub')),
    stop_loss DECIMAL(20,8),
    take_profit DECIMAL(20,8),
    status VARCHAR(20) NOT NULL CHECK(status IN ('OPEN', 'CLOSED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- AI decisions table - stores AI trading decisions and analysis
CREATE TABLE IF NOT EXISTS ai_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) NOT NULL,
    action VARCHAR(10) NOT NULL CHECK(action IN ('BUY', 'SELL', 'HOLD')),
    confidence DECIMAL(5,4) NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
    reasoning TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    executed BOOLEAN NOT NULL DEFAULT FALSE,
    result VARCHAR(20) CHECK(result IN ('PROFIT', 'LOSS', 'BREAK_EVEN')),
    model VARCHAR(100) NOT NULL,
    input_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Market data table - stores historical price data
CREATE TABLE IF NOT EXISTS market_data (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    price DECIMAL(20,8) NOT NULL,
    volume DECIMAL(20,8) NOT NULL,
    high_24h DECIMAL(20,8) NOT NULL,
    low_24h DECIMAL(20,8) NOT NULL,
    change_24h DECIMAL(10,6) NOT NULL,
    timestamp BIGINT NOT NULL,
    exchange VARCHAR(20) NOT NULL CHECK(exchange IN ('binance', 'bitkub')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, timestamp, exchange)
);

-- =============================================================================
-- PHASE 2.4 MULTI-EXCHANGE EXPANSION TABLES
-- =============================================================================

-- Arbitrage opportunities table
CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK(type IN ('SIMPLE', 'TRIANGULAR', 'STATISTICAL')),
    buy_exchange VARCHAR(20) NOT NULL CHECK(buy_exchange IN ('binance', 'bitkub')),
    sell_exchange VARCHAR(20) NOT NULL CHECK(sell_exchange IN ('binance', 'bitkub')),
    buy_price DECIMAL(20,8) NOT NULL,
    sell_price DECIMAL(20,8) NOT NULL,
    spread DECIMAL(20,8) NOT NULL,
    spread_percent DECIMAL(10,6) NOT NULL,
    gross_profit DECIMAL(20,8) NOT NULL,
    estimated_fees DECIMAL(20,8) NOT NULL,
    net_profit DECIMAL(20,8) NOT NULL,
    profit_percent DECIMAL(10,6) NOT NULL,
    confidence DECIMAL(5,4) NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
    risk_level VARCHAR(10) NOT NULL CHECK(risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
    liquidity_score DECIMAL(5,4) NOT NULL,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK(status IN ('ACTIVE', 'EXPIRED', 'EXECUTED', 'CANCELLED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Arbitrage executions table
CREATE TABLE IF NOT EXISTS arbitrage_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opportunity_id UUID NOT NULL REFERENCES arbitrage_opportunities(id),
    execution_plan JSONB NOT NULL,
    executed_steps JSONB NOT NULL,
    success BOOLEAN NOT NULL,
    total_investment DECIMAL(20,8) NOT NULL,
    total_fees DECIMAL(20,8) NOT NULL,
    actual_profit DECIMAL(20,8),
    execution_time_ms INTEGER NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Exchange balances table
CREATE TABLE IF NOT EXISTS exchange_balances (
    id BIGSERIAL PRIMARY KEY,
    exchange VARCHAR(20) NOT NULL CHECK(exchange IN ('binance', 'bitkub')),
    currency VARCHAR(10) NOT NULL,
    available DECIMAL(20,8) NOT NULL,
    reserved DECIMAL(20,8) NOT NULL DEFAULT 0,
    total DECIMAL(20,8) GENERATED ALWAYS AS (available + reserved) STORED,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Thai market compliance logs
CREATE TABLE IF NOT EXISTS thai_compliance_logs (
    id BIGSERIAL PRIMARY KEY,
    order_request JSONB NOT NULL,
    compliance_result JSONB NOT NULL,
    is_compliant BOOLEAN NOT NULL,
    violations TEXT[],
    warnings TEXT[],
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Trades table indexes
CREATE INDEX IF NOT EXISTS idx_trades_symbol_timestamp ON trades(symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_exchange ON trades(exchange);
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC);

-- Positions table indexes
CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_exchange ON positions(exchange);
CREATE INDEX IF NOT EXISTS idx_positions_timestamp ON positions(timestamp DESC);

-- AI decisions table indexes
CREATE INDEX IF NOT EXISTS idx_ai_decisions_symbol_timestamp ON ai_decisions(symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_executed ON ai_decisions(executed);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_model ON ai_decisions(model);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_timestamp ON ai_decisions(timestamp DESC);

-- Market data table indexes
CREATE INDEX IF NOT EXISTS idx_market_data_symbol_timestamp ON market_data(symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_market_data_exchange ON market_data(exchange);
CREATE INDEX IF NOT EXISTS idx_market_data_timestamp ON market_data(timestamp DESC);

-- Arbitrage table indexes
CREATE INDEX IF NOT EXISTS idx_arbitrage_opportunities_symbol ON arbitrage_opportunities(symbol);
CREATE INDEX IF NOT EXISTS idx_arbitrage_opportunities_status ON arbitrage_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_arbitrage_opportunities_detected_at ON arbitrage_opportunities(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_arbitrage_opportunities_profit_percent ON arbitrage_opportunities(profit_percent DESC);

-- Exchange balances indexes
CREATE INDEX IF NOT EXISTS idx_exchange_balances_exchange_timestamp ON exchange_balances(exchange, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_balances_currency ON exchange_balances(currency);

-- =============================================================================
-- PARTITIONING FOR TIME-SERIES DATA
-- =============================================================================

-- Partition market_data table by month for better performance
CREATE TABLE IF NOT EXISTS market_data_y2024m01 PARTITION OF market_data
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE IF NOT EXISTS market_data_y2024m02 PARTITION OF market_data
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Additional partitions can be created automatically with a maintenance script

-- =============================================================================
-- VIEWS FOR COMMON QUERIES
-- =============================================================================

-- View for current positions
CREATE OR REPLACE VIEW current_positions AS
SELECT * FROM positions WHERE status = 'OPEN';

-- View for recent trades
CREATE OR REPLACE VIEW recent_trades AS
SELECT * FROM trades ORDER BY timestamp DESC LIMIT 100;

-- View for active arbitrage opportunities
CREATE OR REPLACE VIEW active_arbitrage_opportunities AS
SELECT * FROM arbitrage_opportunities
WHERE status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP
ORDER BY profit_percent DESC;

-- View for exchange balance summary
CREATE OR REPLACE VIEW exchange_balance_summary AS
SELECT
    exchange,
    currency,
    SUM(available) as total_available,
    SUM(reserved) as total_reserved,
    SUM(total) as total_balance
FROM exchange_balances
WHERE timestamp > (CURRENT_TIMESTAMP - INTERVAL '1 hour')
GROUP BY exchange, currency;

-- =============================================================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for tables with updated_at
CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- INITIAL DATA SETUP
-- =============================================================================

-- Insert default configuration values if needed
INSERT INTO ai_decisions (symbol, action, confidence, reasoning, model, input_data)
VALUES
    ('BTCUSDT', 'HOLD', 1.0, 'System initialized - monitoring market conditions', 'system', '{}')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- GRANT PERMISSIONS (adjust based on your user setup)
-- =============================================================================

-- Grant permissions to the trading user
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO trading_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO trading_user;

COMMIT;