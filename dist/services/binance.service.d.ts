import { OrderRequest, OrderResponse, BinanceTicker } from '@/types';
export declare class BinanceService {
    private client;
    private webSockets;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    constructor();
    testConnection(): Promise<boolean>;
    getAccountInfo(): Promise<any>;
    getBalance(asset?: string): Promise<number>;
    getTicker(symbol: string): Promise<BinanceTicker>;
    get24hrStats(symbol: string): Promise<any>;
    createOrder(orderRequest: OrderRequest): Promise<OrderResponse>;
    cancelOrder(symbol: string, orderId: string): Promise<any>;
    getOrderStatus(symbol: string, orderId: string): Promise<any>;
    getOpenOrders(symbol?: string): Promise<any[]>;
    startPriceWebSocket(symbols: string[], callback: (symbol: string, price: number) => void): void;
    private reconnectWebSocket;
    stopPriceWebSocket(symbol: string): void;
    stopAllWebSockets(): void;
    private validateOrderRequest;
    getSymbolInfo(symbol: string): Promise<any>;
    formatQuantity(symbol: string, quantity: number): number;
    formatPrice(symbol: string, price: number): number;
}
export default BinanceService;
//# sourceMappingURL=binance.service.d.ts.map