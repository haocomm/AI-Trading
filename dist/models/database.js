"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const config_1 = require("@/config");
const logger_1 = require("@/utils/logger");
class DatabaseManager {
    constructor() {
        this.db = new better_sqlite3_1.default(config_1.databaseConfig.path);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.initializeTables();
    }
    initializeTables() {
        try {
            this.db.exec(`
        CREATE TABLE IF NOT EXISTS trades (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          side TEXT NOT NULL CHECK(side IN ('BUY', 'SELL')),
          quantity REAL NOT NULL,
          price REAL NOT NULL,
          timestamp INTEGER NOT NULL,
          order_id TEXT,
          exchange TEXT NOT NULL CHECK(exchange IN ('binance', 'bitkub')),
          type TEXT NOT NULL CHECK(type IN ('MARKET', 'LIMIT')),
          status TEXT NOT NULL CHECK(status IN ('PENDING', 'FILLED', 'CANCELLED', 'FAILED')),
          fees REAL,
          notes TEXT
        )
      `);
            this.db.exec(`
        CREATE TABLE IF NOT EXISTS positions (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          quantity REAL NOT NULL,
          entry_price REAL NOT NULL,
          current_price REAL NOT NULL,
          unrealized_pnl REAL NOT NULL DEFAULT 0,
          realized_pnl REAL NOT NULL DEFAULT 0,
          timestamp INTEGER NOT NULL,
          exchange TEXT NOT NULL CHECK(exchange IN ('binance', 'bitkub')),
          stop_loss REAL,
          take_profit REAL,
          status TEXT NOT NULL CHECK(status IN ('OPEN', 'CLOSED'))
        )
      `);
            this.db.exec(`
        CREATE TABLE IF NOT EXISTS ai_decisions (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          action TEXT NOT NULL CHECK(action IN ('BUY', 'SELL', 'HOLD')),
          confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
          reasoning TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          executed BOOLEAN NOT NULL DEFAULT FALSE,
          result TEXT CHECK(result IN ('PROFIT', 'LOSS', 'BREAK_EVEN')),
          model TEXT NOT NULL,
          input_data TEXT
        )
      `);
            this.db.exec(`
        CREATE TABLE IF NOT EXISTS market_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          price REAL NOT NULL,
          volume REAL NOT NULL,
          high_24h REAL NOT NULL,
          low_24h REAL NOT NULL,
          change_24h REAL NOT NULL,
          timestamp INTEGER NOT NULL,
          exchange TEXT NOT NULL CHECK(exchange IN ('binance', 'bitkub')),
          UNIQUE(symbol, timestamp, exchange)
        )
      `);
            this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_trades_symbol_timestamp ON trades(symbol, timestamp);
        CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
        CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
        CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
        CREATE INDEX IF NOT EXISTS idx_ai_decisions_symbol_timestamp ON ai_decisions(symbol, timestamp);
        CREATE INDEX IF NOT EXISTS idx_market_data_symbol_timestamp ON market_data(symbol, timestamp);
      `);
            logger_1.logger.info('Database tables initialized successfully');
        }
        catch (error) {
            logger_1.logger.error('Failed to initialize database tables', error);
            throw error;
        }
    }
    insertTrade(trade) {
        const id = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const stmt = this.db.prepare(`
      INSERT INTO trades (
        id, symbol, side, quantity, price, timestamp, order_id,
        exchange, type, status, fees, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(id, trade.symbol, trade.side, trade.quantity, trade.price, trade.timestamp, trade.order_id, trade.exchange, trade.type, trade.status, trade.fees, trade.notes);
        return id;
    }
    getTrades(symbol, limit = 100) {
        let query = 'SELECT * FROM trades';
        const params = [];
        if (symbol) {
            query += ' WHERE symbol = ?';
            params.push(symbol);
        }
        query += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);
        return this.db.prepare(query).all(...params);
    }
    insertPosition(position) {
        const id = `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const stmt = this.db.prepare(`
      INSERT INTO positions (
        id, symbol, quantity, entry_price, current_price,
        unrealized_pnl, realized_pnl, timestamp, exchange,
        stop_loss, take_profit, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(id, position.symbol, position.quantity, position.entry_price, position.current_price, position.unrealized_pnl, position.realized_pnl, position.timestamp, position.exchange, position.stop_loss, position.take_profit, position.status);
        return id;
    }
    updatePosition(id, updates) {
        const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'timestamp');
        if (fields.length === 0)
            return;
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = fields.map(field => updates[field]);
        const stmt = this.db.prepare(`
      UPDATE positions SET ${setClause} WHERE id = ?
    `);
        stmt.run(...values, id);
    }
    getOpenPositions() {
        return this.db.prepare('SELECT * FROM positions WHERE status = ?').all('OPEN');
    }
    getPositionBySymbol(symbol) {
        return this.db.prepare('SELECT * FROM positions WHERE symbol = ? AND status = ?').get(symbol, 'OPEN');
    }
    insertAIDecision(decision) {
        const id = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const stmt = this.db.prepare(`
      INSERT INTO ai_decisions (
        id, symbol, action, confidence, reasoning, timestamp,
        executed, result, model, input_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(id, decision.symbol, decision.action, decision.confidence, decision.reasoning, decision.timestamp, decision.executed ? 1 : 0, decision.result, decision.model, decision.input_data);
        return id;
    }
    getAIDecisions(symbol, limit = 50) {
        let query = 'SELECT * FROM ai_decisions';
        const params = [];
        if (symbol) {
            query += ' WHERE symbol = ?';
            params.push(symbol);
        }
        query += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);
        return this.db.prepare(query).all(...params);
    }
    insertMarketData(data) {
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO market_data (
        symbol, price, volume, high_24h, low_24h, change_24h, timestamp, exchange
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(data.symbol, data.price, data.volume, data.high_24h, data.low_24h, data.change_24h, data.timestamp, data.exchange);
    }
    getLatestMarketData(symbol, exchange) {
        return this.db.prepare(`
      SELECT * FROM market_data
      WHERE symbol = ? AND exchange = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(symbol, exchange);
    }
    getHistoricalData(symbol, exchange, startTime, endTime) {
        return this.db.prepare(`
      SELECT * FROM market_data
      WHERE symbol = ? AND exchange = ? AND timestamp BETWEEN ? AND ?
      ORDER BY timestamp ASC
    `).all(symbol, exchange, startTime, endTime);
    }
    cleanupOldData(retentionDays = 90) {
        const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
        const marketDataStmt = this.db.prepare('DELETE FROM market_data WHERE timestamp < ?');
        const deletedRows = marketDataStmt.run(cutoffTime);
        logger_1.logger.info(`Cleaned up ${deletedRows.changes} old market data records`);
    }
    close() {
        this.db.close();
    }
}
exports.db = new DatabaseManager();
exports.default = exports.db;
//# sourceMappingURL=database.js.map