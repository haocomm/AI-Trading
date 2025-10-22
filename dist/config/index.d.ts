import { TradingConfig, ExchangeConfig, AIConfig, AlertConfig } from '@/types';
export declare const tradingConfig: TradingConfig;
export declare const exchangeConfig: ExchangeConfig;
export declare const aiConfig: AIConfig;
export declare const alertConfig: AlertConfig;
export declare const databaseConfig: {
    path: string;
};
export declare const loggingConfig: {
    level: string;
    file: string;
};
export declare const dashboardConfig: {
    port: number;
    enabled: boolean;
};
export declare function validateConfig(): void;
export declare const isDevelopment: boolean;
export declare const isProduction: boolean;
export declare const isTest: boolean;
//# sourceMappingURL=index.d.ts.map