interface TradeRow {
    id: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    timestamp: number;
    order_id?: string;
    exchange: 'binance' | 'bitkub';
    type: 'MARKET' | 'LIMIT';
    status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'FAILED';
    fees?: number;
    notes?: string;
}
interface PositionRow {
    id: string;
    symbol: string;
    quantity: number;
    entry_price: number;
    current_price: number;
    unrealized_pnl: number;
    realized_pnl: number;
    timestamp: number;
    exchange: 'binance' | 'bitkub';
    stop_loss?: number;
    take_profit?: number;
    status: 'OPEN' | 'CLOSED';
}
interface AIDecisionRow {
    id: string;
    symbol: string;
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    reasoning: string;
    timestamp: number;
    executed: boolean;
    result?: 'PROFIT' | 'LOSS' | 'BREAK_EVEN';
    model: string;
    input_data: string;
}
interface MarketDataRow {
    id: number;
    symbol: string;
    price: number;
    volume: number;
    high_24h: number;
    low_24h: number;
    change_24h: number;
    timestamp: number;
    exchange: 'binance' | 'bitkub';
}
declare class DatabaseManager {
    private db;
    constructor();
    private initializeTables;
    insertTrade(trade: Omit<TradeRow, 'id'>): string;
    getTrades(symbol?: string, limit?: number): TradeRow[];
    insertPosition(position: Omit<PositionRow, 'id'>): string;
    updatePosition(id: string, updates: Partial<Omit<PositionRow, 'id' | 'timestamp'>>): void;
    getOpenPositions(): PositionRow[];
    getPositionBySymbol(symbol: string): PositionRow | undefined;
    insertAIDecision(decision: Omit<AIDecisionRow, 'id'>): string;
    getAIDecisions(symbol?: string, limit?: number): AIDecisionRow[];
    insertMarketData(data: Omit<MarketDataRow, 'id'>): void;
    getLatestMarketData(symbol: string, exchange: 'binance' | 'bitkub'): MarketDataRow | undefined;
    getHistoricalData(symbol: string, exchange: 'binance' | 'bitkub', startTime: number, endTime: number): MarketDataRow[];
    cleanupOldData(retentionDays?: number): void;
    close(): void;
}
export declare const db: DatabaseManager;
export default db;
//# sourceMappingURL=database.d.ts.map